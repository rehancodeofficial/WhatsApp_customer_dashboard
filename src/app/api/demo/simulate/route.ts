import { NextRequest, NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/config';
import { getRepo } from '@/lib/repo';
import { demoAiReply } from '@/lib/demo-ai';
import { requireViewer } from '@/lib/auth';

// DEMO MODE ONLY: pretend a customer sent a WhatsApp message, exactly as n8n would report it.
// If the AI is on for that customer, the demo AI answers; if paused, nothing answers.
export async function POST(req: NextRequest) {
  if (!isDemoMode()) return NextResponse.json({ error: 'Only available in demo mode' }, { status: 404 });
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { wa_id, body } = await req.json().catch(() => ({}));
  if (!wa_id || !body) return NextResponse.json({ error: 'wa_id and body required' }, { status: 400 });
  const result = await getRepo().ingestInbound({ wa_id: String(wa_id), wa_message_id: `wamid.demo_in_${Date.now()}`, type: 'text', body: String(body) });
  let aiReplied = false;
  if (result.ai_enabled) {
    await new Promise((r) => setTimeout(r, 800));
    await demoAiReply(result.wa_id, String(body));
    aiReplied = true;
  }
  return NextResponse.json({ ...result, aiReplied });
}
