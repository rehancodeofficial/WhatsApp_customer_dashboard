import { NextRequest, NextResponse } from 'next/server';
import { checkN8nSecret } from '@/lib/config';
import { addOwnerStock, parseStockItems } from '@/lib/biz/owner-stock';

// n8n: owner sent "STOCK ..." on WhatsApp. Body { items } (array) or { ai: "<model answer with JSON>" }.
// Answers { ok, added, problems, message } — n8n sends `message` back to the owner.
export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const items = parseStockItems(body?.items ?? body?.ai);
  if (!items.length) {
    return NextResponse.json({
      ok: false,
      need_more: true,
      added: [],
      problems: ['No stock details yet'],
      message:
        '📝 Sure, which stock should I add? Please send: brand, model, storage, color, grade (A+, A, B or C), quantity, cost price and sale price.\nFor example: iPhone 15 Pro 256GB Black Grade A 50 pcs cost 1100 sale 1200',
    });
  }
  if (items.length > 30) return NextResponse.json({ ok: false, message: '❌ At most 30 items per message.' });
  try {
    return NextResponse.json(await addOwnerStock(items));
  } catch (e: any) {
    console.error('owner stock failed', e);
    return NextResponse.json({ ok: false, added: [], problems: [String(e?.message || e)], message: '❌ Stock could not be saved: ' + String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
