// Calls the n8n "Dashboard Bridge" webhook (see N8N_CHANGES.md). n8n answers with JSON.
import { N8N_DASHBOARD_WEBHOOK_URL, n8nBridgeEnabled } from '@/lib/config';

export type BridgeAction = 'send_whatsapp';

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
