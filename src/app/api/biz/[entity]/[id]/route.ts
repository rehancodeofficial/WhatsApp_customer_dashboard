import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';
import { CustomerPatch, ENTITY_PERMS, OrderPatch, ProductPatch, SupplierPatch, zodMessage } from '@/lib/biz/schemas';
import { onProductDeleted, watchInventory } from '@/lib/biz/inventory-sync';
import { pushSupplier, removeSupplier } from '@/lib/biz/supplier-sync';
import { logActivity } from '@/lib/security';

type Ctx = { params: Promise<{ entity: string; id: string }> };

// GET /api/biz/customers/:id → what the customer asked for over time (Customer_Leads history).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { entity, id } = await params;
  if (entity !== 'customers') return NextResponse.json({ error: 'Not supported' }, { status: 404 });
  const v = await requireViewer('customers.view');
  if (v instanceof NextResponse) return v;
  try {
    const inquiries = (await getBizStore().listRows<any>('customer_inquiries')).filter((i) => i.contact_id === id);
    return NextResponse.json({ inquiries });
  } catch (e) {
    return bizError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { entity, id } = await params;
  const perm = ENTITY_PERMS[entity];
  if (!perm || entity === 'inventory') return NextResponse.json({ error: 'Not supported' }, { status: 404 });
  const body = await req.json().catch(() => null);
  // Orders: status needs orders.manage, payment status needs payments.manage.
  if (entity === 'orders') {
    const v = await requireViewer('orders.view');
    if (v instanceof NextResponse) return v;
    const p = OrderPatch.safeParse(body);
    if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
    if ((p.data.status || p.data.notes !== undefined) && !can(v, 'orders.manage')) return NextResponse.json({ error: 'You do not have permission to change orders' }, { status: 403 });
    if (p.data.payment_status && !can(v, 'payments.manage') && !can(v, 'orders.manage')) return NextResponse.json({ error: 'You do not have permission to change payment status' }, { status: 403 });
    try {
      const order = await watchInventory('dashboard', () => getBizStore().updateOrder(id, p.data as any));
      await logActivity(v, 'order.updated', { order_no: (order as any)?.order_no, ...p.data });
      return NextResponse.json({ order });
    } catch (e) {
      return bizError(e);
    }
  }
  const v = await requireViewer(perm.manage);
  if (v instanceof NextResponse) return v;
  const store = getBizStore();
  try {
    if (entity === 'customers') {
      const p = CustomerPatch.safeParse(body);
      if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
      const customer = await store.updateCustomer(id, p.data as any);
      await logActivity(v, 'customer.updated', { name: (customer as any)?.name, fields: Object.keys(p.data) });
      return NextResponse.json({ customer });
    }
    if (entity === 'suppliers') {
      const p = SupplierPatch.safeParse(body);
      if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
      const supplier = await store.saveSupplier(id, p.data as any);
      await pushSupplier(supplier);
      await logActivity(v, 'supplier.updated', { code: supplier.code, fields: Object.keys(p.data) });
      return NextResponse.json({ supplier });
    }
    const p = ProductPatch.safeParse(body);
    if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
    const product = await watchInventory('dashboard', () => store.saveProduct(id, p.data as any));
    await logActivity(v, 'inventory.product_updated', { id: product.sku, fields: Object.keys(p.data) });
    return NextResponse.json({ product });
  } catch (e) {
    return bizError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { entity, id } = await params;
  if (entity !== 'products' && entity !== 'suppliers') return NextResponse.json({ error: 'Not supported' }, { status: 404 });
  const v = await requireViewer(ENTITY_PERMS[entity].manage);
  if (v instanceof NextResponse) return v;
  try {
    if (entity === 'products') {
      const product = (await getBizStore().listProducts()).find((p) => p.id === id);
      await getBizStore().deleteProduct(id);
      if (product) await onProductDeleted(product);
      await logActivity(v, 'inventory.product_deleted', { id: product?.sku, name: product ? `${product.brand} ${product.model}` : id });
    } else {
      const supplier = (await getBizStore().listSuppliers()).find((x) => x.id === id);
      await getBizStore().deleteSupplier(id);
      await removeSupplier(supplier?.code);
      await logActivity(v, 'supplier.deleted', { code: supplier?.code, name: supplier?.name });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    return bizError(e);
  }
}
