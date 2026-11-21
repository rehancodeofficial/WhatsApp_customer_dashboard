import { chatLink } from '@/lib/owner-chat-alert';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { canSendRealWhatsApp, isDemoMode, OWNER_WHATSAPP_NUMBER } from '@/lib/config';
import { sendMetaWhatsAppMessage } from '@/lib/whatsapp';
import { getBizStore } from './store';
import { getRepo } from '@/lib/repo';

/**
 * Checks if the inbound customer message is asking for a discount / bargaining on price.
 * Examples in Roman Urdu, Hindi, English:
 * - "kuch kam kardo", "kuch kam ho sakta hai?", "thori discount mil sakti hai?"
 * - "rate kam karo", "paise kam karo", "bohot mehnga hai", "discount milega?"
 * - "can you give discount?", "best price?", "final price kya hogi?", "any concession?"
 */
export function isBargainingMessage(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();

  // Price / discount negotiation keywords
  const bargainPatterns = [
    /(?:kam\s*(?:karo|kardein|kardo|kar\s*lo|ho\s*(?:sakta|sakti|skta|skti|ga|gi))|discount|disocunt|discnt)/i,
    /(?:bohot|zyada|bht)\s*(?:mehnga|expensive)/i,
    /(?:paise|rate|price|keemat|pese).*?(?:kam|ziada|zyada|theek|munasib|final)/i,
    /(?:final|best|last)\s*(?:price|rate|offer)/i,
    /(?:kuch\s*(?:kam|riayat|concession))/i,
    /(?:can\s*you\s*(?:give|offer|do)\s*(?:a\s*)?(?:discount|better\s*price|less))/i,
    /(?:any\s*discount|give\s*discount|lower\s*price)/i,
  ];

  return bargainPatterns.some((pattern) => pattern.test(t));
}

/**
 * Handles bargaining when customer asks for a discount:
 * 1. Automatically pauses the AI so AI doesn't give a random price.
 * 2. Finds the product/quoted price if available from recent inquiries/orders.
 * 3. Sends notification to Owner & WhatsApp with Dashboard Chat Link:
 *    - Customer asks for discount
 *    - Original quoted price / piece
 *    - Prompts owner: Reply with the price you want to offer on WhatsApp (or click the dashboard chat link to reply manually).
 */
export async function handleCustomerBargaining(opts: {
  origin: string;
  waId: string;
  customerName?: string | null;
  messageText: string;
}) {
  const store = getBizStore();
  const repo = getRepo();

  // 1. Pause AI for this customer so owner / salesman can handle
  const conv = await repo.findConversationByWaId(opts.waId).catch(() => null);
  if (conv && conv.mode === 'ai') {
    await repo.setMode(conv.id, 'human', null, 'Customer requested discount (bargaining)', null).catch(() => {});
  }

  // 2. Look up product details & original price from inquiries or orders
  const inquiries = await store.listRows<any>('customer_inquiries').catch(() => []);
  const customerInquiry = inquiries.find((i) => i.wa_id === opts.waId || (i.raw && i.raw.wa_id === opts.waId));

  const orders = await store.listOrders().catch(() => []);
  const customerOrders = orders.filter((o) => (o as any).wa_id === opts.waId || (conv && o.contact_id === conv.contact_id));
  const recentOrder = customerOrders[0];

  let productInfo = '';
  let originalPrice = '';

  if (customerInquiry) {
    productInfo = [customerInquiry.brand, customerInquiry.model, customerInquiry.storage, customerInquiry.grade].filter(Boolean).join(' ');
    originalPrice = customerInquiry.quoted_price ? `${customerInquiry.currency || 'USD'} ${customerInquiry.quoted_price}` : '';
  } else if (recentOrder && recentOrder.items?.length) {
    const item = recentOrder.items[0];
    productInfo = item.description;
    originalPrice = `${recentOrder.currency} ${item.unit_price}`;
  }

  const customerName = opts.customerName || 'Customer';
  const link = chatLink(opts.origin, opts.waId);

  const priceLine = originalPrice
    ? `📦 Product: ${productInfo || 'Item'}\n💰 Original quoted price: ${originalPrice} per piece\n\n`
    : '';

  const body = `🏷️ CUSTOMER ASKING FOR DISCOUNT (AI Paused)

Customer: ${customerName} (+${opts.waId})
Message: "${opts.messageText}"

${priceLine}👉 Ap WhatsApp par reply mein price bta dein jo customer ko deni hai, ya dashboard link open karke manually reply karein:
Open Chat in Dashboard: ${link}`;

  // Insert into notifications
  if (!isDemoMode()) {
    const db = getAdminSupabase();
    await db.from('notifications').insert({
      type: 'handoff',
      title: `Discount Request: ${customerName}`,
      body,
      wa_id: opts.waId,
      party: 'customer',
      order_no: recentOrder?.order_no || null,
      request_code: null,
      read_at: null,
    });
  }

  // Send WhatsApp message to Owner
  if (OWNER_WHATSAPP_NUMBER && canSendRealWhatsApp()) {
    await sendMetaWhatsAppMessage({
      to: OWNER_WHATSAPP_NUMBER,
      type: 'text',
      text: body,
    }).catch((e) => console.error('owner bargaining alert failed', e?.message || e));
  }

  return { paused: true, notified: true };
}
