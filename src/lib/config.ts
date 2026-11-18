// Central runtime configuration.
// Demo mode runs the whole dashboard on an in-memory store (no Supabase, no login,
// no real WhatsApp sends) so the UI can be tried before Supabase is set up.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export function isDemoMode(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') return true;
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'false') return false;
  return !SUPABASE_URL || SUPABASE_URL.includes('mockproject') || SUPABASE_URL.includes('your-project');
}

export function canSendRealWhatsApp(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
  return !!token && !token.startsWith('mock') && !token.startsWith('your-') && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

/**
 * The n8n shared secret is mandatory outside demo mode. If it is not configured,
 * every /api/n8n/* call is refused, so a missing env var never leaves the endpoints open.
 */
export function checkN8nSecret(headerValue: string | null): boolean {
  const configured = process.env.N8N_WEBHOOK_SECRET || '';
  if (!configured) return isDemoMode();
  if (!headerValue) return false;
  // constant-time-ish compare
  if (headerValue.length !== configured.length) return false;
  let diff = 0;
  for (let i = 0; i < configured.length; i++) diff |= headerValue.charCodeAt(i) ^ configured.charCodeAt(i);
  return diff === 0;
}
