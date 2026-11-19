// Mirrors the n8n flow's Google Sheets writes into the database.
// n8n sends the SAME row it writes to the sheet (same column names, e.g. Lead_ID, WhatsApp_Number)
// to POST /api/n8n/sync/<Sheet_Name>. Partial rows (updates) only change the columns they contain.
import { getBizStore } from './store';
import type { CustomerRecord, Order, OrderStatus, OrderPaymentStatus, Product } from './types';
import { DEFAULT_CURRENCY } from '@/lib/currency';

export const SYNC_SHEETS = [
  'Customer_Leads',
  'Customers',
  'Inventory',
  'Orders',
  'Order_Items',
  'Suppliers',
  'Supplier_Requests',
  'Supplier_Quotes',
  'Supplier_Demands',
] as const;
export type SyncSheet = (typeof SYNC_SHEETS)[number];

type Row = Record<string, unknown>;

const txt = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const has = (r: Row, k: string) => k in r && txt(r[k]) !== null;
const numOrNull = (v: unknown): number | null => {
  const s = txt(v);
  if (s === null) return null;
  // First number in the text: "PKR 345,000 per piece (Total: 12,075,000)" → 345000
  const m = s.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const intOrNull = (v: unknown) => {
  const n = numOrNull(v);
  return n === null ? null : Math.round(n);
};
const digits = (v: unknown) => (txt(v) || '').replace(/[^0-9]/g, '');
const dateOrNull = (v: unknown): string | null => {
  const s = txt(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
/** Only keep keys whose value is not undefined (so partial updates don't wipe columns). */
const defined = <T extends Row>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const opt = <T>(r: Row, k: string, f: (v: unknown) => T) => (k in r ? f(r[k]) : undefined);

export function mapOrderStatus(v: unknown): OrderStatus | undefined {
  const s = (txt(v) || '').toLowerCase();
  if (!s) return undefined;
  if (s.includes('cancel') || s.includes('reject')) return 'cancelled';
  if (s.includes('deliver') || s.includes('complete')) return 'delivered';
  if (s.includes('ship') || s.includes('dispatch')) return 'shipped';
  if (s.includes('paid') || s.includes('verified')) return 'paid';
  if (s.includes('confirm')) return 'confirmed';
  return 'pending';
}
export function mapPaymentStatus(v: unknown): OrderPaymentStatus | undefined {
  const s = (txt(v) || '').toLowerCase();
  if (!s) return undefined;
  if (s.includes('refund')) return 'refunded';
  if (s.includes('partial')) return 'partial';
  if (s.includes('verified') || s.includes('paid') || s.includes('received')) return s.includes('unpaid') ? 'unpaid' : 'paid';
  return 'unpaid';
}

async function findCustomer(r: Row): Promise<CustomerRecord | null> {
  const store = getBizStore();
  const list = await store.listCustomers();
  const wa = digits(r.WhatsApp_Number);
  const lead = txt(r.Lead_ID) || txt(r.Customer_ID);
  return (
    (wa && list.find((c) => c.wa_id === wa)) ||
    (lead && list.find((c) => c.lead_id === lead || c.customer_code === lead)) ||
    null
  );
}

async function syncCustomerLead(r: Row) {
  const store = getBizStore();
  const existing = await findCustomer(r);
  const brand = txt(r.Brand);
  const offerKeys = Object.keys(r).filter((k) => k.startsWith('Offer_'));
  const fields = defined({
    lead_id: opt(r, 'Lead_ID', txt) ?? undefined,
    name: opt(r, 'Customer_Name', txt) ?? undefined,
    email: opt(r, 'Email', txt) ?? undefined,
    country: opt(r, 'Country', txt) ?? undefined,
    delivery_address: opt(r, 'Delivery_Address', txt) ?? undefined,
    lead_status: opt(r, 'Lead_Status', txt) ?? undefined,
    preferred_language: opt(r, 'Preferred_Language', txt) ?? undefined,
    notes: opt(r, 'Notes', txt) ?? undefined,
    payment_method: opt(r, 'Payment_Method', txt) ?? undefined,
    offer: offerKeys.length ? { ...(existing?.offer || {}), ...Object.fromEntries(offerKeys.map((k) => [k, r[k]])) } : undefined,
    preferred_brands: brand ? Array.from(new Set([...(existing?.preferred_brands || []), brand])) : undefined,
  } as Row);
  let customer: CustomerRecord;
  if (existing) customer = await store.updateCustomer(existing.id, fields as Partial<CustomerRecord>);
  else {
    const wa = digits(r.WhatsApp_Number);
    if (!wa) throw Object.assign(new Error('New lead needs WhatsApp_Number'), { status: 400 });
    customer = await store.createCustomer({ wa_id: wa, ...(fields as Partial<CustomerRecord>) });
  }
  // Keep a history of what the customer asked for (only when the inquiry changed).
  if (brand || has(r, 'Model')) {
    const inquiries = (await store.listRows<any>('customer_inquiries')).filter((i) => i.contact_id === customer.id);
    const last = inquiries[0];
    const next = {
      contact_id: customer.id,
      wa_id: customer.wa_id,
      lead_code: customer.lead_id ?? null,
      brand,
      model: txt(r.Model),
      storage: txt(r.Storage),
      grade: txt(r.Grade),
      color: txt(r.Color),
      quantity: intOrNull(r.Quantity),
      quoted_price: numOrNull(r.Quoted_Price),
      status: txt(r.Lead_Status),
      created_at: dateOrNull(r.Inquiry_Date) || new Date().toISOString(),
    };
    const same = last && ['brand', 'model', 'storage', 'grade', 'color', 'quantity', 'quoted_price'].every((k) => (last as any)[k] == (next as any)[k]);
    if (!same) await store.upsertRow('customer_inquiries', null, next);
  }
  return { customer_id: customer.id };
}

async function syncCustomer(r: Row) {
  const store = getBizStore();
  const existing = await findCustomer(r);
  const fields = defined({
    customer_code: opt(r, 'Customer_ID', txt) ?? undefined,
    name: opt(r, 'Full_Name', txt) ?? undefined,
    country: undefined,
    email: opt(r, 'Email', txt) ?? undefined,
    delivery_address: opt(r, 'Address', txt) ?? undefined,
    preferred_language: opt(r, 'Preferred_Language', txt) ?? undefined,
  } as Row) as Partial<CustomerRecord>;
  if (existing) return { customer_id: (await store.updateCustomer(existing.id, fields)).id };
  const wa = digits(r.WhatsApp_Number);
  if (!wa) {
    // "Save Customer Language" only sends Customer_ID + language: ignore unknown customers.
    return { skipped: 'customer not found' };
  }
  return { customer_id: (await store.createCustomer({ wa_id: wa, ...fields })).id };
}

async function syncInventory(r: Row) {
  const store = getBizStore();
  const sku = txt(r.ID);
  if (!sku) throw Object.assign(new Error('Inventory row needs ID'), { status: 400 });
  const products = await store.listProducts();
  const suppliers = await store.listSuppliers();
  let p: Product | undefined = products.find((x) => x.sku === sku);
  const supplierCode = txt(r.Supplier_ID);
  const supplier_id = supplierCode ? suppliers.find((s) => s.code === supplierCode || s.id === supplierCode)?.id ?? undefined : undefined;
  const variant = [txt(r.Storage), txt(r.Color), txt(r.Grade) && `Grade ${txt(r.Grade)}`].filter(Boolean).join(' ') || undefined;
  const fields = defined({
    sku,
    brand: opt(r, 'Brand', txt) ?? undefined,
    model: opt(r, 'Model', txt) ?? undefined,
    storage: opt(r, 'Storage', txt) ?? undefined,
    color: opt(r, 'Color', txt) ?? undefined,
    grade: opt(r, 'Grade', txt) ?? undefined,
    variant: has(r, 'Storage') || has(r, 'Color') || has(r, 'Grade') ? variant : undefined,
    location: opt(r, 'Warehouse', txt) ?? undefined,
    market_region: opt(r, 'Market_Region', txt) ?? undefined,
    cost_price: opt(r, 'Unit_Cost', numOrNull) ?? undefined,
    sale_price: opt(r, 'Sale_Price', numOrNull) ?? undefined,
    reorder_level: opt(r, 'Reorder_Level', intOrNull) ?? undefined,
    reserved_qty: opt(r, 'Reserved_Qty', intOrNull) ?? undefined,
    notes: opt(r, 'Notes', txt) ?? undefined,
    supplier_id,
  } as Row) as Partial<Product>;
  if (!p) {
    if (!fields.brand || !fields.model) throw Object.assign(new Error(`Unknown inventory ID ${sku}: send Brand and Model to add it`), { status: 404 });
    const grade = (txt(r.Grade) || '').toLowerCase();
    p = await store.saveProduct(null, { condition: !grade || grade.startsWith('new') ? 'new' : 'refurbished', currency: DEFAULT_CURRENCY, ...fields });
  } else {
    p = await store.saveProduct(p.id, fields);
  }
  // Stock: on hand = Available_Qty + Reserved_Qty (the sheet keeps reserved stock out of Available).
  const available = intOrNull(r.Available_Qty);
  if (available !== null) {
    const reserved = intOrNull(r.Reserved_Qty) ?? p.reserved_qty ?? 0;
    const target = Math.max(0, available + reserved);
    const diff = target - p.stock_qty;
    if (diff !== 0) {
      await store.addMovement({ product_id: p.id, type: diff > 0 ? 'in' : 'out', quantity: diff, unit_cost: diff > 0 ? numOrNull(r.Unit_Cost) : null, reference: 'n8n', note: 'Synced from n8n Inventory' });
    }
  }
  return { product_id: p.id };
}

async function syncOrder(r: Row) {
  const store = getBizStore();
  const orderNo = txt(r.Order_ID);
  if (!orderNo) throw Object.assign(new Error('Orders row needs Order_ID'), { status: 400 });
  // Conversation_ID in the Orders sheet is the customer's WhatsApp number.
  const customer = has(r, 'Customer_ID') || has(r, 'WhatsApp_Number') || has(r, 'Conversation_ID')
    ? await findCustomer({ ...r, WhatsApp_Number: r.WhatsApp_Number ?? r.Conversation_ID })
    : null;
  const created = dateOrNull(r.Order_Date) || dateOrNull(r.Created_At);
  const exists = (await store.listOrders()).find((o) => o.order_no === orderNo);
  const fields = defined({
    contact_id: customer?.id,
    status: mapOrderStatus(r.Order_Status),
    payment_status: mapPaymentStatus(r.Payment_Status),
    handoff_status: opt(r, 'Handoff_Status', txt) ?? undefined,
    payment_method: opt(r, 'Payment_Method', txt) ?? undefined,
    owner_chat_link: opt(r, 'Owner_Chat_Link', txt) ?? undefined,
    total: opt(r, 'Total_Amount', numOrNull) ?? undefined,
    subtotal: opt(r, 'Subtotal', numOrNull) ?? undefined,
    notes: opt(r, 'Notes', txt) ?? undefined,
    discount: opt(r, 'Discount', numOrNull) ?? undefined,
    currency: exists ? undefined : DEFAULT_CURRENCY,
    source: exists ? undefined : 'whatsapp_ai',
    created_at: exists ? undefined : created ?? undefined,
  } as Row) as Partial<Order>;
  const order = await store.upsertOrderRecord(orderNo, fields);
  // A single-product order row (Product_ID + Quantity) becomes its line when no Order_Items exist yet.
  const sku = txt(r.Product_ID);
  const qty = intOrNull(r.Quantity);
  if (sku && qty && !(order.items || []).length) {
    const p = (await store.listProducts()).find((x) => x.sku === sku);
    await store.upsertOrderItem(orderNo, {
      item_code: `${orderNo}-main`,
      product_id: p?.id ?? null,
      description: p ? `${p.brand} ${p.model} ${p.variant || ''}`.trim() : sku,
      quantity: qty,
      unit_price: numOrNull(r.Unit_Price) ?? p?.sale_price ?? 0,
      grade: null,
    });
  }
  return { order_id: order.id, order_no: orderNo };
}

async function syncOrderItem(r: Row) {
  const store = getBizStore();
  const orderNo = txt(r.Order_ID);
  const code = txt(r.Order_Item_ID);
  if (!orderNo || !code) throw Object.assign(new Error('Order_Items row needs Order_ID and Order_Item_ID'), { status: 400 });
  const sku = txt(r.Product_ID);
  const p = sku ? (await store.listProducts()).find((x) => x.sku === sku) : undefined;
  const desc = [txt(r.Brand) || p?.brand, txt(r.Model) || p?.model, txt(r.Storage), txt(r.Color)].filter(Boolean).join(' ');
  let added = 0;
  // Detailed lines replace the order's single summary line (from the Orders row).
  const hasDetail = ['A+', 'A', 'B', 'C'].some((g) => intOrNull(r[`${g}_Quantity`])) || intOrNull(r.Total_Quantity);
  if (hasDetail) await store.removeOrderItem(`${orderNo}-main`);
  // One line per grade that has a quantity (A+, A, B, C).
  for (const g of ['A+', 'A', 'B', 'C']) {
    const qty = intOrNull(r[`${g}_Quantity`]);
    if (!qty) continue;
    await store.upsertOrderItem(orderNo, {
      item_code: `${code}-${g}`,
      product_id: p?.id ?? null,
      description: `${desc} (Grade ${g})`,
      quantity: qty,
      unit_price: numOrNull(r[`${g}_Unit_Price`]) ?? 0,
      grade: g,
    });
    added++;
  }
  if (!added) {
    const qty = intOrNull(r.Total_Quantity);
    if (qty) {
      const lt = numOrNull(r.Line_Total) ?? numOrNull(r.Line_Subtotal) ?? 0;
      await store.upsertOrderItem(orderNo, { item_code: code, product_id: p?.id ?? null, description: desc || 'Item', quantity: qty, unit_price: qty ? lt / qty : 0, grade: null });
      added++;
    }
  }
  return { lines: added };
}

async function syncSupplier(r: Row) {
  const store = getBizStore();
  const code = txt(r.Supplier_ID);
  const suppliers = await store.listSuppliers();
  const wa = digits(r.WhatsApp_Number);
  const existing = (code && suppliers.find((s) => s.code === code)) || (wa && suppliers.find((s) => digits(s.phone) === wa)) || null;
  const brandsRaw = txt(r.Brands) || txt(r.Brand);
  const fields = defined({
    code: code ?? undefined,
    name: opt(r, 'Supplier_Name', txt) ?? opt(r, 'Supplier', txt) ?? opt(r, 'Company_Name', txt) ?? undefined,
    company: opt(r, 'Company_Name', txt) ?? undefined,
    contact_person: opt(r, 'Contact_Person', txt) ?? undefined,
    phone: wa || undefined,
    email: opt(r, 'Email', txt) ?? undefined,
    country: opt(r, 'Country', txt) ?? opt(r, 'Location', txt) ?? undefined,
    preferred_language: opt(r, 'Preferred_Language', txt) ?? undefined,
    brands: brandsRaw ? brandsRaw.split(/[,/;]+/).map((b) => b.trim()).filter(Boolean) : undefined,
    active: 'Is_Active' in r ? !/^(false|no|0|inactive)$/i.test(txt(r.Is_Active) || '') : undefined,
    notes:
      [txt(r.City) && `City: ${txt(r.City)}`, txt(r.Address) && `Address: ${txt(r.Address)}`, txt(r.Payment_Terms) && `Payment terms: ${txt(r.Payment_Terms)}`, txt(r.Markets) && `Markets: ${txt(r.Markets)}`, txt(r.Notes)]
        .filter(Boolean)
        .join('\n') || undefined,
  } as Row);
  if (existing) return { supplier_id: (await store.saveSupplier(existing.id, fields)).id };
  if (!fields.name) return { skipped: 'supplier not found' };
  return { supplier_id: (await store.saveSupplier(null, fields)).id };
}

async function syncSupplierRequest(r: Row) {
  const code = txt(r.Request_ID);
  if (!code) throw Object.assign(new Error('Supplier_Requests row needs Request_ID'), { status: 400 });
  const row = defined({
    request_code: code,
    request_date: opt(r, 'Request_Date', dateOrNull) ?? undefined,
    customer_name: opt(r, 'Customer_Name', txt) ?? undefined,
    wa_id: has(r, 'WhatsApp_Number') ? digits(r.WhatsApp_Number) : undefined,
    email: opt(r, 'Email', txt) ?? undefined,
    customer_market: opt(r, 'Customer_Market', txt) ?? undefined,
    brand: opt(r, 'Brand', txt) ?? undefined,
    model: opt(r, 'Model', txt) ?? undefined,
    storage: opt(r, 'Storage', txt) ?? undefined,
    grade: opt(r, 'Grade', txt) ?? undefined,
    color: opt(r, 'Color', txt) ?? undefined,
    quantity: opt(r, 'Quantity', intOrNull) ?? undefined,
    status: opt(r, 'Request_Status', txt) ?? undefined,
    notes: opt(r, 'Notes', txt) ?? undefined,
    expires_at: opt(r, 'Expires_At', dateOrNull) ?? undefined,
    selected_supplier_code: opt(r, 'Selected_Supplier_ID', txt) ?? undefined,
  } as Row);
  const saved = await getBizStore().upsertRow<any>('supplier_requests', 'request_code', row);
  return { id: saved.id };
}

async function syncSupplierQuote(r: Row) {
  const code = txt(r.Quote_ID);
  if (!code) throw Object.assign(new Error('Supplier_Quotes row needs Quote_ID'), { status: 400 });
  const row = defined({
    quote_code: code,
    request_code: opt(r, 'Request_ID', txt) ?? undefined,
    supplier_code: opt(r, 'Supplier_ID', txt) ?? undefined,
    supplier_name: opt(r, 'Supplier_Name', txt) ?? undefined,
    contact_person: opt(r, 'Contact_Person', txt) ?? undefined,
    wa_id: has(r, 'WhatsApp_Number') ? digits(r.WhatsApp_Number) : undefined,
    location: opt(r, 'Location', txt) ?? undefined,
    brand: opt(r, 'Brand', txt) ?? undefined,
    model: opt(r, 'Model', txt) ?? undefined,
    storage: opt(r, 'Storage', txt) ?? undefined,
    grade: opt(r, 'Grade', txt) ?? undefined,
    color: opt(r, 'Color', txt) ?? undefined,
    requested_qty: opt(r, 'Requested_Qty', intOrNull) ?? undefined,
    price_per_unit: opt(r, 'Price_Per_Unit', numOrNull) ?? undefined,
    currency: opt(r, 'Currency', txt) ?? undefined,
    delivery_days: opt(r, 'Delivery_Days', intOrNull) ?? undefined,
    available_qty: opt(r, 'Available_Qty', intOrNull) ?? undefined,
    supplier_reply: opt(r, 'Supplier_Reply', txt) ?? undefined,
    status: opt(r, 'Quote_Status', txt) ?? undefined,
    sent_at: opt(r, 'Sent_At', dateOrNull) ?? undefined,
    replied_at: opt(r, 'Replied_At', dateOrNull) ?? undefined,
  } as Row);
  const saved = await getBizStore().upsertRow<any>('supplier_quotes', 'quote_code', row);
  return { id: saved.id };
}

async function syncSupplierDemand(r: Row) {
  const code = txt(r.Demand_ID);
  if (!code) throw Object.assign(new Error('Supplier_Demands row needs Demand_ID'), { status: 400 });
  const row = defined({
    demand_code: code,
    supplier_code: opt(r, 'Supplier_ID', txt) ?? undefined,
    expected_unit_price: opt(r, 'Expected_Unit_Price', numOrNull) ?? undefined,
    offered_unit_price: opt(r, 'Offered_Unit_Price', numOrNull) ?? undefined,
    confirmed_quantity: opt(r, 'Confirmed_Quantity', intOrNull) ?? undefined,
    delivery_time: opt(r, 'Delivery_Time', txt) ?? undefined,
    total_cost: opt(r, 'Total_Cost', numOrNull) ?? undefined,
    payment_status: opt(r, 'Payment_Status', txt) ?? undefined,
    tracking_reference: opt(r, 'Tracking_Reference', txt) ?? undefined,
    product_code: opt(r, 'Product_ID', txt) ?? undefined,
    requested_quantity: opt(r, 'Requested_Quantity', intOrNull) ?? undefined,
    delivery_location: opt(r, 'Delivery_Location', txt) ?? undefined,
    demand_date: opt(r, 'Demand_Date', dateOrNull) ?? undefined,
    status: opt(r, 'Demand_Status', txt) ?? undefined,
    notes: opt(r, 'Notes', txt) ?? undefined,
  } as Row);
  const saved = await getBizStore().upsertRow<any>('supplier_demands', 'demand_code', row);
  return { id: saved.id };
}

const HANDLERS: Record<SyncSheet, (r: Row) => Promise<Record<string, unknown>>> = {
  Customer_Leads: syncCustomerLead,
  Customers: syncCustomer,
  Inventory: syncInventory,
  Orders: syncOrder,
  Order_Items: syncOrderItem,
  Suppliers: syncSupplier,
  Supplier_Requests: syncSupplierRequest,
  Supplier_Quotes: syncSupplierQuote,
  Supplier_Demands: syncSupplierDemand,
};

/** Accepts the sheet name in any case/with spaces or dashes ("customer leads" → Customer_Leads). */
export function resolveSheet(name: string): SyncSheet | null {
  const k = name.toLowerCase().replace(/[^a-z]/g, '');
  return SYNC_SHEETS.find((s) => s.toLowerCase().replace(/[^a-z]/g, '') === k) ?? null;
}

export async function syncRows(sheet: SyncSheet, rows: Row[]) {
  const results: Record<string, unknown>[] = [];
  for (const r of rows) {
    try {
      results.push({ ok: true, ...(await HANDLERS[sheet](r)) });
    } catch (e: any) {
      results.push({ ok: false, error: e?.message || String(e) });
    }
  }
  return results;
}
