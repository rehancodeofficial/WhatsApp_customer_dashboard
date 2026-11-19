import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkN8nSecret } from '@/lib/config';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';
import { zodMessage } from '@/lib/biz/schemas';

// n8n "Save Order" (replaces writing the order row to the Google Sheet).
// Items are matched by sku, or by "brand model" text when no sku is given.
const Body = z.object({
  wa_id: z.string().transform((v) => v.replace(/[^0-9]/g, '')).pipe(z.string().min(7)),
  status: z.enum(['pending', 'confirmed', 'paid', 'shipped', 'delivered', 'cancelled']).optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z
    .array(
      z.object({
        sku: z.string().optional(),
        product: z.string().optional(), // free text, e.g. "iPhone 15 Pro Max 256GB"
        quantity: z.coerce.number().int().min(1),
        unit_price: z.coerce.number().min(0).optional(),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
  const store = getBizStore();
  try {
    const [customers, products] = await Promise.all([store.listCustomers(), store.listProducts()]);
    let customer = customers.find((c) => c.wa_id === p.data.wa_id);
    if (!customer) customer = await store.createCustomer({ wa_id: p.data.wa_id });
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const items = p.data.items.map((it) => {
      const prod =
        (it.sku && products.find((x) => x.sku.toLowerCase() === it.sku!.toLowerCase())) ||
        (it.product && products.find((x) => norm(`${x.brand} ${x.model} ${x.variant || ''}`).includes(norm(it.product!)))) ||
        (it.product && products.find((x) => norm(it.product!).includes(norm(`${x.model} ${x.variant || ''}`)))) ||
        null;
      return {
        product_id: prod?.id ?? null,
        description: prod ? `${prod.brand} ${prod.model} ${prod.variant || ''}`.trim() : it.product || it.sku || 'Item',
        quantity: it.quantity,
        unit_price: it.unit_price ?? prod?.sale_price ?? 0,
      };
    });
    const order = await store.createOrder({ contact_id: customer.id, status: p.data.status, payment_status: p.data.payment_status, notes: p.data.notes, source: 'whatsapp_ai', items });
    return NextResponse.json({ success: true, order_no: order.order_no, order_id: order.id, total: order.total, unmatched: items.filter((i) => !i.product_id).map((i) => i.description) });
  } catch (e) {
    return bizError(e);
  }
}
