import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';
import { can } from '@/lib/permissions';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const markRead = new URL(req.url).searchParams.get('markRead') !== 'false';
  const detail = await getRepo().getConversation(viewer, id, { markRead });
  if (!detail) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) || {};
  if ('payment_status' in body && !can(viewer.role, 'payments.manage')) {
    return NextResponse.json({ error: 'Only an Admin can change payment status' }, { status: 403 });
  }
  if (!can(viewer.role, 'chats.organize')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const conversation = await getRepo().patchConversation(viewer, id, body);
  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  return NextResponse.json({ success: true, conversation });
}
