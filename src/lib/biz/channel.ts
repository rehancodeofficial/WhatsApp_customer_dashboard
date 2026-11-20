// Customers who wrote by email only have no WhatsApp number. They are stored with a placeholder
// wa_id "email:<address>" (contacts.wa_id is required and unique) and are reached by email.
export const EMAIL_PREFIX = 'email:';

export const emailKey = (email: string) => EMAIL_PREFIX + email.trim().toLowerCase();
export const isEmailOnly = (waId: string | null | undefined) => String(waId || '').startsWith(EMAIL_PREFIX);
export const channelOf = (c: { wa_id?: string | null }) => (isEmailOnly(c.wa_id) ? 'email' : 'whatsapp') as 'email' | 'whatsapp';

/** "+923001234567" for WhatsApp customers, the email address for email-only customers. */
export function contactLabel(c: { wa_id?: string | null; email?: string | null }) {
  if (isEmailOnly(c.wa_id)) return c.email || String(c.wa_id).slice(EMAIL_PREFIX.length);
  return c.wa_id ? `+${c.wa_id}` : c.email || '';
}
