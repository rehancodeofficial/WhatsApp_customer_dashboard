import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireViewer } from '@/lib/auth';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';
import { getRepo } from '@/lib/repo';
import { canReadParty } from '@/lib/chat-access';
import type { OwnerNotification } from '@/lib/biz/types';

// GET: newest notifications (+ the dashboard chat each one links to). POST: mark read.
export async function GET(req: NextRequest) {
  const v = await requireViewer('notifications.view');
  if (v instanceof NextResponse) return v;
  const limit = Math.min(500, Number(req.nextUrl.searchParams.get('limit')) || 100);
  try {
    const list = (await getBizStore().listRows<OwnerNotification>('notifications')).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const unread = list.filter((n) => !n.read_at).length;
    const slice = list.slice(0, limit);
    const repo = getRepo();
    const convByWa = new Map<string, string | null>();
    for (const n of slice) {
      if (!n.wa_id || convByWa.has(n.wa_id)) continue;
      const c = await repo.findConversationByWaId(n.wa_id).catch(() => null);
      const party = c?.contact?.kind === 'supplier' ? 'supplier' : 'customer';
      convByWa.set(n.wa_id, c && canReadParty(v, party) ? c.id : null);
    }
    return NextResponse.json({
      unread,
      notifications: slice.map((n) => ({ ...n, conversation_id: n.wa_id ? convByWa.get(n.wa_id) ?? null : null })),
    });
  } catch (e) {
    return bizError(e);
  }
}

const Body = z.object({ ids: z.union([z.array(z.string().uuid()).max(500), z.literal('all')]) });
export async function POST(req: NextRequest) {
  const v = await requireViewer('notifications.view');
  if (v instanceof NextResponse) return v;
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Send { ids: [...] } or { ids: "all" }' }, { status: 400 });
  try {
    await getBizStore().updateRows('notifications', p.data.ids, { read_at: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (e) {
    return bizError(e);
  }
}
