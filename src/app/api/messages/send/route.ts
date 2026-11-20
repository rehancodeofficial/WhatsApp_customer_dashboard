import { NextRequest, NextResponse } from 'next/server';
import { SendMessageSchema } from '@/lib/validations';
import { get24HourWindowStatus, sendMetaWhatsAppMessage } from '@/lib/whatsapp';
import { requireViewer } from '@/lib/auth';
import { canSendRealWhatsApp, isDemoMode } from '@/lib/config';
import { getRepo } from '@/lib/repo';
import { agentMemoryText } from '@/lib/memory-format';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/security';

// The owner / agent replies to a customer from the dashboard.
export async function POST(req: NextRequest) {
  const viewer = await requireViewer('chats.reply');
  if (viewer instanceof NextResponse) return viewer;
  if (!rateLimit(`send:${viewer.id ?? 'demo'}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many messages, wait a minute' }, { status: 429 });
  }
  const parsed = SendMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const { conversation_id, type, body, template_name, template_language } = parsed.data;
  if (type === 'text' && !body?.trim()) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  if (type === 'template' && !template_name) return NextResponse.json({ error: 'Template name is required' }, { status: 400 });

  const repo = getRepo();
  const detail = await repo.getConversation(viewer, conversation_id);
  if (!detail) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const conv = detail.conversation;
  const wa_id = conv.contact?.wa_id;
  if (!wa_id) return NextResponse.json({ error: 'Customer phone number missing' }, { status: 400 });

  // Meta 24-hour rule: free text only within 24h of the customer's last message.
  const windowStatus = get24HourWindowStatus(conv.last_customer_message_at);
  if (!windowStatus.isOpen && type !== 'template') {
    return NextResponse.json(
      { error: '24-hour window is closed (Meta error 131047). Send an approved template instead.', code: 131047 },
      { status: 403 }
    );
  }

  let waMessageId: string;
  let raw: Record<string, unknown> = {};
  if (canSendRealWhatsApp()) {
    try {
      const res = await sendMetaWhatsAppMessage({
        to: wa_id,
        type,
        text: body || undefined,
        templateName: template_name || undefined,
        templateLanguage: template_language || 'en',
      });
      waMessageId = res.waMessageId;
      raw = res.rawResponse;
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'WhatsApp send failed', code: err.code }, { status: 502 });
    }
  } else if (isDemoMode()) {
    waMessageId = `wamid.demo_out_${Date.now()}`;
    raw = { demo: true };
  } else {
    return NextResponse.json({ error: 'WhatsApp is not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' }, { status: 500 });
  }

  // Replying personally takes the chat over, so the AI does not answer the customer's next message.
  if (conv.mode === 'ai') {
    await repo.setMode(conv.id, 'human', viewer.id, 'Owner replied personally, AI paused automatically', null);
  }

  const text = type === 'template' ? `[Template: ${template_name}]` : body!.trim();
  const message = await repo.logOutbound({
    wa_id,
    wa_message_id: waMessageId,
    type,
    body: text,
    sender_type: 'agent',
    sender_user_id: viewer.id,
    status: 'sent',
    raw,
  });

  // Put the human reply into the AI's memory so it knows what was said when it resumes.
  await repo.appendMemory(wa_id, 'ai', agentMemoryText(text));

  await logActivity(viewer, 'chat.message_sent', { conversation_id, type, preview: String(text).slice(0, 120) });
  return NextResponse.json({ success: true, message });
}
