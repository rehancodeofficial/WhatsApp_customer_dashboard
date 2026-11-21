import { getBizStore } from './store';
import { watchInventory } from './inventory-sync';
import type { Order } from './types';

/**
 * Checks if an inbound message from a customer signifies that their order was delivered.
 * Handles variations like:
 * - "hogya dliver thanks", "hogya deliver", "deliver hogya"
 * - "received order", "mil gaya order", "mil gya"
 * - "parcel mil gaya", "delivered"
 */
export function isDeliveryConfirmation(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();

  // Common phrases for "delivered / received" in Roman Urdu, Hindi, English
  // Examples:
  // "hogya dliver thanks", "hogya deliver", "deliver ho gaya", "dliver hogya"
  // "mil gaya", "mil gya", "received", "parcel mil gaya", "order mil gaya"
  const deliverWord = /(?:deliver|dliver|dleiver|delievr|delivery|dlivery)/i;
  const receiveWord = /(?:received|mil\s*ga?ya|pahunch\s*ga?ya|mil\s*gaya|recieved)/i;
  const doneWord = /(?:ho\s*ga?ya|hogya|ho\s*gya|done|hogaya)/i;

  if (deliverWord.test(t) && (doneWord.test(t) || receiveWord.test(t) || /thanks|thank\s*you|yes|shukriya|g\b|jee\b/i.test(t))) {
    return true;
  }

  if (receiveWord.test(t) && (/(?:order|parcel|saman|items?|package)/i.test(t) || doneWord.test(t))) {
    return true;
  }

  // Exact short confirmations like "delivered", "hogya deliver", "order delivered"
  if (/^(?:delivered|hogya\s*d(?:e|l)ie?ve?r|order\s*delivered|parcel\s*delivered)[.!]*$/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * When a customer confirms delivery:
 * 1. Find the customer's active order (shipped, paid, confirmed, or pending - not already delivered or cancelled).
 * 2. Update order status to 'delivered'.
 * 3. updateOrder automatically releases the reserved_qty of products belonging to that order.
 * 4. Alert the owner via notifications table.
 */
export async function handleCustomerDeliveryConfirmation(opts: {
  waId: string;
  customerName?: string | null;
  messageText: string;
}): Promise<{ updated: boolean; order?: Order }> {
  const store = getBizStore();
  const customers = await store.listCustomers().catch(() => []);
  const customer = customers.find((c) => c.wa_id === opts.waId);
  if (!customer) return { updated: false };

  const orders = await store.listOrders().catch(() => []);
  // Find open order for this customer that is not yet delivered or cancelled
  const candidateOrders = orders
    .filter((o) => o.contact_id === customer.id && o.status !== 'delivered' && o.status !== 'cancelled')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const targetOrder = candidateOrders[0];
  if (!targetOrder) return { updated: false };

  // Update order status to delivered with watchInventory so stock sheets & alerts stay in sync
  const updatedOrder = await watchInventory('dashboard', () =>
    store.updateOrder(targetOrder.id, { status: 'delivered' })
  );

  // Notify owner
  const who = opts.customerName || customer.name || `+${opts.waId}`;
  await store.upsertRow<any>('notifications', null, {
    type: 'order',
    title: `Order Delivered: ${targetOrder.order_no}`,
    body: `✅ Customer ${who} confirmed delivery:\n"${opts.messageText}"\n\nOrder ${targetOrder.order_no} status updated to DELIVERED and reserved units released from inventory.`,
    wa_id: opts.waId,
    party: 'customer',
    order_no: targetOrder.order_no,
    request_code: null,
    read_at: null,
  }).catch(() => {});

  return { updated: true, order: updatedOrder };
}
