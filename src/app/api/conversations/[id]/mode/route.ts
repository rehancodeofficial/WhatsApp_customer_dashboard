import { NextRequest, NextResponse } from 'next/server';
import { SetModeSchema } from '@/lib/validations';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';
import { defaultModeReason } from '@/lib/repo/logic';
import { logActivity } from '@/lib/security';
import { checkOwnerPassword } from '@/lib/owner-password';

// Pause (mode "human") or resume (mode "ai") the AI for ONE conversation.
// Pausing by hand needs the owner's password and is sticky: automatic handoffs never undo it,
// only the owner resumes it (this switch, or Verify payment).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer('ai.toggle');
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const parsed = SetModeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const repo = getRepo();
  const visible = await repo.getConversation(viewer, id);
  if (!visible) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const { mode, reason, resume_in_minutes, password } = parsed.data;
  if (mode === 'human') {
    const bad = await checkOwnerPassword(viewer.id, password);
    if (bad) return NextResponse.json({ error: bad, password_required: true }, { status: 403 });
  }
  const resumeAt = mode !== 'ai' && resume_in_minutes ? new Date(Date.now() + resume_in_minutes * 60000).toISOString() : null;
  try {
    const conversation = await repo.setMode(id, mode, viewer.id, reason || (mode === 'human' ? 'Paused by hand from the dashboard (owner confirmed)' : defaultModeReason(mode)), resumeAt);
    await logActivity(viewer, 'chat.mode_changed', { conversation_id: conversation?.id, mode: conversation?.mode });
    return NextResponse.json({ success: true, conversation });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
