import { NextRequest, NextResponse } from 'next/server';
import { checkN8nSecret } from '@/lib/config';
import { readRows, resolveTab, writeRow, type WriteOp } from '@/lib/biz/sheet-store';
import { resolveSheet, syncRows } from '@/lib/biz/sheet-sync';
import { watchInventory } from '@/lib/biz/inventory-sync';

// Replaces the Google Sheets nodes of the n8n workflow (same node names, same columns).
//
// POST /api/n8n/sheet/<Tab>  body (n8n "keypair" body):
//   read:   { __op: 'read', __col?: 'WhatsApp_Number', __val?: '9715…', __first?: true }
//   write:  { __op: 'append' | 'update' | 'appendOrUpdate', __match?: 'Lead_ID', <Column>: <value>, … }
//           or { __op, __match, __auto: '<JSON of the whole row>' } for "Map automatically" nodes.
// Answers with a JSON array of rows (n8n turns it into one item per row).
//
// GET /api/n8n/sheet/<Tab>  → every row (used by the AI agent's tools: Inventory, FAQ, ...).
/**
 * Inventory for the AI: ?currency=PKR&rate=276.46&decimals=0 (sent by n8n once the delivery country is known)
 * adds the price per piece already converted, so the AI never multiplies exchange rates itself.
 * Sale_Price stays in USD (the inventory currency).
 */
function withCustomerPrice(rows: Record<string, unknown>[], q: URLSearchParams) {
  const currency = String(q.get('currency') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const rate = Number(q.get('rate'));
  const decimals = Math.min(2, Math.max(0, Number(q.get('decimals') ?? 2) || 0));
  return rows.map((r) => {
    const usd = Number(String(r.Sale_Price ?? '').replace(/[^0-9.]/g, ''));
    const out: Record<string, unknown> = { ...r, Sale_Price_Currency: 'USD' };
    if (currency && rate > 0 && usd > 0) {
      const f = 10 ** decimals;
      out.Customer_Currency = currency;
      out.Customer_Price_Per_Piece = Math.round(usd * rate * f) / f;
    }
    return out;
  });
}

const truthy = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';

function auth(req: NextRequest) {
  return checkN8nSecret(req.headers.get('x-n8n-secret'));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ sheet: string }> }) {
  if (!auth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tab = resolveTab((await params).sheet);
  if (!tab) return NextResponse.json({ error: 'Unknown sheet' }, { status: 404 });
  try {
    const rows = await readRows(tab);
    // The AI tools only need the content, not internal row numbers.
    const clean = rows.map(({ row_number, ...r }) => r);
    if (tab === 'Inventory') return NextResponse.json(withCustomerPrice(clean, req.nextUrl.searchParams));
    return NextResponse.json(clean);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sheet: string }> }) {
  if (!auth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tab = resolveTab((await params).sheet);
  if (!tab) return NextResponse.json({ error: 'Unknown sheet' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send a JSON object' }, { status: 400 });
  const op = String(body.__op || 'read');
  try {
    if (op === 'read') {
      const col = body.__col == null ? '' : String(body.__col).trim();
      if (col && (body.__val == null || String(body.__val).trim() === '')) return NextResponse.json([]);
      return NextResponse.json(await readRows(tab, { column: col || undefined, value: body.__val, first: truthy(body.__first) }));
    }
    if (!['append', 'update', 'appendOrUpdate'].includes(op)) return NextResponse.json({ error: 'Unknown __op' }, { status: 400 });
    let row: Record<string, unknown> = {};
    if (body.__auto != null) {
      const auto = typeof body.__auto === 'string' ? JSON.parse(body.__auto || '{}') : body.__auto;
      if (auto && typeof auto === 'object') row = { ...(auto as Record<string, unknown>) };
    }
    for (const [k, v] of Object.entries(body)) if (!k.startsWith('__')) row[k] = v;
    const match = body.__match ? String(body.__match) : null;

    const typed = resolveSheet(tab);
    const run = async () => {
      const written = await writeRow(tab, op as WriteOp, match, row);
      // Keep the dashboard pages (customers, orders, inventory, suppliers, ...) in step.
      if (typed && written[0] && 'row_number' in written[0]) {
        const { row_number, ...full } = written[0];
        const res = await syncRows(typed, [full]).catch((e) => [{ ok: false, error: String(e?.message || e) }]);
        const bad = (res as any[]).find((r) => !r.ok);
        if (bad) console.warn(`sheet ${tab}: dashboard sync skipped:`, bad.error);
      }
      return written;
    };
    const written = tab === 'Inventory' || tab === 'Orders' || tab === 'Order_Items' ? await watchInventory('n8n', run) : await run();
    return NextResponse.json(written);
  } catch (e: any) {
    console.error('sheet api failed', tab, op, e);
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 });
  }
}
