import { NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';

// Supplier price requests, quotes and demands (the Supplier_* sheets).
export async function GET() {
  const v = await requireViewer('suppliers.view');
  if (v instanceof NextResponse) return v;
  const store = getBizStore();
  try {
    const [requests, quotes, demands, products] = await Promise.all([
      store.listRows('supplier_requests'),
      store.listRows('supplier_quotes'),
      store.listRows('supplier_demands'),
      store.listProducts(),
    ]);
    return NextResponse.json({ requests, quotes, demands, products: products.map((p) => ({ sku: p.sku, name: `${p.brand} ${p.model} ${p.variant || ''}`.trim() })) });
  } catch (e) {
    return bizError(e);
  }
}
