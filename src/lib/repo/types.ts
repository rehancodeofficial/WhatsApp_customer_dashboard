import type {
  AIModeEvent,
  Conversation,
  ConversationMode,
  DashboardStats,
  Message,
  MessageStatus,
} from '@/lib/types';
import type { MemoryRole } from '@/lib/memory-format';

export interface Viewer {
  id: string | null; // null = system / n8n / demo
  role: 'owner' | 'agent';
  name?: string;
}

export interface InboundInput {
  wa_id: string;
  wa_message_id: string;
  name?: string | null;
  profile_name?: string | null;
  country?: string | null;
  preferred_language?: string | null;
  lead_id?: string | null;
  lead_status?: string | null;
  type: string;
  body?: string | null;
  media_url?: string | null;
  media_mime?: string | null;
  transcript_or_caption?: string | null;
  raw?: Record<string, unknown>;
}

export interface InboundResult {
  contact_id: string;
  conversation_id: string;
  wa_id: string;
  ai_enabled: boolean;
  mode: ConversationMode;
  duplicate: boolean;
}

export interface OutboundInput {
  wa_id: string;
  wa_message_id?: string | null;
  type: string;
  body?: string | null;
  media_url?: string | null;
  media_mime?: string | null;
  sender_type: 'ai' | 'agent' | 'system';
  sender_user_id?: string | null;
  status?: MessageStatus;
  raw?: Record<string, unknown>;
}

export interface StatusInput {
  wa_message_id: string;
  status: MessageStatus;
  error_code?: string | null;
  error_message?: string | null;
}

export interface ConversationFilters {
  channel?: string | null;
  mode?: string | null;
  filter?: string | null;
  q?: string | null; // search name, number or message text
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  events: AIModeEvent[];
}

export interface Repo {
  listConversations(viewer: Viewer, f?: ConversationFilters): Promise<Conversation[]>;
  getConversation(viewer: Viewer, id: string, opts?: { markRead?: boolean }): Promise<ConversationDetail | null>;
  patchConversation(viewer: Viewer, id: string, updates: Record<string, unknown>): Promise<Conversation | null>;
  setMode(
    conversationId: string,
    mode: ConversationMode,
    userId: string | null,
    reason: string,
    resumeAt: string | null
  ): Promise<Conversation>;
  findConversationByWaId(wa_id: string): Promise<Conversation | null>;
  ingestInbound(input: InboundInput): Promise<InboundResult>;
  logOutbound(input: OutboundInput): Promise<Message>;
  updateStatus(input: StatusInput): Promise<Message | null>;
  appendMemory(sessionId: string, role: MemoryRole, content: string): Promise<void>;
  autoResumeExpired(): Promise<number>;
  stats(viewer: Viewer): Promise<DashboardStats>;
}
