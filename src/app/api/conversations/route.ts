import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';

export async function GET(req: NextRequest) {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  const sp = new URL(req.url).searchParams;
  try {
    const conversations = await getRepo().listConversations(viewer, {
      channel: sp.get('channel'),
      mode: sp.get('mode'),
      filter: sp.get('filter'),
      q: sp.get('q'),
    });
    return NextResponse.json({ conversations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
