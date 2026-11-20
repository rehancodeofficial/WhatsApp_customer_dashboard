// Pure business logic: customer tiers, broadcast audience, analytics, product suggestions.
// No I/O here, so it is easy to test.
import type { AudienceFilters, CustomerRecord, CustomerView, InventoryMovement, Order, PaymentTier, Product } from './types';
import type { ConversationLink } from './store';

const DAY = 86_400_000;

/** Lifetime spend (business currency) at which a customer becomes high / medium paying. */
/** Change with TIER_HIGH_MIN_AED / TIER_MEDIUM_MIN_AED. */
export const TIER_THRESHOLDS = {
  high: Number(process.env.TIER_HIGH_MIN_AED) || 500_000,
  medium: Number(process.env.TIER_MEDIUM_MIN_AED) || 200_000,
};

export function autoTier(totalSpent: number): PaymentTier {
  if (totalSpent >= TIER_THRESHOLDS.high) return 'high';
  if (totalSpent >= TIER_THRESHOLDS.medium) return 'medium';
  return 'low';
}

export function buildCustomerViews(
  customers: CustomerRecord[],
  orders: Order[],
  products: Product[],
  links: Map<string, ConversationLink>
): CustomerView[] {
  const brandOf = new Map(products.map((p) => [p.id, p.brand]));
  const agg = new Map<string, { count: number; spent: number; last: string | null; brands: Set<string> }>();
  for (const o of orders) {
    if (!o.contact_id || o.status === 'cancelled') continue;
    const a = agg.get(o.contact_id) || { count: 0, spent: 0, last: null, brands: new Set<string>() };
    a.count++;
    a.spent += o.total;
    if (!a.last || o.created_at > a.last) a.last = o.created_at;
    for (const it of o.items || []) {
      const b = it.product_id ? brandOf.get(it.product_id) : null;
      if (b) a.brands.add(b);
    }
    agg.set(o.contact_id, a);
  }
  return customers.map((c) => {
    const a = agg.get(c.id);
    const brands_bought = a ? Array.from(a.brands).sort() : [];
    const spent = a?.spent ?? 0;
    const link = links.get(c.id);
    return {
      ...c,
      order_count: a?.count ?? 0,
      total_spent: spent,
      last_order_at: a?.last ?? null,
      brands_bought,
      brands: Array.from(new Set([...c.preferred_brands, ...brands_bought])).sort(),
      tier: c.payment_tier ?? autoTier(spent),
      tier_auto: !c.payment_tier,
      conversation_id: link?.conversation_id ?? null,
      last_customer_message_at: link?.last_customer_message_at ?? null,
    };
  });
}

/** Customers matching the broadcast filters. Empty filter list = no filter on that field. */
export function filterAudience(customers: CustomerView[], f: AudienceFilters): CustomerView[] {
  const countries = (f.countries || []).map((x) => x.toLowerCase());
  const brands = (f.brands || []).map((x) => x.toLowerCase());
  const tiers = f.tiers || [];
  return customers.filter((c) => {
    if (!c.wa_id) return false;
    if (f.optedInOnly !== false && !c.marketing_opt_in) return false;
    if (countries.length && !countries.includes((c.country || '').toLowerCase())) return false;
    if (tiers.length && !tiers.includes(c.tier)) return false;
    if (brands.length && !c.brands.some((b) => brands.includes(b.toLowerCase()))) return false;
    return true;
  });
}

const dayKey = (iso: string) => iso.slice(0, 10);

export interface SalesAnalytics {
  rangeDays: number;
  revenue: number;
  revenuePrev: number;
  profit: number;
  profitPrev: number;
  orders: number;
  ordersPrev: number;
  unitsSold: number;
  avgOrder: number;
  pendingOrders: number;
  unpaidValue: number;
  /** One point per day (or week for long ranges): revenue and profit. */
  series: { label: string; date: string; revenue: number; profit: number; orders: number }[];
  byBrand: { brand: string; revenue: number; units: number }[];
  byCountry: { country: string; revenue: number; orders: number }[];
  topProducts: { product_id: string; name: string; brand: string; units: number; revenue: number }[];
  byStatus: { status: string; count: number }[];
  bySource: { source: string; count: number; revenue: number }[];
  topCustomers: { contact_id: string; name: string; revenue: number; orders: number }[];
}

export function salesAnalytics(orders: Order[], products: Product[], customers: CustomerRecord[], days = 30, now = Date.now()): SalesAnalytics {
  const start = now - days * DAY;
  const prevStart = start - days * DAY;
  const byId = new Map(products.map((p) => [p.id, p]));
  const custById = new Map(customers.map((c) => [c.id, c]));
  const live = orders.filter((o) => o.status !== 'cancelled');
  const inRange = live.filter((o) => Date.parse(o.created_at) >= start && Date.parse(o.created_at) <= now);
  const inPrev = live.filter((o) => Date.parse(o.created_at) >= prevStart && Date.parse(o.created_at) < start);

  const profitOf = (o: Order) =>
    (o.items || []).reduce((sum, it) => {
      const p = it.product_id ? byId.get(it.product_id) : null;
      return sum + it.line_total - (p ? p.cost_price * it.quantity : 0);
    }, 0) - o.discount;

  const revenue = inRange.reduce((a, o) => a + o.total, 0);
  const profit = inRange.reduce((a, o) => a + profitOf(o), 0);

  // Bucket by day, or by week when the range is long.
  const bucketDays = days > 60 ? 7 : 1;
  const buckets = Math.ceil(days / bucketDays);
  const series = Array.from({ length: buckets }, (_, i) => {
    const t = start + (i + 1) * bucketDays * DAY - 1;
    const d = new Date(Math.min(t, now));
    return {
      date: dayKey(d.toISOString()),
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      revenue: 0,
      profit: 0,
      orders: 0,
    };
  });
  for (const o of inRange) {
    const i = Math.min(buckets - 1, Math.floor((Date.parse(o.created_at) - start) / (bucketDays * DAY)));
    series[i].revenue += o.total;
    series[i].profit += profitOf(o);
    series[i].orders += 1;
  }

  const brand = new Map<string, { revenue: number; units: number }>();
  const prod = new Map<string, { units: number; revenue: number }>();
  let unitsSold = 0;
  for (const o of inRange) {
    for (const it of o.items || []) {
      unitsSold += it.quantity;
      const p = it.product_id ? byId.get(it.product_id) : null;
      const b = p?.brand || 'Other';
      const cur = brand.get(b) || { revenue: 0, units: 0 };
      cur.revenue += it.line_total;
      cur.units += it.quantity;
      brand.set(b, cur);
      if (p) {
        const pc = prod.get(p.id) || { units: 0, revenue: 0 };
        pc.units += it.quantity;
        pc.revenue += it.line_total;
        prod.set(p.id, pc);
      }
    }
  }
  const country = new Map<string, { revenue: number; orders: number }>();
  const cust = new Map<string, { revenue: number; orders: number }>();
  for (const o of inRange) {
    const c = o.contact_id ? custById.get(o.contact_id) : null;
    const k = c?.country || 'Unknown';
    const cur = country.get(k) || { revenue: 0, orders: 0 };
    cur.revenue += o.total;
    cur.orders += 1;
    country.set(k, cur);
    if (o.contact_id) {
      const cc = cust.get(o.contact_id) || { revenue: 0, orders: 0 };
      cc.revenue += o.total;
      cc.orders += 1;
      cust.set(o.contact_id, cc);
    }
  }
  const statusCount = new Map<string, number>();
  for (const o of orders.filter((o) => Date.parse(o.created_at) >= start)) statusCount.set(o.status, (statusCount.get(o.status) || 0) + 1);
  const source = new Map<string, { count: number; revenue: number }>();
  for (const o of inRange) {
    const s = source.get(o.source) || { count: 0, revenue: 0 };
    s.count++;
    s.revenue += o.total;
    source.set(o.source, s);
  }

  return {
    rangeDays: days,
    revenue,
    revenuePrev: inPrev.reduce((a, o) => a + o.total, 0),
    profit,
    profitPrev: inPrev.reduce((a, o) => a + profitOf(o), 0),
    orders: inRange.length,
    ordersPrev: inPrev.length,
    unitsSold,
    avgOrder: inRange.length ? revenue / inRange.length : 0,
    pendingOrders: live.filter((o) => ['pending', 'confirmed'].includes(o.status)).length,
    unpaidValue: live.filter((o) => o.payment_status !== 'paid' && o.payment_status !== 'refunded').reduce((a, o) => a + o.total, 0),
    series,
    byBrand: Array.from(brand, ([b, v]) => ({ brand: b, ...v })).sort((a, b) => b.revenue - a.revenue),
    byCountry: Array.from(country, ([c, v]) => ({ country: c, ...v })).sort((a, b) => b.revenue - a.revenue),
    topProducts: Array.from(prod, ([id, v]) => {
      const p = byId.get(id)!;
      return { product_id: id, name: `${p.model} ${p.variant || ''}`.trim(), brand: p.brand, ...v };
    })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
    byStatus: Array.from(statusCount, ([status, count]) => ({ status, count })),
    bySource: Array.from(source, ([s, v]) => ({ source: s, ...v })),
    topCustomers: Array.from(cust, ([id, v]) => ({ contact_id: id, name: custById.get(id)?.name || custById.get(id)?.wa_id || 'Unknown', ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
  };
}

export interface InventoryAnalytics {
  skus: number;
  units: number;
  stockValueCost: number;
  stockValueSale: number;
  /** Available on-hand units = stock_qty - reserved_qty */
  onHandUnits: number;
  /** Value of on-hand units at cost price */
  onHandValue: number;
  /** Reserved units (paid orders awaiting fulfillment) */
  reservedUnits: number;
  /** Value of reserved units at cost price */
  reservedValue: number;
  lowStock: { product_id: string; name: string; brand: string; stock: number; reorder: number }[];
  outOfStock: number;
  /** Per product: sold units in the range, days of stock left at that pace. */
  velocity: { product_id: string; name: string; brand: string; stock: number; sold: number; daysLeft: number | null; value: number }[];
  /** Stock in vs out per day/week. */
  flow: { label: string; date: string; in: number; out: number }[];
  byBrand: { brand: string; units: number; value: number }[];
  movementsInRange: number;
}

export function inventoryAnalytics(products: Product[], movements: InventoryMovement[], days = 30, now = Date.now()): InventoryAnalytics {
  const start = now - days * DAY;
  const active = products.filter((p) => p.active);
  const inRange = movements.filter((m) => Date.parse(m.created_at) >= start);
  const sold = new Map<string, number>();
  for (const m of inRange) if (m.type === 'out') sold.set(m.product_id, (sold.get(m.product_id) || 0) - m.quantity);

  const bucketDays = days > 60 ? 7 : 1;
  const buckets = Math.ceil(days / bucketDays);
  const flow = Array.from({ length: buckets }, (_, i) => {
    const d = new Date(Math.min(start + (i + 1) * bucketDays * DAY - 1, now));
    return { date: dayKey(d.toISOString()), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), in: 0, out: 0 };
  });
  for (const m of inRange) {
    const i = Math.min(buckets - 1, Math.floor((Date.parse(m.created_at) - start) / (bucketDays * DAY)));
    if (m.quantity >= 0) flow[i].in += m.quantity;
    else flow[i].out += -m.quantity;
  }
  const name = (p: Product) => `${p.model} ${p.variant || ''}`.trim();
  const brand = new Map<string, { units: number; value: number }>();
  for (const p of active) {
    const b = brand.get(p.brand) || { units: 0, value: 0 };
    b.units += p.stock_qty;
    b.value += p.stock_qty * p.cost_price;
    brand.set(p.brand, b);
  }
  return {
    skus: active.length,
    units: active.reduce((a, p) => a + p.stock_qty, 0),
    stockValueCost: active.reduce((a, p) => a + p.stock_qty * p.cost_price, 0),
    stockValueSale: active.reduce((a, p) => a + p.stock_qty * p.sale_price, 0),
    onHandUnits: active.reduce((a, p) => a + Math.max(0, p.stock_qty - (p.reserved_qty || 0)), 0),
    onHandValue: active.reduce((a, p) => a + Math.max(0, p.stock_qty - (p.reserved_qty || 0)) * p.cost_price, 0),
    reservedUnits: active.reduce((a, p) => a + (p.reserved_qty || 0), 0),
    reservedValue: active.reduce((a, p) => a + (p.reserved_qty || 0) * p.cost_price, 0),
    lowStock: active
      .filter((p) => p.stock_qty <= p.reorder_level)
      .map((p) => ({ product_id: p.id, name: name(p), brand: p.brand, stock: p.stock_qty, reorder: p.reorder_level }))
      .sort((a, b) => a.stock - b.stock),
    outOfStock: active.filter((p) => p.stock_qty <= 0).length,
    velocity: active
      .map((p) => {
        const s = sold.get(p.id) || 0;
        const perDay = s / days;
        return { product_id: p.id, name: name(p), brand: p.brand, stock: p.stock_qty, sold: s, daysLeft: perDay > 0 ? Math.round(p.stock_qty / perDay) : null, value: p.stock_qty * p.cost_price };
      })
      .sort((a, b) => b.sold - a.sold),
    flow,
    byBrand: Array.from(brand, ([b, v]) => ({ brand: b, ...v })).sort((a, b) => b.value - a.value),
    movementsInRange: inRange.length,
  };
}

// ------------------------------------------------------------------ broadcast suggestions
export interface ProductSuggestion {
  product_id: string;
  product: string;
  brand: string;
  score: number;
  reasons: string[];
  stock: number;
  sale_price: number;
  currency: string;
  suggestedDiscountPct: number;
  audience: AudienceFilters;
  audienceSize: number;
  message: string;
}

/**
 * Recommend which products to push in a broadcast:
 *  - lots of stock that sells slowly (money stuck in the warehouse)
 *  - healthy margin (room for a discount)
 *  - customers who asked for / bought this brand (an audience exists)
 * Products below their reorder level are never suggested.
 */
export function suggestProducts(products: Product[], movements: InventoryMovement[], customers: CustomerView[], now = Date.now(), limit = 4): ProductSuggestion[] {
  const window = 30;
  const start = now - window * DAY;
  const sold = new Map<string, number>();
  for (const m of movements) if (m.type === 'out' && Date.parse(m.created_at) >= start) sold.set(m.product_id, (sold.get(m.product_id) || 0) - m.quantity);

  const out: ProductSuggestion[] = [];
  for (const p of products) {
    if (!p.active || p.stock_qty <= p.reorder_level) continue;
    const s = sold.get(p.id) || 0;
    const perDay = s / window;
    const daysOfStock = perDay > 0 ? p.stock_qty / perDay : 999;
    const margin = p.sale_price > 0 ? (p.sale_price - p.cost_price) / p.sale_price : 0;
    const stockValue = p.stock_qty * p.cost_price;
    const audience: AudienceFilters = { brands: [p.brand] };
    const audienceSize = filterAudience(customers, audience).length;
    const highTier = filterAudience(customers, { brands: [p.brand], tiers: ['high', 'medium'] }).length;

    const reasons: string[] = [];
    let score = 0;
    if (daysOfStock >= 90) {
      score += 40;
      reasons.push(perDay > 0 ? `Slow mover: ~${Math.round(daysOfStock)} days of stock at the current pace` : 'No sales in the last 30 days');
    } else if (daysOfStock >= 45) {
      score += 22;
      reasons.push(`~${Math.round(daysOfStock)} days of stock left at the current pace`);
    }
    if (stockValue >= 150_000) {
      score += Math.min(25, Math.round(stockValue / 40_000));
      reasons.push(`${p.currency} ${Math.round(stockValue).toLocaleString()} tied up in stock`);
    }
    if (margin >= 0.07) {
      score += 10;
      reasons.push(`${Math.round(margin * 100)}% margin leaves room for an offer`);
    }
    if (audienceSize > 0) {
      score += Math.min(25, audienceSize * 4);
      reasons.push(`${audienceSize} customer${audienceSize === 1 ? '' : 's'} asked for or bought ${p.brand}${highTier ? ` (${highTier} high/medium paying)` : ''}`);
    }
    if (score < 30) continue;

    const discountPct = margin >= 0.1 ? 5 : margin >= 0.06 ? 3 : 0;
    const price = Math.round(p.sale_price * (1 - discountPct / 100));
    const name = `${p.brand} ${p.model}${p.variant ? ' ' + p.variant : ''}`;
    out.push({
      product_id: p.id,
      product: name,
      brand: p.brand,
      score,
      reasons,
      stock: p.stock_qty,
      sale_price: p.sale_price,
      currency: p.currency,
      suggestedDiscountPct: discountPct,
      audience: highTier >= 3 ? { brands: [p.brand], tiers: ['high', 'medium'] } : audience,
      audienceSize: highTier >= 3 ? highTier : audienceSize,
      message:
        `Hi {name},\n\n🔥 Special wholesale offer from Phone Buzz!\n\n${name} (${p.condition})\n` +
        (discountPct ? `Now ${p.currency} ${price.toLocaleString()} per piece (was ${p.sale_price.toLocaleString()})` : `${p.currency} ${p.sale_price.toLocaleString()} per piece`) +
        `\n✅ ${p.stock_qty} units ready in Dubai\n\nReply with the quantity to book your order.`,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Text for one product in a broadcast message. */
export function productLine(p: Product) {
  return `${p.brand} ${p.model}${p.variant ? ' ' + p.variant : ''}: ${p.currency} ${p.sale_price.toLocaleString()} per piece`;
}

/** Replace {name} in a broadcast message with the customer's first name. */
export function personalize(message: string, name: string | null | undefined) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  return message.replace(/\{name\}/g, first);
}
