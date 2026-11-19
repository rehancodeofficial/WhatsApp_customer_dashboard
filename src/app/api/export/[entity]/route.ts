import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireViewer } from '@/lib/auth';
import type { Permission } from '@/lib/permissions';
import { getBizStore } from '@/lib/biz/store';
import { loadCustomerViews } from '@/lib/biz/service';
import { bizError } from '@/lib/biz/http';

type Col = { header: string; key: string; width?: number; money?: boolean; date?: boolean };
type Sheet = { name: string; cols: Col[]; rows: Record<string, unknown>[] };

const d = (v: unknown) => (v ? new Date(String(v)) : null);

// Each export: who may download it, and the sheet(s) it contains.
const EXPORTS: Record<string, { perm: Permission; file: string; build: () => Promise<Sheet[]> }> = {
  customers: {
    perm: 'customers.view',
    file: 'customers',
    build: async () => {
      const list = await loadCustomerViews();
      return [{
        name: 'Customers',
        cols: [
          { header: 'Lead ID', key: 'lead_id', width: 18 }, { header: 'Name', key: 'name', width: 24 }, { header: 'WhatsApp', key: 'wa_id', width: 16 },
          { header: 'Email', key: 'email', width: 24 }, { header: 'Company', key: 'company', width: 20 }, { header: 'Country', key: 'country', width: 14 },
          { header: 'City', key: 'city', width: 14 }, { header: 'Delivery address', key: 'delivery_address', width: 26 }, { header: 'Language', key: 'preferred_language', width: 12 },
          { header: 'Lead status', key: 'lead_status', width: 20 }, { header: 'Payment tier', key: 'tier', width: 12 }, { header: 'Brands', key: 'brands', width: 22 },
          { header: 'Orders', key: 'order_count', width: 8 }, { header: 'Total spent', key: 'total_spent', width: 14, money: true }, { header: 'Last order', key: 'last_order_at', width: 18, date: true },
          { header: 'Payment method', key: 'payment_method', width: 16 }, { header: 'Notes', key: 'notes', width: 40 }, { header: 'Created', key: 'created_at', width: 18, date: true },
        ],
        rows: list.map((c) => ({ ...c, brands: c.brands.join(', '), last_order_at: d(c.last_order_at), created_at: d(c.created_at) })),
      }];
    },
  },
  orders: {
    perm: 'orders.view',
    file: 'orders',
    build: async () => {
      const store = getBizStore();
      const [orders, customers] = await Promise.all([store.listOrders(), store.listCustomers()]);
      const cust = new Map(customers.map((c) => [c.id, c]));
      return [
        {
          name: 'Orders',
          cols: [
            { header: 'Order ID', key: 'order_no', width: 22 }, { header: 'Customer', key: 'customer', width: 24 }, { header: 'WhatsApp', key: 'wa_id', width: 16 },
            { header: 'Status', key: 'status', width: 12 }, { header: 'Payment', key: 'payment_status', width: 12 }, { header: 'Handoff', key: 'handoff_status', width: 12 },
            { header: 'Currency', key: 'currency', width: 9 }, { header: 'Subtotal', key: 'subtotal', width: 14, money: true }, { header: 'Discount', key: 'discount', width: 12, money: true },
            { header: 'Total', key: 'total', width: 14, money: true }, { header: 'Source', key: 'source', width: 12 }, { header: 'Created', key: 'created_at', width: 18, date: true }, { header: 'Notes', key: 'notes', width: 40 },
          ],
          rows: orders.map((o) => ({ ...o, customer: (o.contact_id && cust.get(o.contact_id)?.name) || '', wa_id: (o.contact_id && cust.get(o.contact_id)?.wa_id) || '', created_at: d(o.created_at) })),
        },
        {
          name: 'Order items',
          cols: [
            { header: 'Order ID', key: 'order_no', width: 22 }, { header: 'Item', key: 'description', width: 40 }, { header: 'Grade', key: 'grade', width: 8 },
            { header: 'Quantity', key: 'quantity', width: 10 }, { header: 'Unit price', key: 'unit_price', width: 14, money: true }, { header: 'Line total', key: 'line_total', width: 14, money: true },
          ],
          rows: orders.flatMap((o) => (o.items || []).map((i) => ({ ...i, order_no: o.order_no }))),
        },
      ];
    },
  },
  inventory: {
    perm: 'inventory.view',
    file: 'inventory',
    build: async () => {
      const store = getBizStore();
      const [products, suppliers, movements] = await Promise.all([store.listProducts(), store.listSuppliers(), store.listMovements()]);
      const sup = new Map(suppliers.map((s) => [s.id, s]));
      const byId = new Map(products.map((p) => [p.id, p]));
      return [
        {
          name: 'Stock',
          cols: [
            { header: 'ID / SKU', key: 'sku', width: 14 }, { header: 'Brand', key: 'brand', width: 12 }, { header: 'Model', key: 'model', width: 22 }, { header: 'Storage', key: 'storage', width: 10 },
            { header: 'Color', key: 'color', width: 14 }, { header: 'Grade', key: 'grade', width: 8 }, { header: 'Condition', key: 'condition', width: 12 }, { header: 'Warehouse', key: 'location', width: 18 },
            { header: 'Market region', key: 'market_region', width: 22 }, { header: 'On hand', key: 'stock_qty', width: 10 }, { header: 'Reserved', key: 'reserved_qty', width: 10 }, { header: 'Available', key: 'available', width: 10 },
            { header: 'Reorder level', key: 'reorder_level', width: 12 }, { header: 'Unit cost', key: 'cost_price', width: 14, money: true }, { header: 'Sale price', key: 'sale_price', width: 14, money: true },
            { header: 'Stock value (cost)', key: 'value', width: 16, money: true }, { header: 'Supplier', key: 'supplier', width: 22 }, { header: 'Active', key: 'active', width: 8 }, { header: 'Notes', key: 'notes', width: 30 },
          ],
          rows: products.map((p) => ({ ...p, available: p.stock_qty - (p.reserved_qty || 0), value: p.stock_qty * p.cost_price, supplier: (p.supplier_id && sup.get(p.supplier_id)?.name) || '', active: p.active ? 'Yes' : 'No' })),
        },
        {
          name: 'Movement log',
          cols: [
            { header: 'Date', key: 'created_at', width: 18, date: true }, { header: 'SKU', key: 'sku', width: 14 }, { header: 'Product', key: 'product', width: 34 }, { header: 'Type', key: 'type', width: 12 },
            { header: 'Quantity', key: 'quantity', width: 10 }, { header: 'Unit cost', key: 'unit_cost', width: 14, money: true }, { header: 'Reference', key: 'reference', width: 22 }, { header: 'Note', key: 'note', width: 30 },
          ],
          rows: movements.map((m) => {
            const p = byId.get(m.product_id);
            return { ...m, sku: p?.sku || '', product: p ? `${p.brand} ${p.model} ${p.variant || ''}`.trim() : '', created_at: d(m.created_at) };
          }),
        },
      ];
    },
  },
  suppliers: {
    perm: 'suppliers.view',
    file: 'suppliers',
    build: async () => {
      const list = await getBizStore().listSuppliers();
      return [{
        name: 'Suppliers',
        cols: [
          { header: 'Supplier ID', key: 'code', width: 12 }, { header: 'Name', key: 'name', width: 26 }, { header: 'Company', key: 'company', width: 24 }, { header: 'Contact person', key: 'contact_person', width: 18 },
          { header: 'WhatsApp', key: 'phone', width: 16 }, { header: 'Email', key: 'email', width: 26 }, { header: 'Country', key: 'country', width: 14 }, { header: 'Brands', key: 'brands', width: 24 },
          { header: 'Language', key: 'preferred_language', width: 12 }, { header: 'Rating', key: 'rating', width: 8 }, { header: 'Active', key: 'active', width: 8 }, { header: 'Notes', key: 'notes', width: 40 },
        ],
        rows: list.map((s) => ({ ...s, brands: s.brands.join(', '), active: s.active ? 'Yes' : 'No' })),
      }];
    },
  },
  sourcing: {
    perm: 'suppliers.view',
    file: 'supplier-requests',
    build: async () => {
      const store = getBizStore();
      const [requests, quotes, demands] = await Promise.all([store.listRows<any>('supplier_requests'), store.listRows<any>('supplier_quotes'), store.listRows<any>('supplier_demands')]);
      const cols = (keys: string[]) => keys.map((k) => ({ header: k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), key: k, width: Math.max(10, Math.min(36, k.length + 8)), date: /_at$|_date$/.test(k) }));
      const dates = (r: any) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, /_at$|_date$/.test(k) ? d(v) : v]));
      return [
        { name: 'Requests', cols: cols(['request_code', 'request_date', 'customer_name', 'wa_id', 'customer_market', 'brand', 'model', 'storage', 'grade', 'color', 'quantity', 'status', 'selected_supplier_code', 'expires_at', 'notes']), rows: requests.map(dates) },
        { name: 'Quotes', cols: cols(['quote_code', 'request_code', 'supplier_code', 'supplier_name', 'wa_id', 'brand', 'model', 'storage', 'grade', 'requested_qty', 'price_per_unit', 'currency', 'delivery_days', 'available_qty', 'status', 'sent_at', 'replied_at', 'supplier_reply']), rows: quotes.map(dates) },
        { name: 'Demands', cols: cols(['demand_code', 'supplier_code', 'product_code', 'requested_quantity', 'expected_unit_price', 'offered_unit_price', 'confirmed_quantity', 'delivery_time', 'delivery_location', 'demand_date', 'status', 'payment_status', 'total_cost', 'notes']), rows: demands.map(dates) },
      ];
    },
  },
  notifications: {
    perm: 'notifications.view',
    file: 'notifications',
    build: async () => {
      const list = await getBizStore().listRows<any>('notifications');
      return [{
        name: 'Notifications',
        cols: [
          { header: 'Date', key: 'created_at', width: 18, date: true }, { header: 'Type', key: 'type', width: 10 }, { header: 'Title', key: 'title', width: 36 },
          { header: 'WhatsApp', key: 'wa_id', width: 16 }, { header: 'Order', key: 'order_no', width: 22 }, { header: 'Request', key: 'request_code', width: 22 }, { header: 'Message', key: 'body', width: 80 },
        ],
        rows: list.map((n) => ({ ...n, created_at: d(n.created_at) })),
      }];
    },
  },
  broadcasts: {
    perm: 'broadcast.send',
    file: 'broadcasts',
    build: async () => {
      const list = await getBizStore().listBroadcasts();
      return [{
        name: 'Broadcasts',
        cols: [
          { header: 'Date', key: 'created_at', width: 18, date: true }, { header: 'Title', key: 'title', width: 30 }, { header: 'Status', key: 'status', width: 10 },
          { header: 'Recipients', key: 'total_recipients', width: 11 }, { header: 'Sent', key: 'sent_count', width: 8 }, { header: 'Failed', key: 'failed_count', width: 8 },
          { header: 'AI suggested', key: 'ai', width: 12 }, { header: 'Message', key: 'message', width: 80 },
        ],
        rows: list.map((b) => ({ ...b, ai: b.ai_suggested ? 'Yes' : 'No', created_at: d(b.created_at) })),
      }];
    },
  },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const def = EXPORTS[(await params).entity];
  if (!def) return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  const v = await requireViewer(def.perm);
  if (v instanceof NextResponse) return v;
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PhoneBuzz Dashboard';
    wb.created = new Date();
    for (const s of await def.build()) {
      const ws = wb.addWorksheet(s.name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = s.cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
      for (const r of s.rows) {
        // Formula-like text could run in Excel: prefix it so it stays plain text.
        const safe = Object.fromEntries(Object.entries(r).map(([k, val]) => [k, typeof val === 'string' && /^[=+\-@]/.test(val) ? `'${val}` : val]));
        ws.addRow(safe);
      }
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      s.cols.forEach((c, i) => {
        if (c.money) ws.getColumn(i + 1).numFmt = '#,##0';
        if (c.date) ws.getColumn(i + 1).numFmt = 'dd mmm yyyy hh:mm';
      });
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.cols.length } };
    }
    const buf = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="phonebuzz-${def.file}-${stamp}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return bizError(e);
  }
}
