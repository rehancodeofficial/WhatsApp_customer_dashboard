import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { isDemoMode } from '@/lib/config';
import { getAdminSupabase } from '@/lib/supabase/admin';

// Admin: activity log of every user. ?user=<id>&action=<prefix>&limit=300
export async function GET(req: NextRequest) {
  const v = await requireViewer('staff.manage');
  if (v instanceof NextResponse) return v;
  if (isDemoMode()) return NextResponse.json({ logs: [] });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(1000, Math.max(1, Number(sp.get('limit')) || 300));
  let q = getAdminSupabase().from('activity_logs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (sp.get('user')) q = q.eq('user_id', sp.get('user')!);
  if (sp.get('action')) q = q.like('action', `${sp.get('action')}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data });
}
