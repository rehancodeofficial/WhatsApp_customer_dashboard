import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';
import { readRows, type SheetRow } from '@/lib/biz/sheet-store';
import { callN8nBridge } from '@/lib/n8n-bridge';
import { n8nBridgeEnabled } from '@/lib/config';
import { checkOwnerPassword } from '@/lib/owner-password';
import { logActivity } from '@/lib/security';

export const maxDuration = 30;

// A supplier order waits for delivery after the owner selected that supplier's quote.
const WAITING = ['Selected', 'Payment Requested'];
const digits = (v: unknown) => String(v ?? '').replace(/[^0-9]/g, '');

/** This supplier's orders waiting for delivery (Supplier_Quotes rows), newest first. */
async function waitingOrders(waId: string) {
  const rows = await readRows('Supplier_Quotes');
  return rows
    .filter((r: SheetRow) => digits(r.WhatsApp_Number) === digits(waId) && WAITING.includes(String(r.Quote_Status || '')) && r.Request_ID && r.Supplier_ID)
    .sort((a, b) => String(b.Request_ID).localeCompare(String(a.Request_ID)))
    .map((r) => ({
      request_id: String(r.Request_ID).toUpperCase(),
      supplier_id: String(r.Supplier_ID).toUpperCase(),
      product: [r.Brand, r.Model, r.Storage, r.Grade ? 'Grade ' + r.Grade : '', r.Color].filter(Boolean).join(' '),
      quantity: String(r.Requested_Qty || r.Available_Qty || ''),
      price: String(r.Price_Per_Unit || ''),
      currency: String(r.Currency || 'USD'),
      status: String(r.Quote_Status || ''),
    }));
}

async function load(id: string, perm: string) {
  const viewer = await requireViewer(perm as any);
  if (viewer instanceof NextResponse) return { error: viewer };
  const conv = (await getRepo().getConversation(viewer, id, { markRead: false }))?.conversation;
  if (!conv || conv.contact?.kind !== 'supplier' || !conv.contact?.wa_id) return { error: NextResponse.json({ error: 'Supplier chat not found' }, { status: 404 }) };
  return { viewer, conv, waId: conv.contact.wa_id };
}

// GET: supplier orders the "Order delivered" button can close.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id, 'chats.view');
  if (r.error) return r.error;
  return NextResponse.json({ orders: await waitingOrders(r.waId) });
}

const Body = z.object({ request_id: z.string().min(1).max(60), password: z.string().max(200).optional() });

// POST: owner confirmed with their password → same as the owner writing "DELIVERED SR-..." on WhatsApp:
// n8n marks the quote delivered, adds the stock to Inventory, thanks the supplier in their language
// and sends the waiting customer the back-in-stock follow-up.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id, 'ai.toggle');
  if (r.error) return r.error;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Choose the order' }, { status: 400 });
  const bad = await checkOwnerPassword(r.viewer.id, p.data.password);
  if (bad) return NextResponse.json({ error: bad, password_required: true }, { status: 403 });

  const o = (await waitingOrders(r.waId)).find((x) => x.request_id === p.data.request_id.toUpperCase());
  if (!o) return NextResponse.json({ error: 'This order is no longer waiting for delivery. Refresh the chat.' }, { status: 409 });
  if (!n8nBridgeEnabled()) return NextResponse.json({ error: 'n8n is not connected, delivery could not be confirmed' }, { status: 503 });
  try {
    const res = await callN8nBridge('supplier_delivered', { request_id: o.request_id, supplier_id: o.supplier_id }, 20000);
    if (res?.ok === false || res?.error) throw new Error(String(res?.error || 'n8n refused'));
  } catch (e: any) {
    return NextResponse.json({ error: 'Could not reach n8n: ' + (e?.message || e) }, { status: 502 });
  }
  await logActivity(r.viewer, 'supplier.order_delivered', { request_id: o.request_id, supplier_id: o.supplier_id, conversation_id: r.conv.id });
  return NextResponse.json({ success: true, order: o });
}
