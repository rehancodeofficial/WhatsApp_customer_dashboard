import { NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getRepo } from '@/lib/repo';

export async function GET() {
  const viewer = await requireViewer();
  if (viewer instanceof NextResponse) return viewer;
  return NextResponse.json({ stats: await getRepo().stats(viewer) });
}
