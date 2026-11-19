// Higher-level operations used by the API routes.
import { canSendRealWhatsApp, isDemoMode } from '@/lib/config';
import { getRepo } from '@/lib/repo';
import { get24HourWindowStatus, sendMetaWhatsAppMessage } from '@/lib/whatsapp';
import { getBizStore } from './store';
import { buildCustomerViews, filterAudience, personalize, productLine } from './logic';
import type { AudienceFilters, Broadcast, CustomerView } from './types';

export async function loadCustomerViews(): Promise<CustomerView[]> {
  const store = getBizStore();
  const [customers, orders, products, links] = await Promise.all([store.listCustomers(), store.listOrders(), store.listProducts(), store.conversationLinks()]);
  return buildCustomerViews(customers, orders, products, links);
}

export const MAX_BROADCAST_RECIPIENTS = 1000;

export interface SendBroadcastInput {
  title: string;
  message: string;
  product_ids: string[];
  filters: AudienceFilters;
  /** Exact customers to send to (after the owner un-ticks some). Must match the filters. */
  contact_ids: string[];
  template_name?: string | null;
  template_language?: string | null;
  ai_suggested?: boolean;
  created_by: string | null;
}

/**
 * Sends one WhatsApp message per customer.
 *  - Customer wrote in the last 24 h → free text (the personalised message).
 *  - Otherwise Meta only allows an approved template → the template is sent with
 *    {{1}} = first name and {{2}} = the product line(s). Without a template those customers fail
 *    with a clear reason (nothing is sent that Meta would reject).
 * Every sent message is also written into the customer's chat and the AI memory, so the AI
 * knows about the offer when the customer replies.
 */
export async function sendBroadcast(input: SendBroadcastInput): Promise<Broadcast> {
  const store = getBizStore();
  const repo = getRepo();
  const all = await loadCustomerViews();
  const allowed = new Map(filterAudience(all, input.filters).map((c) => [c.id, c]));
  const targets = Array.from(new Set(input.contact_ids)).map((id) => allowed.get(id)).filter(Boolean) as CustomerView[];
  if (!targets.length) throw Object.assign(new Error('No customers selected (or none match the filters)'), { status: 400 });
  if (targets.length > MAX_BROADCAST_RECIPIENTS) throw Object.assign(new Error(`At most ${MAX_BROADCAST_RECIPIENTS} customers per broadcast`), { status: 400 });

  const products = (await store.listProducts()).filter((p) => input.product_ids.includes(p.id));
  const productText = products.map(productLine).join('; ') || input.title;
  const live = !isDemoMode() && canSendRealWhatsApp();

  const { broadcast, recipients } = await store.createBroadcast(
    {
      title: input.title,
      message: input.message,
      product_ids: input.product_ids,
      filters: input.filters,
      template_name: input.template_name || null,
      ai_suggested: !!input.ai_suggested,
      status: 'sending',
      total_recipients: targets.length,
      sent_count: 0,
      failed_count: 0,
      created_by: input.created_by,
      sent_at: null,
    },
    targets.map((c) => ({ contact_id: c.id, wa_id: c.wa_id, name: c.name, status: 'queued', wa_message_id: null, error: null, sent_at: null }))
  );

  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    const c = targets.find((t) => t.id === r.contact_id)!;
    const body = personalize(input.message, c.name || c.profile_name);
    const windowOpen = get24HourWindowStatus(c.last_customer_message_at).isOpen;
    const useTemplate = !windowOpen;
    try {
      if (useTemplate && !input.template_name) {
        throw new Error('Last message older than 24 h: WhatsApp needs an approved template');
      }
      let waId: string;
      if (live) {
        const res = useTemplate
          ? await sendMetaWhatsAppMessage({
              to: c.wa_id,
              type: 'template',
              templateName: input.template_name!,
              templateLanguage: input.template_language || 'en',
              templateParams: [(c.name || c.profile_name || 'there').split(' ')[0], productText],
            })
          : await sendMetaWhatsAppMessage({ to: c.wa_id, type: 'text', text: body });
        waId = res.waMessageId;
      } else {
        waId = `wamid.demo_broadcast_${broadcast.id.slice(0, 8)}_${sent + failed}`;
      }
      const shown = useTemplate ? `[Template: ${input.template_name}] ${productText}` : body;
      await store.updateRecipient(r.id, { status: 'sent', wa_message_id: waId, sent_at: new Date().toISOString() });
      sent++;
      // Show it in the chat and give the AI the context. Never fail the broadcast for this.
      if (c.conversation_id) {
        await repo
          .logOutbound({ wa_id: c.wa_id, wa_message_id: waId, type: useTemplate ? 'template' : 'text', body: shown, sender_type: 'agent', sender_user_id: input.created_by, raw: { broadcast_id: broadcast.id } })
          .catch(() => {});
        await repo.appendMemory(c.wa_id, 'ai', `[Broadcast offer sent by Phone Buzz]: ${shown}`).catch(() => {});
      }
    } catch (e: any) {
      failed++;
      await store.updateRecipient(r.id, { status: 'failed', error: String(e?.message || e).slice(0, 300) });
    }
  }

  const done: Partial<Broadcast> = {
    status: failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial',
    sent_count: sent,
    failed_count: failed,
    sent_at: new Date().toISOString(),
  };
  await store.updateBroadcast(broadcast.id, done);
  return { ...broadcast, ...done } as Broadcast;
}
