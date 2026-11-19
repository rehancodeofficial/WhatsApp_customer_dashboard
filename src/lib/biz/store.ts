// Storage for the business modules. Demo mode: in memory. Live mode: Supabase (service role;
// every API route checks the user's permission before calling this).
import { DEFAULT_CURRENCY } from '@/lib/currency';
import { randomUUID } from 'crypto';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { demoContacts, demoConversations } from '@/lib/repo/memory';
import type { Contact } from '@/lib/types';
import { buildDemoBizData, type DemoBizData } from './demo-data';
import type {
  Broadcast,
  BroadcastRecipient,
  CustomerRecord,
  InventoryMovement,
  NewMovementInput,
  NewOrderInput,
  Order,
  OrderItem,
  Product,
  RowTable,
  Supplier,
} from './types';

export class BizError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ConversationLink {
  conversation_id: string;
  last_customer_message_at: string | null;
}

export interface BizStore {
  listCustomers(): Promise<CustomerRecord[]>;
  createCustomer(input: Partial<CustomerRecord> & { wa_id: string }): Promise<CustomerRecord>;
  updateCustomer(id: string, patch: Partial<CustomerRecord>): Promise<CustomerRecord>;
  conversationLinks(): Promise<Map<string, ConversationLink>>;

  listSuppliers(): Promise<Supplier[]>;
  saveSupplier(id: string | null, data: Partial<Supplier>): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  listProducts(): Promise<Product[]>;
  saveProduct(id: string | null, data: Partial<Product>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  listMovements(): Promise<InventoryMovement[]>;
  addMovement(input: NewMovementInput): Promise<InventoryMovement>;

  listOrders(): Promise<Order[]>; // with items
  createOrder(input: NewOrderInput): Promise<Order>;
  updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'payment_status' | 'notes'>>): Promise<Order>;

  listBroadcasts(): Promise<Broadcast[]>;
  createBroadcast(b: Omit<Broadcast, 'id' | 'created_at'>, recipients: Omit<BroadcastRecipient, 'id' | 'broadcast_id'>[]): Promise<{ broadcast: Broadcast; recipients: BroadcastRecipient[] }>;
  updateBroadcast(id: string, patch: Partial<Broadcast>): Promise<void>;
  updateRecipient(id: string, patch: Partial<BroadcastRecipient>): Promise<void>;
  listRecipients(broadcastId: string): Promise<BroadcastRecipient[]>;

  /** Generic tables (sourcing, inquiries, notifications). `key` matches an existing row to update. */
  listRows<T>(table: RowTable): Promise<T[]>;
  upsertRow<T>(table: RowTable, key: string | null, row: Record<string, unknown>): Promise<T>;
  updateRows(table: RowTable, ids: string[] | 'all', patch: Record<string, unknown>): Promise<void>;

  /** Orders mirrored from the n8n Orders / Order_Items sheets (no stock movement: Inventory sync owns stock). */
  upsertOrderRecord(orderNo: string, fields: Partial<Order>): Promise<Order>;
  upsertOrderItem(orderNo: string, item: Omit<OrderItem, 'id' | 'order_id' | 'line_total'>): Promise<void>;
  removeOrderItem(itemCode: string): Promise<void>;
}

const CUSTOMER_FIELDS = ['name', 'email', 'company', 'country', 'city', 'preferred_language', 'lead_status', 'tags', 'notes', 'payment_tier', 'preferred_brands', 'marketing_opt_in', 'lead_id', 'customer_code', 'delivery_address', 'payment_method', 'offer'] as const;
const SUPPLIER_FIELDS = ['name', 'company', 'phone', 'email', 'country', 'brands', 'rating', 'notes', 'active', 'code', 'contact_person', 'preferred_language'] as const;
const PRODUCT_FIELDS = ['sku', 'brand', 'model', 'variant', 'condition', 'category', 'cost_price', 'sale_price', 'currency', 'reorder_level', 'supplier_id', 'location', 'active', 'storage', 'color', 'grade', 'market_region', 'reserved_qty', 'notes'] as const;
const ORDER_FIELDS = ['contact_id', 'status', 'payment_status', 'source', 'currency', 'subtotal', 'discount', 'total', 'notes', 'handoff_status', 'payment_method', 'owner_chat_link', 'created_at'] as const;
/** Column that identifies a row coming from the sheet (Request_ID, Quote_ID, ...). */
export const ROW_KEYS: Record<RowTable, string | null> = {
  customer_inquiries: null,
  supplier_requests: 'request_code',
  supplier_quotes: 'quote_code',
  supplier_demands: 'demand_code',
  notifications: null,
};

function pick<T extends object>(obj: Partial<T>, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj && (obj as any)[k] !== undefined) out[k] = (obj as any)[k];
  return out as Partial<T>;
}

const toCustomer = (c: Contact | any): CustomerRecord => ({
  id: c.id,
  wa_id: c.wa_id,
  name: c.name ?? null,
  profile_name: c.profile_name ?? null,
  email: c.email ?? null,
  company: c.company ?? null,
  country: c.country ?? null,
  city: c.city ?? null,
  preferred_language: c.preferred_language ?? null,
  lead_status: c.lead_status ?? null,
  tags: c.tags || [],
  notes: c.notes ?? null,
  payment_tier: c.payment_tier ?? null,
  preferred_brands: c.preferred_brands || [],
  marketing_opt_in: c.marketing_opt_in !== false,
  created_at: c.created_at,
  lead_id: c.lead_id ?? null,
  customer_code: c.customer_code ?? null,
  delivery_address: c.delivery_address ?? null,
  payment_method: c.payment_method ?? null,
  offer: c.offer ?? null,
});

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

// ------------------------------------------------------------------ demo
interface DemoBiz extends DemoBizData {
  broadcasts: Broadcast[];
  recipients: BroadcastRecipient[];
  rows: Record<RowTable, Record<string, any>[]>;
}
const g = globalThis as unknown as { __pbDemoBiz?: DemoBiz };
function demo(): DemoBiz {
  if (!g.__pbDemoBiz) {
    const data = buildDemoBizData(demoContacts().filter((c) => c.kind !== 'supplier'));
    g.__pbDemoBiz = { ...data, broadcasts: [], recipients: [], rows: data.rows };
  }
  return g.__pbDemoBiz;
}
export function resetDemoBiz() {
  g.__pbDemoBiz = undefined;
}

class MemoryBizStore implements BizStore {
  async listCustomers() {
    return demoContacts().filter((c) => c.kind !== 'supplier').map(toCustomer);
  }
  async createCustomer(input: Partial<CustomerRecord> & { wa_id: string }) {
    if (demoContacts().some((c) => c.wa_id === input.wa_id)) throw new BizError('A customer with this WhatsApp number exists', 409);
    const c = { id: randomUUID(), wa_id: input.wa_id, profile_name: null, lead_id: null, preferred_language: 'English', tags: [], notes: null, lead_status: null, country: null, name: null, created_at: new Date().toISOString(), ...pick(input, CUSTOMER_FIELDS) } as Contact;
    demoContacts().push(c);
    return toCustomer(c);
  }
  async updateCustomer(id: string, patch: Partial<CustomerRecord>) {
    const c = demoContacts().find((x) => x.id === id);
    if (!c) throw new BizError('Customer not found', 404);
    Object.assign(c, pick(patch, CUSTOMER_FIELDS));
    return toCustomer(c);
  }
  async conversationLinks() {
    const m = new Map<string, ConversationLink>();
    for (const c of demoConversations()) m.set(c.contact_id, { conversation_id: c.id, last_customer_message_at: c.last_customer_message_at });
    return m;
  }

  async listSuppliers() {
    return [...demo().suppliers];
  }
  async saveSupplier(id: string | null, data: Partial<Supplier>) {
    const d = demo();
    if (id) {
      const s = d.suppliers.find((x) => x.id === id);
      if (!s) throw new BizError('Supplier not found', 404);
      Object.assign(s, pick(data, SUPPLIER_FIELDS));
      return s;
    }
    const s: Supplier = { id: randomUUID(), name: '', company: null, phone: null, email: null, country: null, brands: [], rating: null, notes: null, active: true, created_at: new Date().toISOString(), ...pick(data, SUPPLIER_FIELDS) };
    d.suppliers.push(s);
    return s;
  }
  async deleteSupplier(id: string) {
    const d = demo();
    d.suppliers = d.suppliers.filter((s) => s.id !== id);
    for (const p of d.products) if (p.supplier_id === id) p.supplier_id = null;
  }

  async listProducts() {
    return [...demo().products];
  }
  async saveProduct(id: string | null, data: Partial<Product>) {
    const d = demo();
    if (data.sku && d.products.some((p) => p.sku === data.sku && p.id !== id)) throw new BizError('This SKU is already used', 409);
    const now = new Date().toISOString();
    if (id) {
      const p = d.products.find((x) => x.id === id);
      if (!p) throw new BizError('Product not found', 404);
      Object.assign(p, pick(data, PRODUCT_FIELDS), { updated_at: now });
      return p;
    }
    const p: Product = { id: randomUUID(), sku: '', brand: '', model: '', variant: null, condition: 'new', category: 'smartphone', cost_price: 0, sale_price: 0, currency: DEFAULT_CURRENCY, stock_qty: 0, reorder_level: 10, supplier_id: null, location: null, active: true, created_at: now, updated_at: now, ...pick(data, PRODUCT_FIELDS) };
    d.products.push(p);
    return p;
  }
  async deleteProduct(id: string) {
    const d = demo();
    if (d.orderItems.some((i) => i.product_id === id)) throw new BizError('This product has orders. Mark it inactive instead.', 409);
    d.products = d.products.filter((p) => p.id !== id);
    d.movements = d.movements.filter((m) => m.product_id !== id);
  }

  async listMovements() {
    return [...demo().movements];
  }
  async addMovement(input: NewMovementInput) {
    const d = demo();
    const p = d.products.find((x) => x.id === input.product_id);
    if (!p) throw new BizError('Product not found', 404);
    if (p.stock_qty + input.quantity < 0) throw new BizError(`Not enough stock (have ${p.stock_qty})`, 409);
    const m: InventoryMovement = { id: randomUUID(), unit_cost: null, reference: null, note: null, created_by: null, ...input, created_at: new Date().toISOString() };
    p.stock_qty += input.quantity;
    p.updated_at = m.created_at;
    d.movements.unshift(m);
    return m;
  }

  async listOrders() {
    const d = demo();
    return d.orders.map((o) => ({ ...o, items: d.orderItems.filter((i) => i.order_id === o.id) }));
  }
  async createOrder(input: NewOrderInput) {
    const d = demo();
    if (!input.items.length) throw new BizError('An order needs at least one item');
    for (const it of input.items) {
      if (!it.product_id) continue;
      const p = d.products.find((x) => x.id === it.product_id);
      if (!p) throw new BizError('Product not found', 404);
      const need = input.items.filter((x) => x.product_id === it.product_id).reduce((a, b) => a + b.quantity, 0);
      if (p.stock_qty < need) throw new BizError(`Not enough stock for ${it.description} (have ${p.stock_qty}, need ${need})`, 409);
    }
    const now = new Date().toISOString();
    const max = d.orders.reduce((m, o) => Math.max(m, Number(o.order_no.replace(/\D/g, '')) || 0), 10000);
    const order: Order = {
      id: randomUUID(),
      order_no: `ORD-${max + 1}`,
      contact_id: input.contact_id,
      status: input.status || 'pending',
      payment_status: input.payment_status || 'unpaid',
      source: input.source || 'dashboard',
      currency: input.currency || DEFAULT_CURRENCY,
      subtotal: 0,
      discount: input.discount || 0,
      total: 0,
      notes: input.notes ?? null,
      created_by: input.created_by ?? null,
      created_at: now,
      updated_at: now,
    };
    const items: OrderItem[] = input.items.map((it) => ({ id: randomUUID(), order_id: order.id, ...it, line_total: it.quantity * it.unit_price }));
    order.subtotal = items.reduce((a, b) => a + b.line_total, 0);
    order.total = Math.max(order.subtotal - order.discount, 0);
    d.orders.unshift(order);
    d.orderItems.push(...items);
    if (order.status !== 'cancelled') {
      for (const it of items) {
        if (it.product_id) await this.addMovement({ product_id: it.product_id, type: 'out', quantity: -it.quantity, reference: order.order_no, note: 'Sold', created_by: input.created_by ?? null });
      }
    }
    return { ...order, items };
  }
  async updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'payment_status' | 'notes'>>) {
    const d = demo();
    const o = d.orders.find((x) => x.id === id);
    if (!o) throw new BizError('Order not found', 404);
    if (patch.status === 'cancelled' && o.status !== 'cancelled') {
      for (const it of d.orderItems.filter((i) => i.order_id === id && i.product_id)) {
        await this.addMovement({ product_id: it.product_id!, type: 'return', quantity: it.quantity, reference: o.order_no, note: 'Order cancelled' });
      }
    }
    if (o.status === 'cancelled' && patch.status && patch.status !== 'cancelled') throw new BizError('A cancelled order cannot be reopened. Create a new order.', 409);
    Object.assign(o, pick(patch, ['status', 'payment_status', 'notes']), { updated_at: new Date().toISOString() });
    return { ...o, items: d.orderItems.filter((i) => i.order_id === id) };
  }

  async listBroadcasts() {
    return [...demo().broadcasts];
  }
  async createBroadcast(b: Omit<Broadcast, 'id' | 'created_at'>, recipients: Omit<BroadcastRecipient, 'id' | 'broadcast_id'>[]) {
    const broadcast: Broadcast = { ...b, id: randomUUID(), created_at: new Date().toISOString() };
    const rows = recipients.map((r) => ({ ...r, id: randomUUID(), broadcast_id: broadcast.id }));
    demo().broadcasts.unshift(broadcast);
    demo().recipients.push(...rows);
    return { broadcast, recipients: rows };
  }
  async updateBroadcast(id: string, patch: Partial<Broadcast>) {
    const b = demo().broadcasts.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
  }
  async updateRecipient(id: string, patch: Partial<BroadcastRecipient>) {
    const r = demo().recipients.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  async listRecipients(broadcastId: string) {
    return demo().recipients.filter((r) => r.broadcast_id === broadcastId);
  }

  async listRows<T>(table: RowTable) {
    return [...demo().rows[table]].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) as T[];
  }
  async upsertRow<T>(table: RowTable, key: string | null, row: Record<string, unknown>) {
    const list = demo().rows[table];
    const now = new Date().toISOString();
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
    const existing = key && clean[key] != null ? list.find((r) => r[key] === clean[key]) : null;
    if (existing) {
      Object.assign(existing, clean, { updated_at: now });
      return existing as T;
    }
    const created = { id: randomUUID(), created_at: now, updated_at: now, ...clean };
    list.push(created);
    return created as T;
  }
  async updateRows(table: RowTable, ids: string[] | 'all', patch: Record<string, unknown>) {
    for (const r of demo().rows[table]) if (ids === 'all' || ids.includes(r.id)) Object.assign(r, patch);
  }

  async upsertOrderRecord(orderNo: string, fields: Partial<Order>) {
    const d = demo();
    let o = d.orders.find((x) => x.order_no === orderNo);
    const now = new Date().toISOString();
    if (!o) {
      o = { id: randomUUID(), order_no: orderNo, contact_id: null, status: 'pending', payment_status: 'unpaid', source: 'whatsapp_ai', currency: DEFAULT_CURRENCY, subtotal: 0, discount: 0, total: 0, notes: null, created_by: null, created_at: now, updated_at: now };
      d.orders.unshift(o);
    }
    Object.assign(o, pick(fields, ORDER_FIELDS), { updated_at: now });
    return { ...o, items: d.orderItems.filter((i) => i.order_id === o!.id) };
  }
  async upsertOrderItem(orderNo: string, item: Omit<OrderItem, 'id' | 'order_id' | 'line_total'>) {
    const d = demo();
    const o = d.orders.find((x) => x.order_no === orderNo) || (await this.upsertOrderRecord(orderNo, {}));
    const existing = item.item_code ? d.orderItems.find((i) => i.item_code === item.item_code) : null;
    if (existing) Object.assign(existing, item, { line_total: item.quantity * item.unit_price });
    else d.orderItems.push({ id: randomUUID(), order_id: o.id, ...item, line_total: item.quantity * item.unit_price });
    const items = d.orderItems.filter((i) => i.order_id === o.id);
    const order = d.orders.find((x) => x.id === o.id)!;
    order.subtotal = items.reduce((a, b) => a + b.line_total, 0);
    // The sheet's Total_Amount wins; only fill the total when the order has none.
    if (!order.total) order.total = Math.max(0, order.subtotal - order.discount);
  }
  async removeOrderItem(itemCode: string) {
    const d = demo();
    d.orderItems = d.orderItems.filter((i) => i.item_code !== itemCode);
  }
}

// ------------------------------------------------------------------ supabase
async function fetchAll<T>(table: string, select = '*', order = 'created_at'): Promise<T[]> {
  const db = getAdminSupabase();
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await db.from(table).select(select).order(order, { ascending: false }).range(from, from + page - 1);
    if (error) throw new BizError(error.message, 500);
    out.push(...((data || []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

function fail(error: { message: string; code?: string } | null, notFound?: boolean): never | void {
  if (error) {
    if (error.code === '23505') throw new BizError('This value is already used (duplicate)', 409);
    if (error.code === '23503') throw new BizError('This record is still used by other records', 409);
    throw new BizError(error.message.replace(/^.*EXCEPTION:\s*/, ''), 400);
  }
  if (notFound) throw new BizError('Not found', 404);
}

const normProduct = (p: any): Product => ({ ...p, cost_price: num(p.cost_price), sale_price: num(p.sale_price) });
const normOrder = (o: any): Order => ({
  ...o,
  subtotal: num(o.subtotal),
  discount: num(o.discount),
  total: num(o.total),
  items: (o.order_items || o.items || []).map((i: any) => ({ ...i, unit_price: num(i.unit_price), line_total: num(i.line_total) })),
  order_items: undefined,
});

class SupabaseBizStore implements BizStore {
  private db = getAdminSupabase();

  async listCustomers() {
    return (await fetchAll<Contact>('contacts')).filter((c) => c.kind !== 'supplier').map(toCustomer);
  }
  async createCustomer(input: Partial<CustomerRecord> & { wa_id: string }) {
    const { data, error } = await this.db.from('contacts').insert({ wa_id: input.wa_id, ...pick(input, CUSTOMER_FIELDS) }).select('*').single();
    fail(error);
    return toCustomer(data);
  }
  async updateCustomer(id: string, patch: Partial<CustomerRecord>) {
    const { data, error } = await this.db.from('contacts').update(pick(patch, CUSTOMER_FIELDS)).eq('id', id).select('*').maybeSingle();
    fail(error, !data);
    return toCustomer(data);
  }
  async conversationLinks() {
    const rows = await fetchAll<{ id: string; contact_id: string; last_customer_message_at: string | null }>('conversations', 'id, contact_id, last_customer_message_at, created_at');
    const m = new Map<string, ConversationLink>();
    for (const c of rows) if (!m.has(c.contact_id)) m.set(c.contact_id, { conversation_id: c.id, last_customer_message_at: c.last_customer_message_at });
    return m;
  }

  async listSuppliers() {
    return fetchAll<Supplier>('suppliers');
  }
  async saveSupplier(id: string | null, data: Partial<Supplier>) {
    const row = pick(data, SUPPLIER_FIELDS);
    const q = id ? this.db.from('suppliers').update(row).eq('id', id) : this.db.from('suppliers').insert(row);
    const { data: out, error } = await q.select('*').maybeSingle();
    fail(error, !out);
    return out as Supplier;
  }
  async deleteSupplier(id: string) {
    const { error } = await this.db.from('suppliers').delete().eq('id', id);
    fail(error);
  }

  async listProducts() {
    return (await fetchAll<any>('products')).map(normProduct);
  }
  async saveProduct(id: string | null, data: Partial<Product>) {
    const row = pick(data, PRODUCT_FIELDS);
    const q = id ? this.db.from('products').update(row).eq('id', id) : this.db.from('products').insert(row);
    const { data: out, error } = await q.select('*').maybeSingle();
    fail(error, !out);
    return normProduct(out);
  }
  async deleteProduct(id: string) {
    const { count } = await this.db.from('order_items').select('id', { count: 'exact', head: true }).eq('product_id', id);
    if (count) throw new BizError('This product has orders. Mark it inactive instead.', 409);
    const { error } = await this.db.from('products').delete().eq('id', id);
    fail(error);
  }

  async listMovements() {
    return (await fetchAll<any>('inventory_movements')).map((m) => ({ ...m, unit_cost: m.unit_cost === null ? null : num(m.unit_cost) }));
  }
  async addMovement(input: NewMovementInput) {
    if (input.quantity < 0) {
      const { data: p } = await this.db.from('products').select('stock_qty').eq('id', input.product_id).maybeSingle();
      if (!p) throw new BizError('Product not found', 404);
      if (p.stock_qty + input.quantity < 0) throw new BizError(`Not enough stock (have ${p.stock_qty})`, 409);
    }
    const { data, error } = await this.db.from('inventory_movements').insert(input).select('*').single();
    fail(error);
    return data as InventoryMovement;
  }

  async listOrders() {
    return (await fetchAll<any>('orders', '*, order_items(*)')).map(normOrder);
  }
  async createOrder(input: NewOrderInput) {
    const { data, error } = await this.db.rpc('create_order', { p: input });
    fail(error);
    const { data: full } = await this.db.from('orders').select('*, order_items(*)').eq('id', (data as any).id).single();
    return normOrder(full);
  }
  async updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'payment_status' | 'notes'>>) {
    const { data: cur } = await this.db.from('orders').select('status').eq('id', id).maybeSingle();
    if (!cur) throw new BizError('Order not found', 404);
    if (cur.status === 'cancelled' && patch.status && patch.status !== 'cancelled') throw new BizError('A cancelled order cannot be reopened. Create a new order.', 409);
    const { data, error } = await this.db.from('orders').update(pick(patch, ['status', 'payment_status', 'notes'])).eq('id', id).select('*, order_items(*)').maybeSingle();
    fail(error, !data);
    return normOrder(data);
  }

  async listBroadcasts() {
    return fetchAll<Broadcast>('broadcasts');
  }
  async createBroadcast(b: Omit<Broadcast, 'id' | 'created_at'>, recipients: Omit<BroadcastRecipient, 'id' | 'broadcast_id'>[]) {
    const { data, error } = await this.db.from('broadcasts').insert(b).select('*').single();
    fail(error);
    const rows = recipients.map((r) => ({ ...r, broadcast_id: data.id }));
    const { data: rec, error: e2 } = await this.db.from('broadcast_recipients').insert(rows).select('*');
    fail(e2);
    return { broadcast: data as Broadcast, recipients: (rec || []) as BroadcastRecipient[] };
  }
  async updateBroadcast(id: string, patch: Partial<Broadcast>) {
    const { error } = await this.db.from('broadcasts').update(patch).eq('id', id);
    fail(error);
  }
  async updateRecipient(id: string, patch: Partial<BroadcastRecipient>) {
    const { error } = await this.db.from('broadcast_recipients').update(patch).eq('id', id);
    fail(error);
  }
  async listRecipients(broadcastId: string) {
    const { data, error } = await this.db.from('broadcast_recipients').select('*').eq('broadcast_id', broadcastId);
    fail(error);
    return (data || []) as BroadcastRecipient[];
  }

  async listRows<T>(table: RowTable) {
    return fetchAll<T>(table);
  }
  async upsertRow<T>(table: RowTable, key: string | null, row: Record<string, unknown>) {
    const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
    const q = key && clean[key] != null ? this.db.from(table).upsert(clean, { onConflict: key }) : this.db.from(table).insert(clean);
    const { data, error } = await q.select('*').single();
    fail(error);
    return data as T;
  }
  async updateRows(table: RowTable, ids: string[] | 'all', patch: Record<string, unknown>) {
    let q = this.db.from(table).update(patch);
    q = ids === 'all' ? q.is('read_at', null) : q.in('id', ids);
    const { error } = await q;
    fail(error);
  }

  async upsertOrderRecord(orderNo: string, fields: Partial<Order>) {
    const row = { order_no: orderNo, ...pick(fields, ORDER_FIELDS) };
    const { data, error } = await this.db.from('orders').upsert(row, { onConflict: 'order_no' }).select('*, order_items(*)').single();
    fail(error);
    return normOrder(data);
  }
  async upsertOrderItem(orderNo: string, item: Omit<OrderItem, 'id' | 'order_id' | 'line_total'>) {
    let { data: o } = await this.db.from('orders').select('id, discount, total').eq('order_no', orderNo).maybeSingle();
    if (!o) o = (await this.upsertOrderRecord(orderNo, {})) as any;
    const { data: existing } = item.item_code ? await this.db.from('order_items').select('id').eq('item_code', item.item_code).maybeSingle() : { data: null };
    const { error } = existing
      ? await this.db.from('order_items').update(item).eq('id', existing.id)
      : await this.db.from('order_items').insert({ ...item, order_id: o!.id });
    fail(error);
    const { data: items } = await this.db.from('order_items').select('line_total').eq('order_id', o!.id);
    const subtotal = (items || []).reduce((a: number, i: any) => a + num(i.line_total), 0);
    const patch: Record<string, number> = { subtotal };
    if (!num(o!.total)) patch.total = Math.max(0, subtotal - num(o!.discount));
    await this.db.from('orders').update(patch).eq('id', o!.id);
  }
  async removeOrderItem(itemCode: string) {
    const { error } = await this.db.from('order_items').delete().eq('item_code', itemCode);
    fail(error);
  }
}

let cached: BizStore | null = null;
export function getBizStore(): BizStore {
  if (!cached) cached = isDemoMode() ? new MemoryBizStore() : new SupabaseBizStore();
  return cached;
}
