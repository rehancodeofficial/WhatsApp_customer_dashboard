import { NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getBizStore } from '@/lib/biz/store';

const CONFIRMED = ['confirmed', 'paid', 'shipped', 'delivered'];

// Contacts with at least one confirmed order ("Promising" filter). Everyone else is "Exploring".
export async function GET() {
  const viewer = await requireViewer('chats.view');
  if (viewer instanceof NextResponse) return viewer;
  const orders = await getBizStore().listOrders().catch(() => []);
  const ids = [...new Set(orders.filter((o) => o.contact_id && (CONFIRMED.includes(o.status) || o.payment_status === 'paid')).map((o) => o.contact_id as string))];
  return NextResponse.json({ contact_ids: ids });
}
