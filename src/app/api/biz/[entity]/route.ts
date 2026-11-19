import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getBizStore } from '@/lib/biz/store';
import { loadCustomerViews } from '@/lib/biz/service';
import { bizError } from '@/lib/biz/http';
import { CustomerBody, ENTITY_PERMS, MovementBody, OrderBody, ProductBody, SupplierBody, zodMessage } from '@/lib/biz/schemas';

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const perm = ENTITY_PERMS[entity];
  if (!perm) return NextResponse.json({ error: 'Unknown record type' }, { status: 404 });
  const v = await requireViewer(perm.view);
  if (v instanceof NextResponse) return v;
  const store = getBizStore();
  try {
    switch (entity) {
      case 'customers':
        return NextResponse.json({ customers: await loadCustomerViews() });
      case 'products': {
        const [products, suppliers] = await Promise.all([store.listProducts(), can(v, 'suppliers.view') || can(v, 'inventory.view') ? store.listSuppliers() : []]);
        return NextResponse.json({ products, suppliers: suppliers.map((s) => ({ id: s.id, name: s.name })) });
      }
      case 'inventory': {
        const [movements, products] = await Promise.all([store.listMovements(), store.listProducts()]);
        return NextResponse.json({ movements, products });
      }
      case 'suppliers': {
        const [suppliers, products] = await Promise.all([store.listSuppliers(), store.listProducts()]);
        const counts = new Map<string, { skus: number; units: number }>();
        for (const p of products) {
          if (!p.supplier_id) continue;
          const c = counts.get(p.supplier_id) || { skus: 0, units: 0 };
          c.skus++;
          c.units += p.stock_qty;
          counts.set(p.supplier_id, c);
        }
        return NextResponse.json({ suppliers: suppliers.map((s) => ({ ...s, ...(counts.get(s.id) || { skus: 0, units: 0 }) })) });
      }
      case 'orders': {
        const [orders, customers, products] = await Promise.all([store.listOrders(), store.listCustomers(), store.listProducts()]);
        const cust = new Map(customers.map((c) => [c.id, { name: c.name, wa_id: c.wa_id, country: c.country }]));
        return NextResponse.json({
          orders: orders.map((o) => ({ ...o, customer: o.contact_id ? cust.get(o.contact_id) ?? null : null })),
          // For the "new order" form: pick lists.
          customers: customers.map((c) => ({ id: c.id, name: c.name, wa_id: c.wa_id, country: c.country })),
          products: products.filter((p) => p.active).map((p) => ({ id: p.id, sku: p.sku, brand: p.brand, model: p.model, variant: p.variant, sale_price: p.sale_price, stock_qty: p.stock_qty, currency: p.currency })),
        });
      }
    }
  } catch (e) {
    return bizError(e);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { entity } = await params;
  const perm = ENTITY_PERMS[entity];
  if (!perm) return NextResponse.json({ error: 'Unknown record type' }, { status: 404 });
  const v = await requireViewer(perm.manage);
  if (v instanceof NextResponse) return v;
  const body = await req.json().catch(() => null);
  const store = getBizStore();
  try {
    switch (entity) {
      case 'customers': {
        const p = CustomerBody.safeParse(body);
        if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
        return NextResponse.json({ customer: await store.createCustomer(p.data as any) });
      }
      case 'suppliers': {
        const p = SupplierBody.safeParse(body);
        if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
        return NextResponse.json({ supplier: await store.saveSupplier(null, p.data as any) });
      }
      case 'products': {
        const p = ProductBody.safeParse(body);
        if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
        const { opening_stock, ...data } = p.data;
        const product = await store.saveProduct(null, data as any);
        if (opening_stock) {
          await store.addMovement({ product_id: product.id, type: 'in', quantity: opening_stock, unit_cost: product.cost_price, note: 'Opening stock', created_by: v.id });
          product.stock_qty += opening_stock;
        }
        return NextResponse.json({ product });
      }
      case 'inventory': {
        const p = MovementBody.safeParse(body);
        if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
        const d = p.data;
        // "in"/"return" always add stock, "out" always removes; "adjustment" keeps its sign.
        const qty = d.type === 'in' || d.type === 'return' ? Math.abs(d.quantity) : d.type === 'out' ? -Math.abs(d.quantity) : d.quantity;
        return NextResponse.json({ movement: await store.addMovement({ ...d, quantity: qty, created_by: v.id } as any) });
      }
      case 'orders': {
        const p = OrderBody.safeParse(body);
        if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
        if (p.data.payment_status && p.data.payment_status !== 'unpaid' && !can(v, 'payments.manage')) {
          return NextResponse.json({ error: 'You do not have permission to set payment status' }, { status: 403 });
        }
        return NextResponse.json({ order: await store.createOrder({ ...(p.data as any), source: 'dashboard', created_by: v.id }) });
      }
    }
  } catch (e) {
    return bizError(e);
  }
}
