import { NextRequest, NextResponse } from 'next/server';
import { OutboundLogSchema } from '@/lib/validations';
import { checkN8nSecret } from '@/lib/config';
import { getRepo } from '@/lib/repo';

// Called by n8n after the AI (or any automation) sends a WhatsApp message to a customer.
export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = OutboundLogSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const message = await getRepo().logOutbound(parsed.data);
    return NextResponse.json({ success: true, message });
  } catch (err: any) {
    const status = String(err.message).includes('not found') ? 404 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
