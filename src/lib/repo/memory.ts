// In-memory store used in DEMO MODE only (no Supabase configured).
// Lives on globalThis so it survives Next.js hot reloads; resets when the server restarts.
import { randomUUID } from 'crypto';
import type { AIModeEvent, Contact, Conversation, ConversationMode, Message } from '@/lib/types';
import { buildMemoryMessage, customerMemoryText } from '@/lib/memory-format';
import type { Repo, Viewer, ConversationFilters, InboundInput, OutboundInput, StatusInput } from './types';
import { aiEnabledFor, computeStats, isPauseExpired, messagePreview, pickPatch } from './logic';

interface Store {
  contacts: Contact[];
  conversations: Omit<Conversation, 'contact'>[];
  messages: Message[];
  events: AIModeEvent[];
  memory: { id: number; session_id: string; message: unknown }[];
}

const ago = (min: number) => new Date(Date.now() - min * 60000).toISOString();

function seed(): Store {
  const contacts: Contact[] = [
    { id: randomUUID(), wa_id: '971501234567', name: 'Tariq Al Mansoori', profile_name: 'Tariq', country: 'United Arab Emirates', preferred_language: 'English', lead_id: 'LEAD-101', lead_status: 'Interested', tags: ['VIP', 'Dubai'], notes: 'Wants 50 pcs iPhone 15 Pro Max 256GB.', created_at: ago(3000) },
    { id: randomUUID(), wa_id: '923001234567', name: 'Bilal Ahmed', profile_name: 'Bilal', country: 'Pakistan', preferred_language: 'Roman Urdu', lead_id: 'LEAD-102', lead_status: 'Price Negotiation', tags: ['Karachi'], notes: 'Negotiating Samsung A55 price.', created_at: ago(2000) },
    { id: randomUUID(), wa_id: '966509876543', name: 'Sami Al Otaibi', profile_name: 'Sami', country: 'Saudi Arabia', preferred_language: 'Arabic', lead_id: 'LEAD-103', lead_status: 'Handed Over to Sales', tags: ['Riyadh'], notes: 'Order ORD-9812 waiting for payment.', created_at: ago(1500) },
    { id: randomUUID(), wa_id: '254712345678', name: 'Grace Wanjiru', profile_name: 'Grace', country: 'Kenya', preferred_language: 'English', lead_id: 'LEAD-104', lead_status: 'Follow-up Required', tags: [], notes: null, created_at: ago(5000) },
  ];
  const conv = (c: Contact, mode: ConversationMode, lastCustomerMin: number, unread: number, extra: Partial<Conversation> = {}) => ({
    id: randomUUID(),
    contact_id: c.id,
    channel: 'whatsapp' as const,
    ai_enabled: mode === 'ai',
    mode,
    paused_by: null,
    paused_at: mode === 'ai' ? null : ago(40),
    resume_at: null,
    assigned_to: null,
    last_message_at: ago(lastCustomerMin - 1),
    last_customer_message_at: ago(lastCustomerMin),
    unread_count: unread,
    last_message_preview: null,
    status: 'open' as const,
    is_starred: false,
    is_archived: false,
    payment_status: 'none' as const,
    created_at: c.created_at,
    ...extra,
  });
  const conversations = [
    conv(contacts[0], 'ai', 12, 0, { is_starred: true }),
    conv(contacts[1], 'human', 3, 2),
    conv(contacts[2], 'handoff', 90, 0, { payment_status: 'pending' }),
    conv(contacts[3], 'ai', 26 * 60, 0),
  ];
  let n = 0;
  const msg = (ci: number, sender: Message['sender_type'], body: string, minAgo: number, status: Message['status'] = 'read'): Message => ({
    id: randomUUID(),
    conversation_id: conversations[ci].id,
    channel: 'whatsapp',
    wa_message_id: `wamid.demo_${++n}`,
    direction: sender === 'customer' ? 'inbound' : 'outbound',
    sender_type: sender,
    sender_user_id: null,
    type: 'text',
    body,
    media_url: null,
    media_mime: null,
    transcript_or_caption: null,
    status,
    error_code: null,
    error_message: null,
    raw: {},
    created_at: ago(minAgo),
  });
  const messages: Message[] = [
    msg(0, 'customer', 'Hi, do you have iPhone 15 Pro Max 256GB in stock?', 20),
    msg(0, 'ai', 'Hello Tariq! Yes, we have iPhone 15 Pro Max 256GB in Natural and Black Titanium. How many units do you need?', 19),
    msg(0, 'customer', 'I need 50 pieces. Best price?', 12),
    msg(0, 'ai', 'For 50 units the price is AED 3,850 per piece. Shall I prepare the order?', 11, 'delivered'),
    msg(1, 'customer', 'Samsung A55 ka rate kya hai 100 pcs ke liye?', 50),
    msg(1, 'ai', 'Samsung A55 128GB ka rate 100 pcs ke liye AED 1,020 per piece hai.', 49),
    msg(1, 'customer', 'Thora kam karo, 980 pe final karo', 45),
    { ...msg(1, 'system', 'Owner took over the chat. AI paused.', 40), direction: 'outbound' },
    msg(1, 'agent', 'Bilal bhai, 1,000 pe final kar dete hain agar aaj payment ho jaye.', 38),
    msg(1, 'customer', 'Theek hai, account details bhej dein', 3, 'delivered'),
    msg(2, 'customer', 'I want to order 30 pcs iPhone 13 128GB', 120),
    msg(2, 'ai', 'Your order ORD-9812 is created. Our sales team will share payment details shortly.', 119),
    msg(2, 'customer', 'Ok waiting', 90),
    msg(3, 'customer', 'Do you ship to Nairobi?', 26 * 60),
    msg(3, 'ai', 'Yes, we ship to Nairobi by air cargo. Which models are you interested in?', 26 * 60 - 1),
  ];
  for (const c of conversations) {
    const last = messages.filter((m) => m.conversation_id === c.id).at(-1);
    c.last_message_preview = last?.body ?? null;
    c.last_message_at = last?.created_at ?? c.last_message_at;
  }
  const events: AIModeEvent[] = [
    { id: randomUUID(), conversation_id: conversations[1].id, from_mode: 'ai', to_mode: 'human', changed_by: null, reason: 'Owner took over the chat from the dashboard', created_at: ago(40) },
    { id: randomUUID(), conversation_id: conversations[2].id, from_mode: 'ai', to_mode: 'handoff', changed_by: null, reason: 'AI handed the order to sales', created_at: ago(119) },
  ];
  return { contacts, conversations, messages, events, memory: [] };
}

const g = globalThis as unknown as { __phonebuzzDemoStore?: Store };
function store(): Store {
  if (!g.__phonebuzzDemoStore) g.__phonebuzzDemoStore = seed();
  return g.__phonebuzzDemoStore;
}

export function resetDemoStore() {
  g.__phonebuzzDemoStore = seed();
}

export function demoMemory(sessionId: string) {
  return store().memory.filter((m) => m.session_id === sessionId);
}

export class MemoryRepo implements Repo {
  private withContact(c: Omit<Conversation, 'contact'>): Conversation {
    return { ...c, contact: store().contacts.find((x) => x.id === c.contact_id) };
  }

  // Admin and Management both see every customer chat.
  private visible(_viewer: Viewer, _c: Omit<Conversation, 'contact'>) {
    return true;
  }

  async listConversations(viewer: Viewer, f: ConversationFilters = {}) {
    await this.autoResumeExpired();
    return store()
      .conversations.filter((c) => this.visible(viewer, c))
      .filter((c) => (f.filter === 'archived' ? c.is_archived : !c.is_archived))
      .filter((c) => !f.channel || f.channel === 'all' || c.channel === f.channel)
      .filter((c) => !f.mode || f.mode === 'all' || c.mode === f.mode)
      .filter((c) => f.filter !== 'starred' || c.is_starred)
      .filter((c) => f.filter !== 'unread' || c.unread_count > 0)
      .filter((c) => {
        const term = (f.q || '').trim().toLowerCase();
        if (!term) return true;
        const contact = store().contacts.find((x) => x.id === c.contact_id);
        const digits = term.replace(/[^0-9]/g, '');
        if ([contact?.name, contact?.profile_name, contact?.lead_id].some((v) => v && v.toLowerCase().includes(term))) return true;
        if (digits && contact?.wa_id.includes(digits)) return true;
        return store().messages.some((m) => m.conversation_id === c.id && (m.body || '').toLowerCase().includes(term));
      })
      .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
      .map((c) => this.withContact(c));
  }

  async getConversation(viewer: Viewer, id: string, opts: { markRead?: boolean } = {}) {
    const c = store().conversations.find((x) => x.id === id);
    if (!c || !this.visible(viewer, c)) return null;
    if (opts.markRead) c.unread_count = 0;
    return {
      conversation: this.withContact(c),
      messages: store().messages.filter((m) => m.conversation_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      events: store().events.filter((e) => e.conversation_id === id).reverse().sort((a, b) => b.created_at.localeCompare(a.created_at)),
    };
  }

  async patchConversation(viewer: Viewer, id: string, body: Record<string, unknown>) {
    const c = store().conversations.find((x) => x.id === id);
    if (!c || !this.visible(viewer, c)) return null;
    Object.assign(c, pickPatch(body));
    return this.withContact(c);
  }

  async setMode(conversationId: string, mode: ConversationMode, userId: string | null, reason: string, resumeAt: string | null) {
    const c = store().conversations.find((x) => x.id === conversationId);
    if (!c) throw new Error('Conversation not found');
    const from = c.mode;
    c.mode = mode;
    c.ai_enabled = aiEnabledFor(mode);
    c.paused_by = mode === 'ai' ? null : userId;
    c.paused_at = mode === 'ai' ? null : new Date().toISOString();
    c.resume_at = mode === 'ai' ? null : resumeAt;
    store().events.push({ id: randomUUID(), conversation_id: c.id, from_mode: from, to_mode: mode, changed_by: userId, reason, created_at: new Date().toISOString() });
    return this.withContact(c);
  }

  async findConversationByWaId(wa_id: string) {
    const contact = store().contacts.find((x) => x.wa_id === wa_id);
    const c = contact && store().conversations.find((x) => x.contact_id === contact.id);
    return c ? this.withContact(c) : null;
  }

  async ingestInbound(input: InboundInput) {
    const s = store();
    const nowIso = new Date().toISOString();
    let contact = s.contacts.find((x) => x.wa_id === input.wa_id);
    if (!contact) {
      contact = { id: randomUUID(), wa_id: input.wa_id, name: null, profile_name: null, country: null, preferred_language: 'English', lead_id: null, lead_status: null, tags: [], notes: null, created_at: nowIso };
      s.contacts.push(contact);
    }
    if (input.name || input.profile_name) contact.name = (input.name || input.profile_name) ?? null;
    if (input.profile_name) contact.profile_name = input.profile_name;
    if (input.country) contact.country = input.country;
    if (input.preferred_language) contact.preferred_language = input.preferred_language;
    if (input.lead_id) contact.lead_id = input.lead_id;
    if (input.lead_status) contact.lead_status = input.lead_status;

    let c = s.conversations.find((x) => x.contact_id === contact!.id);
    if (!c) {
      c = { id: randomUUID(), contact_id: contact.id, channel: 'whatsapp', ai_enabled: true, mode: 'ai', paused_by: null, paused_at: null, resume_at: null, assigned_to: null, last_message_at: nowIso, last_customer_message_at: nowIso, unread_count: 0, last_message_preview: null, status: 'open', is_starred: false, is_archived: false, payment_status: 'none', created_at: nowIso };
      s.conversations.push(c);
    }
    if (isPauseExpired(c)) await this.setMode(c.id, 'ai', null, 'Timed pause ended, AI resumed automatically', null);

    const duplicate = s.messages.some((m) => m.wa_message_id === input.wa_message_id);
    if (!duplicate) {
      s.messages.push({ id: randomUUID(), conversation_id: c.id, channel: 'whatsapp', wa_message_id: input.wa_message_id, direction: 'inbound', sender_type: 'customer', sender_user_id: null, type: input.type, body: input.body ?? null, media_url: input.media_url || null, media_mime: input.media_mime || null, transcript_or_caption: input.transcript_or_caption || null, status: 'delivered', error_code: null, error_message: null, raw: input.raw ?? {}, created_at: nowIso });
      c.last_message_at = nowIso;
      c.last_customer_message_at = nowIso;
      c.unread_count += 1;
      c.last_message_preview = messagePreview(input.type, input.body);
      c.status = 'open';
      if (!c.ai_enabled) await this.appendMemory(input.wa_id, 'human', customerMemoryText(input.body || '', input.type, input.transcript_or_caption));
    }
    return { contact_id: contact.id, conversation_id: c.id, wa_id: input.wa_id, ai_enabled: c.ai_enabled, mode: c.mode, duplicate };
  }

  async logOutbound(input: OutboundInput) {
    const s = store();
    const contact = s.contacts.find((x) => x.wa_id === input.wa_id);
    const c = contact && s.conversations.find((x) => x.contact_id === contact.id);
    if (!c) throw new Error('Conversation not found for wa_id ' + input.wa_id);
    const nowIso = new Date().toISOString();
    const m: Message = { id: randomUUID(), conversation_id: c.id, channel: 'whatsapp', wa_message_id: input.wa_message_id || null, direction: 'outbound', sender_type: input.sender_type, sender_user_id: input.sender_user_id ?? null, type: input.type, body: input.body ?? null, media_url: input.media_url || null, media_mime: input.media_mime || null, transcript_or_caption: null, status: input.status || 'sent', error_code: null, error_message: null, raw: input.raw ?? {}, created_at: nowIso };
    s.messages.push(m);
    c.last_message_at = nowIso;
    c.last_message_preview = messagePreview(input.type, input.body);
    return m;
  }

  async updateStatus(input: StatusInput) {
    const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
    const m = store().messages.find((x) => x.wa_message_id === input.wa_message_id);
    if (!m) return null;
    if (input.status !== 'failed' && rank[m.status] >= rank[input.status]) return m;
    m.status = input.status;
    m.error_code = input.error_code ?? null;
    m.error_message = input.error_message ?? null;
    return m;
  }

  async appendMemory(sessionId: string, role: 'human' | 'ai', content: string) {
    const s = store();
    s.memory.push({ id: s.memory.length + 1, session_id: sessionId, message: buildMemoryMessage(role, content) });
  }

  async autoResumeExpired() {
    let n = 0;
    for (const c of store().conversations) {
      if (isPauseExpired(c)) {
        await this.setMode(c.id, 'ai', null, 'Timed pause ended, AI resumed automatically', null);
        n++;
      }
    }
    return n;
  }

  async stats(viewer: Viewer) {
    return computeStats(await this.listConversations(viewer, {}), store().contacts.length);
  }
}
