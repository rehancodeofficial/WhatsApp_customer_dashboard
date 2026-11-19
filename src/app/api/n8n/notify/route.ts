import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkN8nSecret } from '@/lib/config';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';
import { zodMessage } from '@/lib/biz/schemas';
import { classifyNotification, titleFromText } from '@/lib/biz/notifications';

// n8n: send here the same text it sends to the owner on WhatsApp. It appears in the dashboard bell.
const blank = (v: unknown) => (v === '' || v == null ? undefined : v);
const Body = z.object({
  text: z.string().min(1).max(8000),
  title: z.preprocess(blank, z.string().max(200).optional()),
  type: z.preprocess(blank, z.string().max(30).optional()),
  wa_id: z.preprocess((v) => (blank(v) === undefined ? undefined : String(v).replace(/[^0-9]/g, '') || undefined), z.string().max(20).optional()),
  party: z.preprocess((v) => (blank(v) === undefined ? undefined : String(v).toLowerCase()), z.enum(['customer', 'supplier']).optional()),
  order_no: z.preprocess(blank, z.string().max(60).optional()),
  request_id: z.preprocess(blank, z.string().max(60).optional()),
});

export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
  const d = p.data;
  // Pick up IDs written in the text when n8n didn't send them separately.
  const order_no = d.order_no || d.text.match(/\bORD-[A-Z0-9-]+/i)?.[0];
  const request_code = d.request_id || d.text.match(/\bSR-\d{6,}/)?.[0];
  const type = d.type || classifyNotification(d.text);
  try {
    const n = await getBizStore().upsertRow<any>('notifications', null, {
      type,
      title: d.title || titleFromText(d.text),
      body: d.text.replace(/```/g, ''),
      wa_id: d.wa_id ?? null,
      party: d.party ?? (d.wa_id ? (type === 'supplier' ? 'supplier' : 'customer') : null),
      order_no: order_no ?? null,
      request_code: request_code ?? null,
      read_at: null,
    });
    return NextResponse.json({ success: true, id: n.id });
  } catch (e) {
    return bizError(e);
  }
}
