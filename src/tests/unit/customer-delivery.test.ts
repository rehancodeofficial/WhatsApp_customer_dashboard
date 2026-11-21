import { describe, it, expect, beforeEach } from 'vitest';
import { isDeliveryConfirmation, handleCustomerDeliveryConfirmation } from '@/lib/biz/customer-delivery';
import { getBizStore } from '@/lib/biz/store';

describe('Customer Delivery Confirmation', () => {
  it('detects variations of customer delivery phrases', () => {
    expect(isDeliveryConfirmation('hogya dliver thanks')).toBe(true);
    expect(isDeliveryConfirmation('hogya deliver')).toBe(true);
    expect(isDeliveryConfirmation('deliver hogya')).toBe(true);
    expect(isDeliveryConfirmation('order mil gaya thanks')).toBe(true);
    expect(isDeliveryConfirmation('parcel mil gaya')).toBe(true);
    expect(isDeliveryConfirmation('delivered')).toBe(true);
    expect(isDeliveryConfirmation('received')).toBe(false); // just "received" alone without order/parcel
    expect(isDeliveryConfirmation('received the order')).toBe(true);

    // Negative cases
    expect(isDeliveryConfirmation('kya delivery available hai?')).toBe(false);
    expect(isDeliveryConfirmation('delivery kitne din me hogi?')).toBe(false);
    expect(isDeliveryConfirmation('hello')).toBe(false);
  });

  it('updates order status to delivered and releases reserved stock', async () => {
    const store = getBizStore();
    const products = await store.listProducts();
    const p = products[0];

    // Set initial product stock and reserved_qty
    await store.saveProduct(p.id, { stock_qty: 100, reserved_qty: 20 });

    const c = await store.createCustomer({ wa_id: '923999999999', name: 'Test Customer' });
    const order = await store.createOrder({
      contact_id: c.id,
      status: 'pending',
      items: [{ product_id: p.id, quantity: 5, unit_price: 1000 }],
    });

    // Check reserved_qty before
    const pBefore = (await store.listProducts()).find((x) => x.id === p.id)!;
    expect(pBefore.reserved_qty).toBe(20);

    // Process customer message "hogya dliver thanks"
    const res = await handleCustomerDeliveryConfirmation({
      waId: '923999999999',
      customerName: 'Test Customer',
      messageText: 'hogya dliver thanks',
    });

    expect(res.updated).toBe(true);
    expect(res.order?.status).toBe('delivered');

    // Verify order in store is now delivered
    const updatedOrder = (await store.listOrders()).find((o) => o.id === order.id)!;
    expect(updatedOrder.status).toBe('delivered');

    // Verify reserved units reduced by order quantity (20 - 5 = 15)
    const pAfter = (await store.listProducts()).find((x) => x.id === p.id)!;
    expect(pAfter.reserved_qty).toBe(15);
  });
});
