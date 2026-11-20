import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';
import { isDemoMode } from '@/lib/config';
import { logActivity } from '@/lib/security';

// "Resume and let AI reply now": turns the AI back on and asks n8n to answer the
// customer's latest message right away (n8n webhook "Run AI Now").
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer('ai.toggle');
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const repo = getRepo();
  const detail = await repo.getConversation(viewer, id);
  if (!detail) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  if (detail.conversation.mode !== 'ai') {
    await repo.setMode(id, 'ai', viewer.id, 'AI resumed from the dashboard and asked to reply now', null);
  }
  const lastCustomer = [...detail.messages].reverse().find((m) => m.sender_type === 'customer');
  const wa_id = detail.conversation.contact?.wa_id;
  if (!lastCustomer || !wa_id) return NextResponse.json({ success: true, triggered: false, reason: 'No customer message to answer' });

  if (isDemoMode()) {
    const { demoAiReply } = await import('@/lib/demo-ai');
    await demoAiReply(wa_id, lastCustomer.body || '', false);
    return NextResponse.json({ success: true, triggered: true, demo: true });
  }

  const url = process.env.N8N_TRIGGER_AI_WEBHOOK_URL;
  if (!url) return NextResponse.json({ error: 'N8N_TRIGGER_AI_WEBHOOK_URL is not set' }, { status: 500 });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-n8n-secret': process.env.N8N_WEBHOOK_SECRET || '' },
    body: JSON.stringify({
      wa_id,
      customer_name: detail.conversation.contact?.name || '',
      message: lastCustomer.transcript_or_caption || lastCustomer.body || '',
      wa_message_id: lastCustomer.wa_message_id,
    }),
  }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }) as Response);
  if (!res.ok) return NextResponse.json({ error: `n8n webhook failed (${res.status})` }, { status: 502 });
  await logActivity(viewer, 'chat.ai_reply_requested', { wa_id });
  return NextResponse.json({ success: true, triggered: true });
}
