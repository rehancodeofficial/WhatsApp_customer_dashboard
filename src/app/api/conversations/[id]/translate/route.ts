import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';
import { isDemoMode, n8nBridgeEnabled } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { callN8nBridge } from '@/lib/n8n-bridge';

export const maxDuration = 60;

// "Translate to English" in a chat: English text of the given messages, for the dashboard viewer only.
// Nothing is sent to the customer. Each translation is saved on the message (raw.en / raw.en_t),
// so a message is translated once.
const Body = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(40) });

async function toEnglish(text: string): Promise<string> {
  const res = await callN8nBridge('translate', { text, language: 'English' }, 30000);
  const out = String(res?.text || '').trim();
  if (!out || res?.error) throw new Error('Translation failed');
  return out;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer('chats.view');
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Send { ids: [...] }' }, { status: 400 });
  const detail = await getRepo().getConversation(viewer, id, { markRead: false });
  if (!detail) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  if (isDemoMode() || !n8nBridgeEnabled()) return NextResponse.json({ error: 'Translation needs the n8n connection' }, { status: 503 });

  const wanted = new Set(p.data.ids);
  const msgs = detail.messages.filter((m) => wanted.has(m.id));
  const out: Record<string, { body?: string; transcript?: string }> = {};
  const db = getAdminSupabase();
  let failed = 0;

  const jobs = msgs.map((m) => async () => {
    const raw = { ...((m.raw as Record<string, unknown>) || {}) };
    const r: { body?: string; transcript?: string } = {};
    let changed = false;
    try {
      if (m.body?.trim()) {
        if (typeof raw.en !== 'string') {
          raw.en = await toEnglish(m.body);
          changed = true;
        }
        r.body = raw.en as string;
      }
      if (m.transcript_or_caption?.trim()) {
        if (typeof raw.en_t !== 'string') {
          raw.en_t = await toEnglish(m.transcript_or_caption);
          changed = true;
        }
        r.transcript = raw.en_t as string;
      }
      if (changed) await db.from('messages').update({ raw }).eq('id', m.id);
    } catch {
      failed++;
    }
    out[m.id] = r;
  });
  // A few at a time, so a long chat stays inside the time limit.
  for (let i = 0; i < jobs.length; i += 5) await Promise.all(jobs.slice(i, i + 5).map((j) => j()));
  return NextResponse.json({ translations: out, failed });
}
