import { describe, it, expect, beforeEach } from 'vitest';
import { autoTier, buildCustomerViews, filterAudience, inventoryAnalytics, personalize, salesAnalytics, suggestProducts, TIER_THRESHOLDS } from '@/lib/biz/logic';
import { getBizStore, resetDemoBiz } from '@/lib/biz/store';
import { resetDemoStore } from '@/lib/repo/memory';
import type { CustomerView, Order, Product } from '@/lib/biz/types';

process.env.NEXT_PUBLIC_DEMO_MODE = 'true';

const DAY = 86_400_000;
const now = Date.parse('2026-11-19T12:00:00Z');
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

const product = (over: Partial<Product>): Product => ({
  id: 'p1', sku: 'S1', brand: 'Apple', model: 'iPhone 14', variant: '128GB', condition: 'new', category: 'smartphone',
  cost_price: 2000, sale_price: 2300, currency: 'AED', stock_qty: 100, reorder_level: 10, supplier_id: null, location: null,
  active: true, created_at: iso(100), updated_at: iso(1), ...over,
});
const customer = (over: Partial<CustomerView>): CustomerView => ({
  id: 'c1', wa_id: '971500000001', name: 'Ali Khan', profile_name: null, email: null, company: null, country: 'UAE', city: null,
  preferred_language: null, lead_status: null, tags: [], notes: null, payment_tier: null, preferred_brands: [], marketing_opt_in: true,
  created_at: iso(200), order_count: 0, total_spent: 0, last_order_at: null, brands_bought: [], brands: [], tier: 'low', tier_auto: true,
  conversation_id: null, last_customer_message_at: null, ...over,
});

describe('customer tiers', () => {
  it('tier follows lifetime spend unless set by hand', () => {
    expect(autoTier(TIER_THRESHOLDS.high)).toBe('high');
    expect(autoTier(TIER_THRESHOLDS.medium)).toBe('medium');
    expect(autoTier(0)).toBe('low');
    const orders: Order[] = [
      { id: 'o1', order_no: 'ORD-1', contact_id: 'c1', status: 'delivered', payment_status: 'paid', source: 'x', currency: 'AED', subtotal: 0, discount: 0, total: TIER_THRESHOLDS.high, notes: null, created_by: null, created_at: iso(3), updated_at: iso(3), items: [{ id: 'i', order_id: 'o1', product_id: 'p1', description: '', quantity: 1, unit_price: 1, line_total: 1 }] },
      { id: 'o2', order_no: 'ORD-2', contact_id: 'c1', status: 'cancelled', payment_status: 'refunded', source: 'x', currency: 'AED', subtotal: 0, discount: 0, total: 999_999_999, notes: null, created_by: null, created_at: iso(2), updated_at: iso(2), items: [] },
    ];
    const base = { ...customer({}), preferred_brands: ['Samsung'] };
    const [auto] = buildCustomerViews([base], orders, [product({})], new Map());
    expect(auto.tier).toBe('high');
    expect(auto.order_count).toBe(1); // cancelled order ignored
    expect(auto.brands).toEqual(['Apple', 'Samsung']); // bought + asked for
    const [manual] = buildCustomerViews([{ ...base, payment_tier: 'low' }], orders, [product({})], new Map());
    expect(manual.tier).toBe('low');
    expect(manual.tier_auto).toBe(false);
  });
});

describe('broadcast audience filters', () => {
  const list = [
    customer({ id: 'a', country: 'UAE', tier: 'high', brands: ['Apple'] }),
    customer({ id: 'b', country: 'Pakistan', tier: 'low', brands: ['Samsung'] }),
    customer({ id: 'c', country: 'UAE', tier: 'low', brands: ['Samsung', 'Apple'], marketing_opt_in: false }),
  ];
  it('empty filters = everyone who opted in', () => {
    expect(filterAudience(list, {}).map((c) => c.id)).toEqual(['a', 'b']);
  });
  it('country, tier and brand filters combine (AND), values inside one filter are OR', () => {
    expect(filterAudience(list, { countries: ['uae'] }).map((c) => c.id)).toEqual(['a']);
    expect(filterAudience(list, { tiers: ['low'], brands: ['samsung'] }).map((c) => c.id)).toEqual(['b']);
    expect(filterAudience(list, { brands: ['Apple', 'Samsung'] }).map((c) => c.id)).toEqual(['a', 'b']);
    expect(filterAudience(list, { brands: ['Apple'], optedInOnly: false }).map((c) => c.id)).toEqual(['a', 'c']);
  });
  it('personalizes {name}', () => {
    expect(personalize('Hi {name}!', 'Ali Khan')).toBe('Hi Ali!');
    expect(personalize('Hi {name}!', null)).toBe('Hi there!');
  });
});

describe('AI product suggestions (rule engine)', () => {
  it('suggests slow movers with stock and an interested audience, never low-stock items', () => {
    const slow = product({ id: 'slow', brand: 'Samsung', model: 'Z Flip5', stock_qty: 160, cost_price: 2550, sale_price: 2790 });
    const fast = product({ id: 'fast', stock_qty: 30, reorder_level: 10 });
    const low = product({ id: 'low', brand: 'Samsung', stock_qty: 5, reorder_level: 10 });
    const moves = Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, product_id: 'fast', type: 'out' as const, quantity: -5, unit_cost: null, reference: null, note: null, created_by: null, created_at: iso(i) }));
    const customers = [customer({ id: 'x', brands: ['Samsung'], tier: 'high' }), customer({ id: 'y', brands: ['Samsung'] })];
    const s = suggestProducts([slow, fast, low], moves, customers, now);
    expect(s[0].product_id).toBe('slow');
    expect(s.some((x) => x.product_id === 'low')).toBe(false);
    expect(s.some((x) => x.product_id === 'fast')).toBe(false);
    expect(s[0].audienceSize).toBe(2);
    expect(s[0].message).toContain('{name}');
    // never suggests a bigger discount than the margin allows
    expect(s[0].suggestedDiscountPct).toBeLessThanOrEqual(5);
  });
});

describe('analytics', () => {
  it('sales: revenue, profit and previous period; cancelled orders excluded', () => {
    const p = product({});
    const mk = (id: string, daysAgo: number, qty: number, status: Order['status'] = 'delivered'): Order => ({
      id, order_no: id, contact_id: null, status, payment_status: 'paid', source: 'dashboard', currency: 'AED', subtotal: qty * 2300, discount: 0, total: qty * 2300, notes: null, created_by: null, created_at: iso(daysAgo), updated_at: iso(daysAgo),
      items: [{ id: id + 'i', order_id: id, product_id: 'p1', description: '', quantity: qty, unit_price: 2300, line_total: qty * 2300 }],
    });
    const a = salesAnalytics([mk('a', 1, 10), mk('b', 5, 10, 'cancelled'), mk('c', 40, 5)], [p], [], 30, now);
    expect(a.revenue).toBe(23000);
    expect(a.profit).toBe(3000);
    expect(a.revenuePrev).toBe(11500);
    expect(a.orders).toBe(1);
    expect(a.series).toHaveLength(30);
  });
  it('inventory: stock value, low stock and in/out flow', () => {
    const a = inventoryAnalytics(
      [product({}), product({ id: 'p2', stock_qty: 3, reorder_level: 10 })],
      [{ id: 'm', product_id: 'p1', type: 'out', quantity: -30, unit_cost: null, reference: null, note: null, created_by: null, created_at: iso(1) }],
      30,
      now
    );
    expect(a.stockValueCost).toBe(103 * 2000);
    expect(a.lowStock.map((l) => l.product_id)).toEqual(['p2']);
    expect(a.flow.reduce((s, f) => s + f.out, 0)).toBe(30);
    expect(a.velocity.find((v) => v.product_id === 'p1')?.daysLeft).toBe(100);
  });
});

describe('demo store: orders and stock stay consistent', () => {
  beforeEach(() => {
    resetDemoStore();
    resetDemoBiz();
  });
  it('an order takes stock out, cancelling puts it back, overselling is refused', async () => {
    const store = getBizStore();
    const p = (await store.listProducts())[0];
    const before = p.stock_qty;
    const o = await store.createOrder({ contact_id: null, items: [{ product_id: p.id, description: 'x', quantity: 3, unit_price: 10 }] });
    expect((await store.listProducts()).find((x) => x.id === p.id)!.stock_qty).toBe(before - 3);
    expect(o.total).toBe(30);
    await store.updateOrder(o.id, { status: 'cancelled' });
    expect((await store.listProducts()).find((x) => x.id === p.id)!.stock_qty).toBe(before);
    await expect(store.updateOrder(o.id, { status: 'pending' })).rejects.toThrow(/cancelled/);
    await expect(store.createOrder({ contact_id: null, items: [{ product_id: p.id, description: 'x', quantity: before + 1, unit_price: 1 }] })).rejects.toThrow(/Not enough stock/);
  });
});

import { offerVariable } from '@/lib/biz/service';
describe('broadcast offer as a template variable', () => {
  it('has no new lines, tabs or long space runs and stays short', () => {
    const v = offerVariable('Hi Ali,\n\nNew offer:\n• iPhone 15\t256GB     USD 700\r\n');
    expect(v).not.toMatch(/[\n\t]| {5,}/);
    expect(v).toBe('Hi Ali, · New offer: · • iPhone 15 256GB USD 700');
    expect(offerVariable('x'.repeat(2000)).length).toBe(850);
  });
});

import { decryptSecret, encryptSecret } from '@/lib/security';
describe('password vault', () => {
  it('encrypts so the stored text is not the password, and decrypts back', () => {
    process.env.PASSWORD_VAULT_KEY = 'test-key';
    const a = encryptSecret('S3cret pass!');
    const b = encryptSecret('S3cret pass!');
    expect(a).not.toContain('S3cret');
    expect(a).not.toBe(b); // random IV
    expect(decryptSecret(a)).toBe('S3cret pass!');
    expect(() => decryptSecret(a.slice(0, -2) + 'xx')).toThrow();
  });
});

import { channelOf, contactLabel, emailKey, isEmailOnly } from '@/lib/biz/channel';
import { broadcastEmailHtml } from '@/lib/biz/service';
describe('email-only customers', () => {
  it('get a placeholder id, the email channel and a readable label', () => {
    const wa = emailKey('  Ali@Shop.COM ');
    expect(wa).toBe('email:ali@shop.com');
    expect(isEmailOnly(wa)).toBe(true);
    expect(channelOf({ wa_id: wa })).toBe('email');
    expect(channelOf({ wa_id: '923001234567' })).toBe('whatsapp');
    expect(contactLabel({ wa_id: wa, email: 'Ali@Shop.com' })).toBe('Ali@Shop.com');
    expect(contactLabel({ wa_id: '923001234567' })).toBe('+923001234567');
  });
  it('broadcast email keeps line breaks and escapes HTML', () => {
    const h = broadcastEmailHtml('Hi Ali,\n<b>iPhone</b> & more');
    expect(h).toContain('Hi Ali,<br>&lt;b&gt;iPhone&lt;/b&gt; &amp; more');
  });
});

import { dateOrNull } from '@/lib/biz/sheet-sync';
import { toBase } from '@/lib/fx';
describe('n8n times and currencies', () => {
  it('reads n8n local times as Dubai time (UTC+4)', () => {
    expect(dateOrNull('2026-11-20 15:30')).toBe('2026-11-20T11:30:00.000Z');
    expect(dateOrNull('2026-11-20')).toBe('2026-11-19T20:00:00.000Z');
    expect(dateOrNull('2026-11-20T15:30:00Z')).toBe('2026-11-20T15:30:00.000Z');
    expect(dateOrNull('')).toBeNull();
  });
  it('converts to the dashboard currency', () => {
    expect(toBase(280, 'PKR', 'USD', { PKR: 280 })).toBe(1);
    expect(toBase(5, 'USD', 'USD', null)).toBe(5);
    expect(toBase(5, 'AED', 'USD', {})).toBeNull();
  });
});
