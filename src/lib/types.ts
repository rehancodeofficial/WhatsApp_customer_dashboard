export type ConversationMode = 'ai' | 'human' | 'handoff';
export type ConversationStatus = 'open' | 'closed';
export type MessageSenderType = 'customer' | 'ai' | 'agent' | 'system';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type CommunicationChannel = 'whatsapp' | 'email';
export type PaymentStatus = 'none' | 'pending' | 'verified';

export interface Contact {
  id: string;
  wa_id: string;
  email?: string | null;
  name: string | null;
  profile_name: string | null;
  company?: string | null;
  avatar_url?: string | null;
  country: string | null;
  preferred_language: string;
  lead_id: string | null;
  lead_status: string | null;
  tags: string[];
  notes: string | null;
  /** customer (default) or supplier */
  kind?: 'customer' | 'supplier';
  city?: string | null;
  payment_tier?: 'high' | 'medium' | 'low' | null;
  preferred_brands?: string[];
  marketing_opt_in?: boolean;
  is_online?: boolean;
  last_seen_at?: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  channel: CommunicationChannel;
  subject?: string | null; // For email threads
  ai_enabled: boolean;
  mode: ConversationMode;
  paused_by: string | null;
  paused_at: string | null;
  resume_at: string | null;
  assigned_to: string | null;
  last_message_at: string;
  last_customer_message_at: string | null;
  unread_count: number;
  last_message_preview: string | null;
  status: ConversationStatus;
  is_starred?: boolean;
  is_archived?: boolean;
  payment_status?: PaymentStatus;
  created_at: string;
  contact?: Contact;
}

export interface MessageAttachment {
  name: string;
  url: string;
  size?: string;
  type?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  channel: CommunicationChannel;
  wa_message_id: string | null;
  direction: MessageDirection;
  sender_type: MessageSenderType;
  sender_user_id: string | null;
  type: string;
  subject?: string | null;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  transcript_or_caption: string | null;
  attachments?: MessageAttachment[];
  status: MessageStatus;
  error_code: string | null;
  error_message: string | null;
  raw: any;
  created_at: string;
}

export interface AIModeEvent {
  id: string;
  conversation_id: string;
  from_mode: ConversationMode | null;
  to_mode: ConversationMode;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface DashboardStats {
  totalCustomers: number;
  totalConversations: number;
  activeChats: number;
  unreadMessages: number;
  whatsappConversations: number;
  emailConversations: number;
  aiHandledConversations: number;
  humanHandledConversations: number;
  pendingPaymentCount: number;
  verifiedPaymentCount: number;
}
