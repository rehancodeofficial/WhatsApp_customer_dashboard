import { NextRequest, NextResponse } from 'next/server';
import { InboundMessageSchema } from '@/lib/validations';
import { checkN8nSecret } from '@/lib/config';
import { getRepo } from '@/lib/repo';

// Called by n8n for every customer WhatsApp message.
// Returns { ai_enabled, mode } so the n8n IF node decides whether the AI may reply.
export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) {
    return NextResponse.json({ error: 'Unauthorized: invalid x-n8n-secret' }, { status: 401 });
  }
  const parsed = InboundMessageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // ai_enabled is omitted on purpose: n8n treats "missing" as "let the AI reply" (fail-open).
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const result = await getRepo().ingestInbound(parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('inbound failed', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
