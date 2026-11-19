import { NextResponse } from 'next/server';
import { requireViewer } from '@/lib/auth';
import { getBizStore } from '@/lib/biz/store';
import { loadCustomerViews } from '@/lib/biz/service';
import { suggestProducts } from '@/lib/biz/logic';
import { suggestWithAI } from '@/lib/biz/ai-suggest';
import { bizError } from '@/lib/biz/http';
import { rateLimit } from '@/lib/rate-limit';

export async function GET() {
  const v = await requireViewer('broadcast.send');
  if (v instanceof NextResponse) return v;
  try {
    const store = getBizStore();
    const [products, movements, customers] = await Promise.all([store.listProducts(), store.listMovements(), loadCustomerViews()]);
    const candidates = suggestProducts(products, movements, customers);
    // The AI call costs money: at most 20 per user per hour, rule-based picks otherwise.
    const allowAI = rateLimit(`suggest:${v.id}`, 20, 60 * 60_000);
    const result = allowAI ? await suggestWithAI(candidates) : { suggestions: candidates, source: 'rules' as const };
    return NextResponse.json(result);
  } catch (e) {
    return bizError(e);
  }
}
