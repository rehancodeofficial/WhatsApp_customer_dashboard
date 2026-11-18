import { NextRequest, NextResponse } from 'next/server';
import { DeliveryStatusSchema } from '@/lib/validations';
import { checkN8nSecret } from '@/lib/config';
import { formatMetaError } from '@/lib/whatsapp';
import { getRepo } from '@/lib/repo';

// Delivery receipts. Accepts either { wa_message_id, status, error_code, error_message }
// or the raw WhatsApp Trigger item ({ statuses: [...] }) so the n8n node can just forward $json.
export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const items: unknown[] = Array.isArray(body?.statuses)
    ? body.statuses.map((s: any) => ({
        wa_message_id: s.id,
        status: s.status,
        error_code: s.errors?.[0]?.code,
        error_message: s.errors?.[0]?.error_data?.details || s.errors?.[0]?.title || s.errors?.[0]?.message,
      }))
    : [body];

  const repo = getRepo();
  const results = [];
  for (const item of items) {
    const parsed = DeliveryStatusSchema.safeParse(item);
    if (!parsed.success) {
      results.push({ ok: false, error: 'invalid status item' });
      continue;
    }
    const d = parsed.data;
    const updated = await repo.updateStatus({
      wa_message_id: d.wa_message_id,
      status: d.status,
      error_code: d.error_code ?? null,
      error_message: d.error_code ? formatMetaError(d.error_code, d.error_message) : d.error_message ?? null,
    });
    results.push({ ok: true, found: !!updated, wa_message_id: d.wa_message_id });
  }
  return NextResponse.json({ success: true, results });
}
