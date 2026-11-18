import { NextRequest, NextResponse } from 'next/server';
import { getRepo } from '@/lib/repo';

// Flips timed pauses ("pause for 30 min / 2 h") back to AI when they run out.
// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>" (see vercel.json).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const resumed = await getRepo().autoResumeExpired();
  return NextResponse.json({ success: true, resumed });
}
