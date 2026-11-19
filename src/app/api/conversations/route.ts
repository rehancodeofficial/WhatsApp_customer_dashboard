import { NextRequest, NextResponse } from 'next/server';
import { getRepo } from '@/lib/repo';
import { getViewer } from '@/lib/auth';
import { canReadParty } from '@/lib/chat-access';

export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const asked = (['customer', 'supplier'] as const).find((p) => p === sp.get('party')) ?? null;
  const okCustomer = canReadParty(viewer, 'customer');
  const okSupplier = canReadParty(viewer, 'supplier');
  if ((asked === 'customer' && !okCustomer) || (asked === 'supplier' && !okSupplier) || (!okCustomer && !okSupplier)) {
    return NextResponse.json({ error: 'You do not have permission to see these chats' }, { status: 403 });
  }
  // No party asked: return only the chats this user may read.
  const party = asked ?? (okCustomer && okSupplier ? null : okCustomer ? 'customer' : 'supplier');
  try {
    const conversations = await getRepo().listConversations(viewer, {
      channel: sp.get('channel'),
      mode: sp.get('mode'),
      filter: sp.get('filter'),
      q: sp.get('q'),
      party,
    });
    return NextResponse.json({ conversations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
