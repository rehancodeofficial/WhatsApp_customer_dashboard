import { NextRequest, NextResponse } from 'next/server';
import { SetModeSchema } from '@/lib/validations';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';
import { defaultModeReason } from '@/lib/repo/logic';

// Pause (mode "human") or resume (mode "ai") the AI for ONE conversation.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const parsed = SetModeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const repo = getRepo();
  const visible = await repo.getConversation(viewer, id);
  if (!visible) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const { mode, reason, resume_in_minutes } = parsed.data;
  const resumeAt = mode !== 'ai' && resume_in_minutes ? new Date(Date.now() + resume_in_minutes * 60000).toISOString() : null;
  try {
    const conversation = await repo.setMode(id, mode, viewer.id, reason || defaultModeReason(mode), resumeAt);
    return NextResponse.json({ success: true, conversation });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
