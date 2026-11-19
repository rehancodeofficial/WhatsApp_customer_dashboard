// Sample business data for DEMO MODE (no Supabase). Deterministic, so screenshots and tests are stable.
import type { Contact } from '@/lib/types';
import type { InventoryMovement, Order, OrderItem, OrderStatus, Product, RowTable, Supplier } from './types';

const DAY = 86_400_000;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

let idn = 0;
const id = (prefix: string) => {
  const n = (++idn).toString(16).padStart(12, '0');
  return `${prefix}-0000-4000-8000-${n}`;
};

export interface DemoBizData {
  suppliers: Supplier[];
  products: Product[];
  movements: InventoryMovement[];
  orders: Order[];
  orderItems: OrderItem[];
  rows: Record<RowTable, Record<string, any>[]>;
}

export function buildDemoBizData(contacts: Contact[], now = Date.now()): DemoBizData {
  idn = 0;
  const r = rng(42);
  const iso = (t: number) => new Date(t).toISOString();

  const supplierRows: [string, string, string, string[], number][] = [
    ['Gulf Mobile Distribution', 'United Arab Emirates', '971504440001', ['Apple', 'Samsung'], 5],
    ['Shenzhen Bright Tech', 'China', '8613800138000', ['Xiaomi', 'Oppo', 'Tecno', 'Infinix'], 4],
    ['HK Prime Electronics', 'Hong Kong', '85291234567', ['Apple', 'Google'], 4],
    ['Euro Refurb Hub', 'Germany', '4915112345678', ['Apple', 'Samsung'], 3],
  ];
  const suppliers: Supplier[] = supplierRows.map(([name, country, phone, brands, rating], i) => ({
    code: `SUP-00${i + 1}`,
    contact_person: ['Rashid', 'Mr. Chen', 'Kelvin Wong', 'Jonas'][i],
    preferred_language: i === 1 ? 'Chinese' : 'English',
    id: id('5a000000'),
    name,
    company: name + ' LLC',
    phone,
    email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
    country,
    brands,
    rating,
    notes: null,
    active: true,
    created_at: iso(now - 200 * DAY),
  }));
  const supplierFor = (brand: string, refurb = false) =>
    (refurb ? suppliers[3] : suppliers.find((s) => s.brands.includes(brand)) || suppliers[0]).id;

  const productRows: [string, string, string, Product['condition'], number, number, number, number][] = [
    // brand, model, variant, condition, cost, sale, initial stock, reorder level
    ['Apple', 'iPhone 15 Pro Max', '256GB Natural Titanium', 'new', 3600, 3850, 320, 40],
    ['Apple', 'iPhone 15', '128GB Black', 'new', 2700, 2900, 260, 30],
    ['Apple', 'iPhone 14', '128GB Midnight', 'new', 2150, 2350, 420, 40],
    ['Apple', 'iPhone 13', '128GB Grade A', 'refurbished', 1280, 1450, 380, 30],
    ['Samsung', 'Galaxy S24 Ultra', '512GB Titanium Gray', 'new', 3700, 3950, 140, 20],
    ['Samsung', 'Galaxy A55', '128GB Awesome Navy', 'new', 930, 1020, 600, 60],
    ['Samsung', 'Galaxy A15', '128GB Black', 'new', 470, 520, 900, 80],
    ['Xiaomi', 'Redmi Note 13', '256GB Midnight Black', 'new', 560, 610, 700, 60],
    ['Xiaomi', '14', '512GB Jade Green', 'new', 2300, 2490, 90, 15],
    ['Google', 'Pixel 8 Pro', '128GB Obsidian', 'new', 2450, 2650, 80, 15],
    ['Oppo', 'Reno 11', '256GB Wave Green', 'new', 1080, 1180, 240, 25],
    ['Tecno', 'Spark 20', '128GB Gravity Black', 'new', 295, 330, 1100, 100],
    ['Infinix', 'Hot 40', '256GB Starlit Black', 'new', 320, 360, 950, 100],
    ['Samsung', 'Galaxy Z Flip5', '256GB Mint', 'new', 2550, 2790, 160, 10],
  ];
  const products: Product[] = productRows.map(([brand, model, variant, condition, cost, sale, stock, reorder], i) => ({
    id: id('9b000000'),
    sku: `${brand.slice(0, 3).toUpperCase()}-${model.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
    brand,
    model,
    variant,
    condition,
    category: 'smartphone',
    cost_price: cost,
    sale_price: sale,
    currency: 'AED',
    stock_qty: stock,
    reorder_level: reorder,
    supplier_id: supplierFor(brand, condition === 'refurbished'),
    location: i % 2 ? 'Dubai Warehouse B' : 'Dubai Warehouse A',
    active: true,
    created_at: iso(now - 150 * DAY),
    updated_at: iso(now - 150 * DAY),
  }));

  const movements: InventoryMovement[] = products.map((p, i) => ({
    id: id('7c000000'),
    product_id: p.id,
    type: 'in',
    quantity: p.stock_qty,
    unit_cost: p.cost_price,
    reference: `PO-${2401 + i}`,
    note: 'Opening stock',
    created_by: null,
    created_at: iso(now - 150 * DAY + i * 3_600_000),
  }));

  // Orders over the last 120 days. Some customers buy a lot (high tier), some very little.
  const weights = contacts.map((_, i) => [6, 3, 2, 1, 5, 1, 2, 4, 1, 3, 1, 2][i % 12]);
  const brandPref = new Map<string, string[]>();
  for (const c of contacts) brandPref.set(c.id, c.preferred_brands?.length ? c.preferred_brands : []);
  const pickContact = () => {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = r() * total;
    for (let i = 0; i < contacts.length; i++) {
      x -= weights[i];
      if (x <= 0) return contacts[i];
    }
    return contacts[0];
  };
  // Slow movers (high stock, rarely sold) give the AI something to recommend.
  const slow = new Set(['Galaxy Z Flip5', 'Pixel 8 Pro', '14']);

  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  let orderNo = 10001;
  for (let d = 120; d >= 0; d--) {
    const perDay = r() < 0.35 ? 0 : 1 + Math.floor(r() * (d < 30 ? 3 : 2));
    for (let k = 0; k < perDay; k++) {
      const c = pickContact();
      const pref = brandPref.get(c.id) || [];
      let pool = products.filter((p) => !slow.has(p.model) || r() < 0.08);
      if (pref.length && r() < 0.75) {
        const prefPool = pool.filter((p) => pref.includes(p.brand));
        if (prefPool.length) pool = prefPool;
      }
      const lines = 1 + (r() < 0.3 ? 1 : 0);
      const created = now - d * DAY - Math.floor(r() * 10) * 3_600_000;
      const order: Order = {
        id: id('0d000000'),
        order_no: `ORD-${orderNo++}`,
        contact_id: c.id,
        status: 'delivered',
        payment_status: 'paid',
        source: r() < 0.7 ? 'whatsapp_ai' : 'dashboard',
        currency: 'AED',
        subtotal: 0,
        discount: 0,
        total: 0,
        notes: null,
        created_by: null,
        created_at: iso(created),
        updated_at: iso(created),
      };
      for (let l = 0; l < lines; l++) {
        const p = pool[Math.floor(r() * pool.length)];
        const qty = [5, 10, 10, 20, 25, 30, 50][Math.floor(r() * 7)];
        if (p.stock_qty - qty < 3) continue;
        const item: OrderItem = {
          id: id('1e000000'),
          order_id: order.id,
          product_id: p.id,
          description: `${p.brand} ${p.model} ${p.variant || ''}`.trim(),
          quantity: qty,
          unit_price: p.sale_price,
          line_total: qty * p.sale_price,
        };
        orderItems.push(item);
        order.subtotal += item.line_total;
        p.stock_qty -= qty;
        movements.push({ id: id('7c000000'), product_id: p.id, type: 'out', quantity: -qty, unit_cost: null, reference: order.order_no, note: 'Sold', created_by: null, created_at: order.created_at });
      }
      if (!order.subtotal) continue;
      order.total = order.subtotal;
      if (d < 2) {
        order.status = 'pending';
        order.payment_status = 'unpaid';
      } else if (d < 5) {
        order.status = (['confirmed', 'paid', 'shipped'] as OrderStatus[])[Math.floor(r() * 3)];
        order.payment_status = order.status === 'confirmed' ? 'unpaid' : 'paid';
      } else if (r() < 0.05) {
        order.status = 'cancelled';
        order.payment_status = 'refunded';
      }
      orders.push(order);
    }
  }
  // Cancelled orders returned their stock.
  for (const o of orders.filter((x) => x.status === 'cancelled')) {
    for (const it of orderItems.filter((i) => i.order_id === o.id)) {
      const p = products.find((x) => x.id === it.product_id)!;
      p.stock_qty += it.quantity;
      movements.push({ id: id('7c000000'), product_id: p.id, type: 'return', quantity: it.quantity, unit_cost: null, reference: o.order_no, note: 'Order cancelled', created_by: null, created_at: o.updated_at });
    }
  }
  // A restock mid-way for the best sellers.
  for (const p of products.filter((x) => x.stock_qty < x.reorder_level * 2 && !slow.has(x.model)).slice(0, 4)) {
    const qty = 200;
    p.stock_qty += qty;
    movements.push({ id: id('7c000000'), product_id: p.id, type: 'in', quantity: qty, unit_cost: p.cost_price, reference: 'PO-2450', note: 'Restock', created_by: null, created_at: iso(now - 20 * DAY) });
  }
  // Make one product low on stock for the alerts.
  const low = products.find((p) => p.model === 'iPhone 15 Pro Max')!;
  if (low.stock_qty > 25) {
    const q = low.stock_qty - 18;
    low.stock_qty = 18;
    movements.push({ id: id('7c000000'), product_id: low.id, type: 'adjustment', quantity: -q, unit_cost: null, reference: 'AUDIT-11', note: 'Stock count adjustment', created_by: null, created_at: iso(now - 1 * DAY) });
  }

  movements.sort((a, b) => b.created_at.localeCompare(a.created_at));
  orders.sort((a, b) => b.created_at.localeCompare(a.created_at));

  // ---- sheet-parity demo rows: inquiries, sourcing, owner notifications
  const at = (minAgo: number) => iso(now - minAgo * 60_000);
  const byName = (n: string) => contacts.find((c) => c.name === n);
  const tariq = byName('Tariq Al Mansoori');
  const bilal = byName('Bilal Ahmed');
  const sami = byName('Sami Al Otaibi');
  const omar = byName('Omar Haddad');
  const row = (o: Record<string, any>) => ({ id: id('ab000000'), created_at: o.created_at || iso(now), updated_at: o.created_at || iso(now), ...o });
  const inquiries = contacts.flatMap((c, i) =>
    (c.preferred_brands?.length ? c.preferred_brands : ['Apple']).map((b, j) =>
      row({ contact_id: c.id, wa_id: c.wa_id, lead_code: c.lead_id, brand: b, model: b === 'Apple' ? 'iPhone 15 Pro Max' : b === 'Samsung' ? 'Galaxy S24 Ultra' : `${b} flagship`, storage: '256GB', grade: 'A', color: null, quantity: [20, 50, 100][(i + j) % 3], quoted_price: null, status: c.lead_status, created_at: at(600 * (i + 1) + j) })
    )
  );
  const supplier_requests = [
    row({ request_code: 'SR-20261117101500', request_date: at(2900), customer_name: 'Tariq Al Mansoori', wa_id: tariq?.wa_id, customer_market: 'UAE', brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', grade: 'A', color: 'Natural', quantity: 100, status: 'Supplier Selected', selected_supplier_code: 'SUP-001', expires_at: at(-1400), created_at: at(2900) }),
    row({ request_code: 'SR-20261118142000', request_date: at(1300), customer_name: 'Usman Tariq', wa_id: '923211234567', customer_market: 'Pakistan', brand: 'Xiaomi', model: 'Redmi Note 13', storage: '256GB', grade: 'A+', color: 'Black', quantity: 500, status: 'Quotes Received', expires_at: at(-3000), created_at: at(1300) }),
    row({ request_code: 'SR-20261119083000', request_date: at(240), customer_name: 'Khalid Al Thani', wa_id: '97433123456', customer_market: 'Qatar', brand: 'Google', model: 'Pixel 8 Pro', storage: '128GB', grade: 'A', color: 'Obsidian', quantity: 40, status: 'Waiting for Suppliers', expires_at: at(-4000), created_at: at(240) }),
  ];
  const q = (o: Record<string, any>) => row({ currency: 'AED', ...o });
  const supplier_quotes = [
    q({ quote_code: 'Q-1001', request_code: 'SR-20261117101500', supplier_code: 'SUP-001', supplier_name: 'Gulf Mobile Distribution', contact_person: 'Rashid', wa_id: '971504440001', location: 'Dubai', brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', grade: 'A', requested_qty: 100, price_per_unit: 3560, delivery_days: 2, available_qty: 120, supplier_reply: 'Yes available. AED 3,560 per piece, delivery 2 days Dubai.', status: 'Selected', sent_at: at(2880), replied_at: at(2820), created_at: at(2880) }),
    q({ quote_code: 'Q-1002', request_code: 'SR-20261117101500', supplier_code: 'SUP-003', supplier_name: 'HK Prime Electronics', contact_person: 'Kelvin Wong', wa_id: '85291234567', location: 'Hong Kong', brand: 'Apple', model: 'iPhone 15 Pro Max', storage: '256GB', grade: 'A', requested_qty: 100, price_per_unit: 3610, delivery_days: 5, available_qty: 60, status: 'Not Selected', sent_at: at(2880), replied_at: at(2700), created_at: at(2880) }),
    q({ quote_code: 'Q-1003', request_code: 'SR-20261118142000', supplier_code: 'SUP-002', supplier_name: 'Shenzhen Bright Tech', contact_person: 'Mr. Chen', wa_id: '8613800138000', location: 'Shenzhen', brand: 'Xiaomi', model: 'Redmi Note 13', storage: '256GB', grade: 'A+', requested_qty: 500, price_per_unit: 148, currency: 'USD', delivery_days: 7, available_qty: 800, supplier_reply: 'USD 148/pc, 7 days by air. MOQ 300.', status: 'Replied', sent_at: at(1290), replied_at: at(1180), created_at: at(1290) }),
    q({ quote_code: 'Q-1004', request_code: 'SR-20261119083000', supplier_code: 'SUP-003', supplier_name: 'HK Prime Electronics', contact_person: 'Kelvin Wong', wa_id: '85291234567', location: 'Hong Kong', brand: 'Google', model: 'Pixel 8 Pro', storage: '128GB', grade: 'A', requested_qty: 40, status: 'Sent', sent_at: at(230), created_at: at(230) }),
  ];
  const supplier_demands = [
    row({ demand_code: 'D-501', product_code: products[0].sku, requested_quantity: 100, delivery_location: 'Dubai', demand_date: at(3000), status: 'Open', notes: 'Low stock after big order', created_at: at(3000) }),
    row({ demand_code: 'D-502', product_code: products[7].sku, requested_quantity: 500, delivery_location: 'Karachi', demand_date: at(1300), status: 'Quoted', created_at: at(1300) }),
  ];
  const n = (o: Record<string, any>) => row({ read_at: null, order_no: null, request_code: null, party: o.wa_id ? 'customer' : null, ...o });
  const notifications = [
    n({ type: 'handoff', title: 'Customer message (human handling, AI paused)', body: `💬 CUSTOMER MESSAGE (Human handling, AI paused)\n\nCustomer ID: ${bilal?.lead_id}\nCustomer: Bilal Ahmed\nMessage: Theek hai, account details bhej dein`, wa_id: bilal?.wa_id, created_at: at(3) }),
    n({ type: 'order', title: 'New order handed to sales', body: `🔔 New order ORD-9812\n\nCustomer: Sami Al Otaibi\n30 × iPhone 13 128GB\nTotal: AED 43,500\nPlease share payment details.`, wa_id: sami?.wa_id, order_no: orders[0]?.order_no, created_at: at(119) }),
    n({ type: 'supplier', title: 'Supplier message', body: '📩 SUPPLIER MESSAGE\n\nSupplier: SUP-001 - Gulf Mobile Distribution\nYes available. AED 3,560 per piece, delivery 2 days Dubai.', wa_id: '971504440001', party: 'supplier', request_code: 'SR-20261117101500', created_at: at(240) }),
    n({ type: 'supplier', title: 'Supplier availability request', body: '🔔 SUPPLIER AVAILABILITY REQUEST\n\nRequest ID: SR-20261119083000\nProduct: Google Pixel 8 Pro 128GB A\nQuantity: 40\nSuppliers contacted: 1', wa_id: '97433123456', request_code: 'SR-20261119083000', created_at: at(238) }),
    n({ type: 'error', title: 'AI could not reply', body: `⚠️ AI COULD NOT REPLY (tried 4 times over ~3 minutes) - please answer this customer manually\n\nCustomer: Omar Haddad\nMessage: Do you have Samsung S24 Ultra 512GB?`, wa_id: omar?.wa_id, created_at: at(900), read_at: at(880) }),
    n({ type: 'payment', title: 'Payment verified', body: `✅ Payment verified for ${orders[3]?.order_no}.\nCustomer ID: ${tariq?.lead_id}\nAI is back on for this customer.`, wa_id: tariq?.wa_id, order_no: orders[3]?.order_no, created_at: at(1500), read_at: at(1490) }),
  ];
  return { suppliers, products, movements, orders, orderItems, rows: { customer_inquiries: inquiries, supplier_requests, supplier_quotes, supplier_demands, notifications } };
}
