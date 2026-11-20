import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getBizStore } from '@/lib/biz/store';
import { sendBroadcast } from '@/lib/biz/service';
import { bizError } from '@/lib/biz/http';
import { BroadcastBody, zodMessage } from '@/lib/biz/schemas';
import { rateLimit } from '@/lib/rate-limit';
import { logActivity } from '@/lib/security';

export const maxDuration = 300; // sending to many customers takes a while

export async function GET() {
  const v = await requireViewer('broadcast.send');
  if (v instanceof NextResponse) return v;
  try {
    const [broadcasts, products] = await Promise.all([getBizStore().listBroadcasts(), getBizStore().listProducts()]);
    return NextResponse.json({
      broadcasts,
      products: products
        .filter((p) => p.active && p.stock_qty > 0)
        .map((p) => ({ id: p.id, brand: p.brand, model: p.model, variant: p.variant, condition: p.condition, sale_price: p.sale_price, currency: p.currency, stock_qty: p.stock_qty })),
      aiConfigured: !!process.env.CLAUDE_API_KEY,
      // "phonebuzz_offer" carries the dashboard text ({{1}} first name, {{2}} offer). Until Meta approves it,
      // sending falls back to the approved "phonebuzz_intro" (no variables).
      defaultTemplate: process.env.WHATSAPP_BROADCAST_TEMPLATE || 'phonebuzz_offer',
      defaultTemplateLanguage: process.env.WHATSAPP_BROADCAST_TEMPLATE_LANG || 'en',
    });
  } catch (e) {
    return bizError(e);
  }
}

export async function POST(req: NextRequest) {
  const v = await requireViewer('broadcast.send');
  if (v instanceof NextResponse) return v;
  if (!rateLimit(`broadcast:${v.id}`, 5, 10 * 60_000)) return NextResponse.json({ error: 'Too many broadcasts. Wait a few minutes.' }, { status: 429 });
  const p = BroadcastBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
  try {
    const broadcast = await sendBroadcast({ ...(p.data as any), created_by: v.id });
    await logActivity(v, 'broadcast.sent', { title: broadcast.title, recipients: broadcast.total_recipients, sent: broadcast.sent_count, failed: broadcast.failed_count });
    return NextResponse.json({ broadcast });
  } catch (e) {
    return bizError(e);
  }
}
