import { NextRequest, NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getBizStore } from '@/lib/biz/store';
import { inventoryAnalytics, salesAnalytics } from '@/lib/biz/logic';
import { bizError } from '@/lib/biz/http';

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
      out.sales = salesAnalytics(orders, products, customers, days);
    }
    if ((kind === 'inventory' || kind === 'all') && can(viewer, 'inventory.view')) {
      const [products, movements] = await Promise.all([store.listProducts(), store.listMovements()]);
      out.inventory = inventoryAnalytics(products, movements, days);
    }
    if (!out.sales && !out.inventory) return NextResponse.json({ error: 'You do not have permission to see analytics' }, { status: 403 });
    return NextResponse.json(out);
  } catch (e) {
    return bizError(e);
  }
}
