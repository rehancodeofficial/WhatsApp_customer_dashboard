import { describe, it, expect, beforeEach } from 'vitest';
import { mapOrderStatus, mapPaymentStatus, resolveSheet, syncRows } from '@/lib/biz/sheet-sync';
import { getBizStore, resetDemoBiz } from '@/lib/biz/store';
import { resetDemoStore } from '@/lib/repo/memory';
import { classifyNotification, titleFromText } from '@/lib/biz/notifications';
import { canReadParty } from '@/lib/chat-access';

process.env.NEXT_PUBLIC_DEMO_MODE = 'true';

describe('n8n Google Sheet rows → database', () => {
  beforeEach(async () => {
    resetDemoStore();
    resetDemoBiz();
    await getBizStore().listRows('customer_inquiries'); // build the demo data before the test adds its own rows
  });

  it('resolves sheet names loosely', () => {
    expect(resolveSheet('Customer_Leads')).toBe('Customer_Leads');
    expect(resolveSheet('customer leads')).toBe('Customer_Leads');
    expect(resolveSheet('nope')).toBeNull();
  });

  it('maps free-text statuses', () => {
    expect(mapOrderStatus('Handed Over to Sales')).toBe('pending');
    expect(mapOrderStatus('Payment Verified')).toBe('paid');
    expect(mapOrderStatus('Cancelled')).toBe('cancelled');
    expect(mapPaymentStatus('Verified')).toBe('paid');
    expect(mapPaymentStatus('Unpaid')).toBe('unpaid');
  });

  it('a lead creates a customer, merges brands and records the inquiry once', async () => {
    const row = { Lead_ID: 'CUST-1', Customer_Name: 'Zehra', WhatsApp_Number: '+92 339 8039095', Country: 'Pakistan', Brand: 'Samsung', Model: 'Galaxy A55', Quantity: '35', Quoted_Price: 'PKR 345,000 per piece (Total: 12,075,000)' };
    expect((await syncRows('Customer_Leads', [row]))[0].ok).toBe(true);
    await syncRows('Customer_Leads', [row]); // same inquiry again: no duplicate
    await syncRows('Customer_Leads', [{ Lead_ID: 'CUST-1', Brand: 'Apple', Model: 'iPhone 15' }]); // update by Lead_ID only
    const store = getBizStore();
    const c = (await store.listCustomers()).find((x) => x.wa_id === '923398039095')!;
    expect(c.name).toBe('Zehra');
    expect(c.preferred_brands).toEqual(['Samsung', 'Apple']);
    const inq = (await store.listRows<any>('customer_inquiries')).filter((i) => i.contact_id === c.id);
    expect(inq).toHaveLength(2);
    expect(inq.find((i) => i.brand === 'Samsung').quoted_price).toBe(345000); // first number only
  });

  it('inventory rows set stock to Available + Reserved and log the change', async () => {
    await syncRows('Inventory', [{ ID: 'INV-9', Brand: 'Apple', Model: 'iPhone 15 Pro', Storage: '256GB', Grade: 'A', Available_Qty: '220', Reserved_Qty: '30', Unit_Cost: '245,000', Sale_Price: '275000' }]);
    const store = getBizStore();
    let p = (await store.listProducts()).find((x) => x.sku === 'INV-9')!;
    expect(p.stock_qty).toBe(250);
    expect(p.cost_price).toBe(245000);
    // "Reserve Stock" update only sends ID + quantities
    await syncRows('Inventory', [{ ID: 'INV-9', Reserved_Qty: '65', Available_Qty: '185' }]);
    p = (await store.listProducts()).find((x) => x.sku === 'INV-9')!;
    expect(p.stock_qty).toBe(250);
    expect(p.reserved_qty).toBe(65);
    await syncRows('Inventory', [{ ID: 'INV-9', Reserved_Qty: '0', Available_Qty: '200' }]);
    p = (await store.listProducts()).find((x) => x.sku === 'INV-9')!;
    expect(p.stock_qty).toBe(200);
    expect((await store.listMovements()).filter((m) => m.product_id === p.id).map((m) => m.quantity)).toEqual([-50, 250]);
  });

  it('orders + grade lines: total follows the sheet, no double counting', async () => {
    await syncRows('Inventory', [{ ID: 'INV-3', Brand: 'Google', Model: 'Pixel 8 Pro', Available_Qty: '100' }]);
    await syncRows('Customer_Leads', [{ Lead_ID: 'CUST-2', Customer_Name: 'Rehan', WhatsApp_Number: '923118885947' }]);
    await syncRows('Orders', [{ Order_ID: 'ORD-1', Customer_ID: 'CUST-2', Product_ID: 'INV-3', Quantity: '35', Unit_Price: '198000', Total_Amount: '6930000', Order_Status: 'Handed Over to Sales' }]);
    await syncRows('Order_Items', [{ Order_Item_ID: 'ORD-1-1', Order_ID: 'ORD-1', Product_ID: 'INV-3', B_Quantity: '35', B_Unit_Price: '198000' }]);
    const o = (await getBizStore().listOrders()).find((x) => x.order_no === 'ORD-1')!;
    expect(o.total).toBe(6930000);
    expect(o.items!.map((i) => i.item_code)).toEqual(['ORD-1-1-B']);
    expect(o.status).toBe('pending');
    const stock = (await getBizStore().listProducts()).find((p) => p.sku === 'INV-3')!.stock_qty;
    expect(stock).toBe(100); // synced orders never move stock (the Inventory sheet owns it)
  });

  it('supplier requests / quotes upsert by their sheet IDs', async () => {
    await syncRows('Supplier_Requests', [{ Request_ID: 'SR-1', Brand: 'Apple', Quantity: '35', Request_Status: 'Waiting' }]);
    await syncRows('Supplier_Requests', [{ Request_ID: 'SR-1', Request_Status: 'Supplier Selected' }]);
    const reqs = (await getBizStore().listRows<any>('supplier_requests')).filter((r) => r.request_code === 'SR-1');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].status).toBe('Supplier Selected');
    expect(reqs[0].brand).toBe('Apple');
  });
});

describe('owner notifications', () => {
  it('builds a readable title and type from the WhatsApp text', () => {
    expect(titleFromText('🔔 SUPPLIER AVAILABILITY REQUEST\n\nRequest ID: SR-1')).toBe('Supplier availability request');
    expect(classifyNotification('⚠️ AI COULD NOT REPLY (tried 4 times)')).toBe('error');
    expect(classifyNotification('✅ Payment verified for ORD-1')).toBe('payment');
    expect(classifyNotification('💬 CUSTOMER MESSAGE (Human handling, AI paused)')).toBe('handoff');
  });
});

describe('chat access', () => {
  it('customer and supplier chats need their own permission', () => {
    const v = { role: 'agent' as const, permissions: ['chats.view'] };
    expect(canReadParty(v, 'customer')).toBe(true);
    expect(canReadParty(v, 'supplier')).toBe(false);
    expect(canReadParty({ role: 'owner' }, 'supplier')).toBe(true);
  });
});
