import { NextRequest, NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { loadCustomerViews } from '@/lib/biz/service';
import { filterAudience } from '@/lib/biz/logic';
import { bizError } from '@/lib/biz/http';
import { AudienceBody, zodMessage } from '@/lib/biz/schemas';
import { get24HourWindowStatus } from '@/lib/whatsapp';

// Preview who a broadcast would reach, plus the filter options (countries, brands) that exist.
export async function POST(req: NextRequest) {
  const v = await requireViewer('broadcast.send');
  if (v instanceof NextResponse) return v;
  const p = AudienceBody.safeParse((await req.json().catch(() => null)) ?? {});
  if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
  try {
    const all = await loadCustomerViews();
    const matches = filterAudience(all, p.data);
    const uniq = (xs: (string | null)[]) => Array.from(new Set(xs.filter(Boolean) as string[])).sort();
    return NextResponse.json({
      options: { countries: uniq(all.map((c) => c.country)), brands: uniq(all.flatMap((c) => c.brands)) },
      total: all.length,
      customers: matches.map((c) => ({
        id: c.id,
        name: c.name,
        wa_id: c.wa_id,
        country: c.country,
        tier: c.tier,
        brands: c.brands,
        total_spent: c.total_spent,
        windowOpen: get24HourWindowStatus(c.last_customer_message_at).isOpen,
      })),
    });
  } catch (e) {
    return bizError(e);
  }
}
