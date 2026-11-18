import type { Conversation, ConversationMode, DashboardStats } from '@/lib/types';

export function messagePreview(type: string, body?: string | null): string {
  if (body && body.trim()) return body.trim().slice(0, 200);
  switch (type) {
    case 'audio':
      return '🎤 Voice message';
    case 'image':
      return '📷 Picture';
    case 'document':
      return '📄 Document';
    case 'template':
      return '📋 Template';
    default:
      return '📎 Attachment';
  }
}

/** A timed pause whose resume_at has passed counts as AI-on again. */
export function isPauseExpired(conv: Pick<Conversation, 'mode' | 'resume_at'>, now = Date.now()): boolean {
  return conv.mode !== 'ai' && !!conv.resume_at && new Date(conv.resume_at).getTime() <= now;
}

export function aiEnabledFor(mode: ConversationMode): boolean {
  return mode === 'ai';
}

export function defaultModeReason(mode: ConversationMode): string {
  if (mode === 'human') return 'Owner took over the chat from the dashboard';
  if (mode === 'ai') return 'AI resumed from the dashboard';
  return 'Handed over to sales';
}

export function computeStats(conversations: Conversation[], contactsCount?: number): DashboardStats {
  const open = conversations.filter((c) => !c.is_archived);
  const waiting = open.filter((c) => c.mode !== 'ai');
  return {
    totalCustomers: contactsCount ?? conversations.length,
    totalConversations: conversations.length,
    activeChats: open.filter((c) => c.status === 'open').length,
    unreadMessages: open.reduce((a, c) => a + (c.unread_count || 0), 0),
    whatsappConversations: conversations.filter((c) => c.channel === 'whatsapp').length,
    emailConversations: conversations.filter((c) => c.channel === 'email').length,
    aiHandledConversations: open.filter((c) => c.mode === 'ai').length,
    humanHandledConversations: waiting.length,
    pendingPaymentCount: conversations.filter((c) => c.payment_status === 'pending').length,
    verifiedPaymentCount: conversations.filter((c) => c.payment_status === 'verified').length,
  };
}

export const PATCHABLE_FIELDS = ['is_starred', 'is_archived', 'status', 'payment_status', 'assigned_to'] as const;

export function pickPatch(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof body.is_starred === 'boolean') out.is_starred = body.is_starred;
  if (typeof body.is_archived === 'boolean') out.is_archived = body.is_archived;
  if (body.status === 'open' || body.status === 'closed') out.status = body.status;
  if (body.payment_status === 'none' || body.payment_status === 'pending' || body.payment_status === 'verified')
    out.payment_status = body.payment_status;
  if (body.assigned_to === null || typeof body.assigned_to === 'string') out.assigned_to = body.assigned_to;
  return out;
}
