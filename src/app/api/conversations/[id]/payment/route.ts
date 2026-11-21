import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';
import { getBizStore } from '@/lib/biz/store';
import type { Order } from '@/lib/biz/types';
import { callN8nBridge } from '@/lib/n8n-bridge';
import { n8nBridgeEnabled, OWNER_WHATSAPP_NUMBER } from '@/lib/config';
import { checkOwnerPassword } from '@/lib/owner-password';
import { logActivity } from '@/lib/security';

export const maxDuration = 30;

/** The customer's current order: the newest one not paid yet (and not cancelled / refunded). */
async function currentOrder(contactId: string): Promise<Order | null> {
  const orders = (await getBizStore().listOrders()).filter((o) => o.contact_id === contactId);
  const open = orders.filter((o) => o.status !== 'cancelled' && o.payment_status !== 'paid' && o.payment_status !== 'refunded' && o.status !== 'paid');
  const byNew = (a: Order, b: Order) => String(b.created_at).localeCompare(String(a.created_at));
  return open.sort(byNew)[0] || null;
}

const summary = (o: Order) => ({ id: o.id, order_no: o.order_no, status: o.status, payment_status: o.payment_status, total: o.total, currency: o.currency, created_at: o.created_at, items: (o.items || []).map((i: any) => `${i.quantity} × ${i.description}`).slice(0, 6) });

async function load(id: string, perm: string) {
  const viewer = await requireViewer(perm as any);
  if (viewer instanceof NextResponse) return { error: viewer };
  const conv = (await getRepo().getConversation(viewer, id, { markRead: false }))?.conversation;
  if (!conv) return { error: NextResponse.json({ error: 'Conversation not found' }, { status: 404 }) };
  return { viewer, conv };
}

// GET: the order the "Verify payment" button would mark as paid.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id, 'chats.view');
  if (r.error) return r.error;
  const o = await currentOrder(r.conv.contact_id);
  return NextResponse.json({ order: o ? summary(o) : null });
}

const Body = z.object({ order_id: z.string().min(1), password: z.string().max(200).optional() });

// POST: owner confirmed with their password → same as the owner sending "PAYMENT VERIFIED ORD-..." on WhatsApp:
// n8n marks the order paid, turns the AI back on and sends the customer the thank-you-for-payment message.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id, 'ai.toggle');
  if (r.error) return r.error;
  const { viewer, conv } = r;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Choose the order' }, { status: 400 });
  const bad = await checkOwnerPassword(viewer.id, p.data.password);
  if (bad) return NextResponse.json({ error: bad, password_required: true }, { status: 403 });

  const o = await currentOrder(conv.contact_id);
  if (!o || o.id !== p.data.order_id) return NextResponse.json({ error: 'This order is no longer waiting for payment. Refresh the chat.' }, { status: 409 });
  if (!n8nBridgeEnabled()) return NextResponse.json({ error: 'n8n is not connected, payment could not be verified' }, { status: 503 });

  try {
    const res = await callN8nBridge('payment_verified', { order_no: o.order_no, owner_number: OWNER_WHATSAPP_NUMBER }, 20000);
    if (res?.ok === false || res?.error) throw new Error(String(res?.error || 'n8n refused'));
  } catch (e: any) {
    return NextResponse.json({ error: 'Could not reach n8n: ' + (e?.message || e) }, { status: 502 });
  }
  // Show it right away; n8n also writes the order and the mode back.
  const store = getBizStore();
  const order = await store.updateOrder(o.id, { payment_status: 'paid' }).catch(() => o);
  const conversation = await getRepo().setMode(conv.id, 'ai', viewer.id, `Payment verified for ${o.order_no} from the dashboard, AI back on`, null);
  await logActivity(viewer, 'order.payment_verified', { order_no: o.order_no, conversation_id: conv.id });
  return NextResponse.json({ success: true, order: summary(order), conversation });
}
