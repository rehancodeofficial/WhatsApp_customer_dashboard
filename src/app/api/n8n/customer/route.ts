import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkN8nSecret } from '@/lib/config';
import { getBizStore } from '@/lib/biz/store';
import { bizError } from '@/lib/biz/http';
import { zodMessage } from '@/lib/biz/schemas';

// n8n "Save Customer Lead" (replaces the Customer_Leads sheet row).
// Brands are MERGED into the customer's interests, never overwritten.
const Body = z.object({
  wa_id: z.string().transform((v) => v.replace(/[^0-9]/g, '')).pipe(z.string().min(7)),
  name: z.string().max(100).nullable().optional(),
  email: z.string().max(150).nullable().optional(),
  company: z.string().max(150).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  preferred_language: z.string().max(40).nullable().optional(),
  lead_status: z.string().max(60).nullable().optional(),
  brands: z.array(z.string().max(40)).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: zodMessage(p.error) }, { status: 400 });
  const { brands = [], wa_id, ...rest } = p.data;
  const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const store = getBizStore();
  try {
    const existing = (await store.listCustomers()).find((c) => c.wa_id === wa_id);
    const merged = Array.from(new Set([...(existing?.preferred_brands || []), ...brands.map((b) => b.trim()).filter(Boolean)]));
    const customer = existing
      ? await store.updateCustomer(existing.id, { ...fields, preferred_brands: merged })
      : await store.createCustomer({ wa_id, ...fields, preferred_brands: merged });
    return NextResponse.json({ success: true, customer_id: customer.id });
  } catch (e) {
    return bizError(e);
  }
}
