import { NextRequest, NextResponse } from 'next/server';
import { SendMessageSchema } from '@/lib/validations';
import { get24HourWindowStatus, sendMetaWhatsAppMessage } from '@/lib/whatsapp';
import { requireViewer } from '@/lib/auth';
import { canSendRealWhatsApp, isDemoMode } from '@/lib/config';
import { getRepo } from '@/lib/repo';
import { agentMemoryText } from '@/lib/memory-format';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/security';
import { translateForCustomer } from '@/lib/n8n-bridge';

// Translation (n8n Gemini) + WhatsApp send can take a few seconds.
export const maxDuration = 60;

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
  const { conversation_id, type, body, template_name, template_language, translate } = parsed.data;
  if (type === 'text' && !body?.trim()) return NextResponse.json({ error: 'Message is empty' }, { status: 400 });
  if (type === 'template' && !template_name) return NextResponse.json({ error: 'Template name is required' }, { status: 400 });

  const repo = getRepo();
  const detail = await repo.getConversation(viewer, conversation_id);
  if (!detail) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  const conv = detail.conversation;
  // While the AI is responding nobody replies from the dashboard: switch to Human Responding first (owner's password).
  if (conv.mode === 'ai') {
    return NextResponse.json({ error: 'AI is responding in this chat. Switch to Human Responding first.' }, { status: 409 });
  }
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

  // Owner writes in his language; the customer gets it in theirs (n8n Gemini).
  let outText = body?.trim() || '';
  let translation: { language: string; translated: boolean } | null = null;
  if (type === 'text' && translate && !isDemoMode()) {
    try {
      const t = await translateForCustomer(outText, conv.contact?.preferred_language);
      outText = t.text;
      translation = { language: t.language, translated: t.translated };
    } catch (err: any) {
      return NextResponse.json({ error: `${err.message || 'Translation failed'}. Try again, or turn translation off to send your text as it is.` }, { status: 502 });
    }
  }

  let waMessageId: string;
  let raw: Record<string, unknown> = {};
  if (canSendRealWhatsApp()) {
    try {
      const res = await sendMetaWhatsAppMessage({
        to: wa_id,
        type,
        text: outText || undefined,
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

  // Replying personally takes the chat over: the AI stays silent (also no handoff auto-replies)
  // until the owner presses "Resume AI" (or sends PAYMENT VERIFIED on WhatsApp).
  if (conv.mode !== 'human') {
    await repo.setMode(conv.id, 'human', viewer.id, 'Owner replied from the dashboard, AI paused until resumed', null);
  }

  const text = type === 'template' ? `[Template: ${template_name}]` : outText;
  if (translation?.translated) raw = { ...raw, original_text: body!.trim(), translated_to: translation.language };
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
  return NextResponse.json({ success: true, message, translation });
}
