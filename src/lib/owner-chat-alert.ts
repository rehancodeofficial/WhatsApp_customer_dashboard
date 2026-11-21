// While the owner handles a chat (mode "human"), the AI is silent. Each new customer / supplier
// message is announced to the owner (dashboard bell + WhatsApp) with a link that opens the chat
// in the dashboard, where his reply is translated and sent. At most one alert per chat every 2 minutes.
import { canSendRealWhatsApp, isDemoMode, OWNER_WHATSAPP_NUMBER } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sendMetaWhatsAppMessage } from '@/lib/whatsapp';

export const chatLink = (origin: string, waId: string) => `${origin.replace(/\/$/, '')}/dashboard?chat=${encodeURIComponent(waId)}`;

export async function alertOwnerNewMessage(opts: { origin: string; waId: string; name?: string | null; party?: 'customer' | 'supplier' | null; text: string }) {
  if (isDemoMode()) return;
  const db = getAdminSupabase();
  const since = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: recent } = await db.from('notifications').select('id').eq('wa_id', opts.waId).eq('type', 'handoff').gte('created_at', since).limit(1);
  if (recent?.length) return;
  const customerName = opts.name || 'Customer';
  const link = chatLink(opts.origin, opts.waId);
  const preview = opts.text.length > 400 ? opts.text.slice(0, 400) + '…' : opts.text;
  const body = `New msg from ${customerName}\n${link}`;
  await db.from('notifications').insert({ type: 'handoff', title: `New msg from ${customerName}`, body, wa_id: opts.waId, party: opts.party || 'customer', order_no: null, request_code: null, read_at: null });
  if (OWNER_WHATSAPP_NUMBER && canSendRealWhatsApp()) {
    await sendMetaWhatsAppMessage({ to: OWNER_WHATSAPP_NUMBER, type: 'text', text: body }).catch((e) => console.error('owner chat alert failed', e?.message || e));
  }
}
