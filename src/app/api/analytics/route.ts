import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getBizStore } from '@/lib/biz/store';
import { inventoryAnalytics, salesAnalytics } from '@/lib/biz/logic';
import { bizError } from '@/lib/biz/http';
import { DEFAULT_CURRENCY } from '@/lib/currency';
import { getRates, toBase } from '@/lib/fx';
import type { Product } from '@/lib/biz/types';

// ?days=7|30|90|180|365  &kind=sales|inventory|all
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get('days')) || 30));
  const kind = req.nextUrl.searchParams.get('kind') || 'all';
  const store = getBizStore();
  try {
    const out: Record<string, unknown> = { days };
    if ((kind === 'sales' || kind === 'all') && can(viewer, 'stats.view')) {
      const [orders, products, customers] = await Promise.all([store.listOrders(), store.listProducts(), store.listCustomers()]);
      // Add every order up in the dashboard currency (orders are in the customer's currency, e.g. PKR).
      const rates = await getRates(DEFAULT_CURRENCY);
      const productsInBase = convertProducts(products, rates);
      const skipped: string[] = [];
      const now = Date.now();
      const inBase = orders.flatMap((o) => {
        const k = (v: number) => toBase(v, o.currency, DEFAULT_CURRENCY, rates);
        const total = k(o.total);
        if (total === null) {
          skipped.push(o.order_no);
          return [];
        }
        return [{
          ...o,
          currency: DEFAULT_CURRENCY,
          total,
          subtotal: k(o.subtotal) ?? 0,
          discount: k(o.discount) ?? 0,
          // A clock a few hours ahead must not hide today's orders.
          created_at: Date.parse(o.created_at) > now ? new Date(now).toISOString() : o.created_at,
          items: (o.items || []).map((it) => ({ ...it, unit_price: k(it.unit_price) ?? 0, line_total: k(it.line_total) ?? 0 })),
        }];
      });
      out.sales = salesAnalytics(inBase, productsInBase, customers, days);
      out.currency = DEFAULT_CURRENCY;
      if (skipped.length) out.notConverted = skipped;
    }
    if ((kind === 'inventory' || kind === 'all') && can(viewer, 'inventory.view')) {
      const [products, movements] = await Promise.all([store.listProducts(), store.listMovements()]);
      out.inventory = inventoryAnalytics(convertProducts(products, await getRates(DEFAULT_CURRENCY)), movements, days);
    }
    if (!out.sales && !out.inventory) return NextResponse.json({ error: 'You do not have permission to see analytics' }, { status: 403 });
    return NextResponse.json(out);
  } catch (e) {
    return bizError(e);
  }
}

/** Product cost / sale prices in the dashboard currency (inventory is kept in PKR). */
function convertProducts(products: Product[], rates: Record<string, number> | null): Product[] {
  return products.map((p) => {
    const k = (v: number) => toBase(v, p.currency, DEFAULT_CURRENCY, rates);
    const cost = k(p.cost_price);
    const sale = k(p.sale_price);
    return cost === null || sale === null ? p : { ...p, cost_price: cost, sale_price: sale, currency: DEFAULT_CURRENCY };
  });
}
