import { z } from 'zod';

export const ConversationModeEnum = z.enum(['ai', 'human', 'handoff']);
export const MessageStatusEnum = z.enum(['queued', 'sent', 'delivered', 'read', 'failed']);
const MESSAGE_TYPES = ['text', 'image', 'audio', 'document', 'template', 'other'] as const;

// n8n expressions often produce "" instead of null; treat blanks as missing.
const optText = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.string().nullable().optional());
const messageType = z.preprocess(
  (v) => {
    const s = String(v ?? 'text').toLowerCase();
    if (s === 'voice' || s === 'ptt') return 'audio';
    if (s === 'picture' || s === 'sticker') return 'image';
    return (MESSAGE_TYPES as readonly string[]).includes(s) ? s : 'other';
  },
  z.enum(MESSAGE_TYPES)
);
// "+971 50-123 4567" -> "971501234567"
const waId = z.preprocess((v) => String(v ?? '').replace(/[^0-9]/g, ''), z.string().min(6).max(20));

const party = z.preprocess((v) => (v === '' || v == null ? undefined : String(v).toLowerCase()), z.enum(['customer', 'supplier']).optional());

export const InboundMessageSchema = z.object({
  wa_id: waId,
  party,
  wa_message_id: z.string().min(1),
  name: optText,
  profile_name: optText,
  country: optText,
  preferred_language: optText,
  lead_id: optText,
  lead_status: optText,
  type: messageType,
  body: optText,
  media_url: optText,
  media_mime: optText,
  transcript_or_caption: optText,
  raw: z.record(z.any()).optional().default({}),
});

export const OutboundLogSchema = z.object({
  wa_id: waId,
  party,
  name: optText,
  wa_message_id: optText,
  type: messageType,
  body: optText,
  media_url: optText,
  media_mime: optText,
  sender_type: z.enum(['ai', 'agent', 'system']).default('ai'),
  raw: z.record(z.any()).optional().default({}),
});

export const DeliveryStatusSchema = z.object({
  wa_message_id: z.string().min(1),
  status: MessageStatusEnum,
  timestamp: z.union([z.string(), z.number()]).optional(),
  error_code: z.preprocess((v) => (v === '' || v == null ? null : String(v)), z.string().nullable().optional()),
  error_message: optText,
});

export const N8nModeSchema = z.object({
  wa_id: waId,
  mode: ConversationModeEnum,
  reason: optText,
});

export const SendMessageSchema = z.object({
  conversation_id: z.string().min(1),
  type: z.enum(['text', 'template']).default('text'),
  body: z.string().max(4096).optional().nullable(),
  subject: z.string().max(300).optional().nullable(),
  template_name: z.string().regex(/^[a-z0-9_]+$/).optional().nullable(),
  template_language: z.string().optional().default('en'),
  /** Translate the owner's text into the customer's language before sending (default on). */
  translate: z.boolean().optional().default(true),
});

export const SetModeSchema = z.object({
  mode: ConversationModeEnum,
  reason: z.string().max(300).optional().nullable(),
  resume_in_minutes: z.number().int().positive().max(60 * 24 * 30).optional().nullable(),
  /** Owner's password: needed to pause the AI by hand. */
  password: z.string().max(200).optional(),
});
