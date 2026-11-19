import { NextRequest, NextResponse } from 'next/server';
import { checkN8nSecret } from '@/lib/config';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';

// n8n "Inventory" tool for the AI agent (replaces reading the Inventory sheet).
// GET /api/n8n/inventory?q=iphone 15  → products in stock with price.
export async function GET(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = (req.nextUrl.searchParams.get('q') || '').toLowerCase().trim();
  try {
    const products = (await getBizStore().listProducts()).filter((p) => p.active && p.stock_qty > 0);
    const words = q.split(/\s+/).filter(Boolean);
    const hits = products.filter((p) => {
      const text = `${p.sku} ${p.brand} ${p.model} ${p.variant || ''} ${p.condition}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
    return NextResponse.json({
      products: hits.slice(0, 50).map((p) => ({ sku: p.sku, brand: p.brand, model: p.model, variant: p.variant, condition: p.condition, price: p.sale_price, currency: p.currency, in_stock: p.stock_qty })),
    });
  } catch (e) {
    return bizError(e);
  }
}
