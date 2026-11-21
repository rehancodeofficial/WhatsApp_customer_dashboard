import { NextRequest, NextResponse } from 'next/server';
import { InboundMessageSchema } from '@/lib/validations';
import { checkN8nSecret } from '@/lib/config';
import { getRepo } from '@/lib/repo';
import { alertOwnerNewMessage } from '@/lib/owner-chat-alert';
import { isDeliveryConfirmation, handleCustomerDeliveryConfirmation } from '@/lib/biz/customer-delivery';

// Called by n8n for every customer WhatsApp message.
// Returns { ai_enabled, mode } so the n8n IF node decides whether the AI may reply.
export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) {
    return NextResponse.json({ error: 'Unauthorized: invalid x-n8n-secret' }, { status: 401 });
  }
  const parsed = InboundMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // ai_enabled is omitted on purpose: n8n treats "missing" as "let the AI reply" (fail-open).
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await getRepo().ingestInbound(parsed.data);
    const msgText = parsed.data.body || parsed.data.transcript_or_caption || '';

    // Check if customer is confirming order delivery (e.g. "hogya dliver thanks", "received", etc.)
    if (parsed.data.party !== 'supplier' && isDeliveryConfirmation(msgText)) {
      await handleCustomerDeliveryConfirmation({
        waId: parsed.data.wa_id,
        customerName: parsed.data.name || parsed.data.profile_name,
        messageText: msgText,
      }).catch((e) => console.error('customer delivery confirmation failed', e));
    }

    // Owner is handling this chat: AI stays silent, so tell the owner (with a link to the dashboard chat).
    if (result.mode === 'human' && !(result as any).duplicate) {
      await alertOwnerNewMessage({
        origin: req.nextUrl.origin,
        waId: parsed.data.wa_id,
        name: parsed.data.name || parsed.data.profile_name,
        party: parsed.data.party ?? 'customer',
        text: parsed.data.body || parsed.data.transcript_or_caption || `[${parsed.data.type}]`,
      }).catch((e) => console.error('owner alert failed', e));
    }
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('inbound failed', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
