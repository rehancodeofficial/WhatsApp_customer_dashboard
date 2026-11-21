// Calls the n8n "Dashboard Bridge" webhook (see N8N_CHANGES.md). n8n answers with JSON.
import { N8N_DASHBOARD_WEBHOOK_URL, n8nBridgeEnabled } from '@/lib/config';

export type BridgeAction = 'send_whatsapp' | 'send_email' | 'translate' | 'payment_verified' | 'supplier_delivered';

export async function callN8nBridge(action: BridgeAction, payload: Record<string, unknown>, timeoutMs = 20000): Promise<any> {
  if (!n8nBridgeEnabled()) throw new Error('n8n bridge is not configured');
  const res = await fetch(N8N_DASHBOARD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-n8n-secret': process.env.N8N_WEBHOOK_SECRET || '' },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`n8n bridge ${res.status}: ${data?.error?.message || data?.message || data?.error || text.slice(0, 200)}`);
  }
  return data;
}

/** Language as stored on the contact ("Roman Urdu (auto)" → "Roman Urdu"); empty → English. */
export function cleanLanguage(v: string | null | undefined) {
  return String(v || '').replace(/\s*\(auto\)\s*/gi, '').trim() || 'English';
}

/**
 * Translates an owner reply into the customer's language with n8n's Gemini (same prompt as the
 * owner translator). English or a failed translation returns the original text.
 */
export async function translateForCustomer(text: string, language: string | null | undefined): Promise<{ text: string; language: string; translated: boolean }> {
  const lang = cleanLanguage(language);
  if (/^(english|en)$/i.test(lang) || !text.trim()) return { text, language: lang, translated: false };
  const res = await callN8nBridge('translate', { text, language: lang }, 30000);
  const out = String(res?.text || '').trim();
  if (!out || res?.error) throw new Error('Translation failed' + (res?.error ? ': ' + res.error : ''));
  return { text: out, language: lang, translated: out !== text.trim() };
}
