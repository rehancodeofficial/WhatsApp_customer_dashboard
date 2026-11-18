import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Conversation, ConversationMode, Message } from '@/lib/types';
import { buildMemoryMessage, customerMemoryText } from '@/lib/memory-format';
import type { Repo, Viewer, ConversationFilters, InboundInput, OutboundInput, StatusInput } from './types';
import { computeStats, isPauseExpired, messagePreview, pickPatch } from './logic';

function flatten(row: any): Conversation {
  const { contacts, ...rest } = row;
  return { ...rest, contact: contacts ?? rest.contact };
}

/** Agents only see chats assigned to them or unassigned; owners see everything. */
function scopeForViewer<T extends { or: (f: string) => T }>(q: T, viewer: Viewer): T {
  if (viewer.role === 'owner' || !viewer.id) return q;
  return q.or(`assigned_to.is.null,assigned_to.eq.${viewer.id}`);
}

export class SupabaseRepo implements Repo {
  private db: SupabaseClient;
  constructor(db?: SupabaseClient) {
    this.db = db ?? getAdminSupabase();
  }

  async listConversations(viewer: Viewer, f: ConversationFilters = {}) {
    let q = this.db.from('conversations').select('*, contacts (*)').order('last_message_at', { ascending: false }).limit(500);
    if (f.channel && f.channel !== 'all') q = q.eq('channel', f.channel);
    if (f.mode && f.mode !== 'all') q = q.eq('mode', f.mode);
    if (f.filter === 'archived') q = q.eq('is_archived', true);
    else q = q.eq('is_archived', false);
    if (f.filter === 'starred') q = q.eq('is_starred', true);
    if (f.filter === 'unread') q = q.gt('unread_count', 0);
    const term = (f.q || '').replace(/[^\p{L}\p{N}\s+@._-]/gu, '').trim();
    if (term) {
      const like = `%${term}%`;
      const digits = term.replace(/[^0-9]/g, '');
      const [{ data: byMsg }, { data: byContact }] = await Promise.all([
        this.db.from('messages').select('conversation_id').ilike('body', like).limit(300),
        this.db
          .from('contacts')
          .select('id')
          .or([`name.ilike.${like}`, `profile_name.ilike.${like}`, `lead_id.ilike.${like}`, digits ? `wa_id.ilike.%${digits}%` : ''].filter(Boolean).join(','))
          .limit(300),
      ]);
      const convIds = [...new Set((byMsg || []).map((r: any) => r.conversation_id))];
      const contactIds = (byContact || []).map((r: any) => r.id);
      if (!convIds.length && !contactIds.length) return [];
      const parts = [];
      if (convIds.length) parts.push(`id.in.(${convIds.join(',')})`);
      if (contactIds.length) parts.push(`contact_id.in.(${contactIds.join(',')})`);
      q = q.or(parts.join(','));
    }
    q = scopeForViewer(q, viewer);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []).map(flatten);
  }

  async getConversation(viewer: Viewer, id: string, opts: { markRead?: boolean } = {}) {
    let q = this.db.from('conversations').select('*, contacts (*)').eq('id', id);
    q = scopeForViewer(q, viewer);
    const { data: conv } = await q.maybeSingle();
    if (!conv) return null;
    const [{ data: messages, error: mErr }, { data: events }] = await Promise.all([
      this.db.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }).limit(1000),
      this.db.from('ai_mode_events').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(100),
    ]);
    if (mErr) throw new Error(mErr.message);
    if (opts.markRead && conv.unread_count > 0) {
      await this.db.from('conversations').update({ unread_count: 0 }).eq('id', id);
      conv.unread_count = 0;
    }
    return { conversation: flatten(conv), messages: (messages || []) as Message[], events: events || [] };
  }

  async patchConversation(viewer: Viewer, id: string, body: Record<string, unknown>) {
    const updates = pickPatch(body);
    if (viewer.role !== 'owner' && 'assigned_to' in updates && updates.assigned_to !== viewer.id && updates.assigned_to !== null) {
      delete updates.assigned_to; // agents can only assign to themselves
    }
    let q = this.db.from('conversations').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    q = scopeForViewer(q, viewer);
    const { data, error } = await q.select('*, contacts (*)').maybeSingle();
    if (error) throw new Error(error.message);
    return data ? flatten(data) : null;
  }

  async setMode(conversationId: string, mode: ConversationMode, userId: string | null, reason: string, resumeAt: string | null) {
    const { data, error } = await this.db.rpc('set_ai_mode', {
      p_conversation_id: conversationId,
      p_mode: mode,
      p_user_id: userId,
      p_reason: reason,
      p_resume_at: resumeAt,
    });
    if (error) throw new Error('set_ai_mode failed: ' + error.message);
    return data as Conversation;
  }

  async findConversationByWaId(wa_id: string) {
    const { data: contact } = await this.db.from('contacts').select('id').eq('wa_id', wa_id).maybeSingle();
    if (!contact) return null;
    const { data } = await this.db.from('conversations').select('*, contacts (*)').eq('contact_id', contact.id).maybeSingle();
    return data ? flatten(data) : null;
  }

  async ingestInbound(input: InboundInput) {
    const nowIso = new Date().toISOString();

    // Idempotency: Meta / n8n may retry the same message.
    const { data: existingMsg } = await this.db
      .from('messages')
      .select('id, conversation_id')
      .eq('wa_message_id', input.wa_message_id)
      .maybeSingle();

    const contactRow: Record<string, unknown> = { wa_id: input.wa_id, updated_at: nowIso };
    if (input.name || input.profile_name) contactRow.name = input.name || input.profile_name;
    if (input.profile_name) contactRow.profile_name = input.profile_name;
    if (input.country) contactRow.country = input.country;
    if (input.preferred_language) contactRow.preferred_language = input.preferred_language;
    if (input.lead_id) contactRow.lead_id = input.lead_id;
    if (input.lead_status) contactRow.lead_status = input.lead_status;

    const { data: contact, error: cErr } = await this.db
      .from('contacts')
      .upsert(contactRow, { onConflict: 'wa_id' })
      .select('id')
      .single();
    if (cErr || !contact) throw new Error('contact upsert failed: ' + cErr?.message);

    let { data: conv } = await this.db.from('conversations').select('*').eq('contact_id', contact.id).maybeSingle();
    if (!conv) {
      const { data: created, error } = await this.db
        .from('conversations')
        .upsert({ contact_id: contact.id, channel: 'whatsapp', mode: 'ai', ai_enabled: true }, { onConflict: 'contact_id' })
        .select('*')
        .single();
      if (error || !created) throw new Error('conversation create failed: ' + error?.message);
      conv = created;
    }

    // A timed pause that has run out flips back to AI (with an audit event).
    if (isPauseExpired(conv)) {
      conv = await this.setMode(conv.id, 'ai', null, 'Timed pause ended, AI resumed automatically', null);
    }

    if (existingMsg) {
      return { contact_id: contact.id, conversation_id: conv.id, wa_id: input.wa_id, ai_enabled: conv.ai_enabled, mode: conv.mode, duplicate: true };
    }

    const { error: mErr } = await this.db.from('messages').insert({
      conversation_id: conv.id,
      channel: 'whatsapp',
      wa_message_id: input.wa_message_id,
      direction: 'inbound',
      sender_type: 'customer',
      type: input.type,
      body: input.body ?? null,
      media_url: input.media_url || null,
      media_mime: input.media_mime || null,
      transcript_or_caption: input.transcript_or_caption || null,
      status: 'delivered',
      raw: input.raw ?? {},
      created_at: nowIso,
    });
    if (mErr && !String(mErr.message).includes('duplicate')) throw new Error('message insert failed: ' + mErr.message);

    // Atomic unread increment + preview via RPC (falls back to read-modify-write).
    const preview = messagePreview(input.type, input.body);
    const { error: bumpErr } = await this.db.rpc('bump_inbound', { p_conversation_id: conv.id, p_preview: preview });
    if (bumpErr) {
      await this.db
        .from('conversations')
        .update({
          last_message_at: nowIso,
          last_customer_message_at: nowIso,
          unread_count: (conv.unread_count || 0) + 1,
          last_message_preview: preview,
          status: 'open',
          updated_at: nowIso,
        })
        .eq('id', conv.id);
    }

    // While the AI is paused, n8n's memory node does not run, so record the customer's
    // message ourselves. When the AI runs, n8n's Postgres Chat Memory saves it itself.
    if (!conv.ai_enabled) {
      await this.appendMemory(input.wa_id, 'human', customerMemoryText(input.body || '', input.type, input.transcript_or_caption));
    }

    return { contact_id: contact.id, conversation_id: conv.id, wa_id: input.wa_id, ai_enabled: conv.ai_enabled, mode: conv.mode, duplicate: false };
  }

  async logOutbound(input: OutboundInput) {
    const conv = await this.findConversationByWaId(input.wa_id);
    if (!conv) throw new Error('Conversation not found for wa_id ' + input.wa_id);
    const nowIso = new Date().toISOString();
    const row = {
      conversation_id: conv.id,
      channel: 'whatsapp',
      wa_message_id: input.wa_message_id || null,
      direction: 'outbound',
      sender_type: input.sender_type,
      sender_user_id: input.sender_user_id ?? null,
      type: input.type,
      body: input.body ?? null,
      media_url: input.media_url || null,
      media_mime: input.media_mime || null,
      status: input.status || 'sent',
      raw: input.raw ?? {},
      created_at: nowIso,
    };
    const { data, error } = input.wa_message_id
      ? await this.db.from('messages').upsert(row, { onConflict: 'wa_message_id' }).select('*').single()
      : await this.db.from('messages').insert(row).select('*').single();
    if (error) throw new Error('outbound insert failed: ' + error.message);
    await this.db
      .from('conversations')
      .update({ last_message_at: nowIso, last_message_preview: messagePreview(input.type, input.body), updated_at: nowIso })
      .eq('id', conv.id);
    return data as Message;
  }

  async updateStatus(input: StatusInput) {
    // Never move a message "backwards" (e.g. read -> delivered when webhooks arrive out of order).
    const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
    const { data: current } = await this.db.from('messages').select('id, status').eq('wa_message_id', input.wa_message_id).maybeSingle();
    if (!current) return null;
    if (input.status !== 'failed' && rank[current.status] >= rank[input.status]) return current as Message;
    const { data, error } = await this.db
      .from('messages')
      .update({ status: input.status, error_code: input.error_code ?? null, error_message: input.error_message ?? null })
      .eq('id', current.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as Message;
  }

  async appendMemory(sessionId: string, role: 'human' | 'ai', content: string) {
    const { error } = await this.db.from('n8n_chat_histories').insert({ session_id: sessionId, message: buildMemoryMessage(role, content) });
    if (error) console.error('appendMemory failed', error.message);
  }

  async autoResumeExpired() {
    const { data, error } = await this.db.rpc('check_and_resume_ai_modes');
    if (error) throw new Error(error.message);
    return Number(data) || 0;
  }

  async stats(viewer: Viewer) {
    const convs = await this.listConversations(viewer, {});
    const { count } = await this.db.from('contacts').select('*', { count: 'exact', head: true });
    return computeStats(convs, count ?? undefined);
  }
}
