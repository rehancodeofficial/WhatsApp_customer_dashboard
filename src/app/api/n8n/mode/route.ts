import { NextRequest, NextResponse } from 'next/server';
import { N8nModeSchema } from '@/lib/validations';
import { checkN8nSecret } from '@/lib/config';
import { getRepo } from '@/lib/repo';
import { defaultModeReason } from '@/lib/repo/logic';

// Lets n8n switch a customer's mode by phone number:
//  - AI decided action = "handoff"          -> { mode: "handoff" }
//  - Owner sent "PAYMENT VERIFIED ORD-..."  -> { mode: "ai" }
export async function POST(req: NextRequest) {
  if (!checkN8nSecret(req.headers.get('x-n8n-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = N8nModeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }
  const repo = getRepo();
  const conv = await repo.findConversationByWaId(parsed.data.wa_id);
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  // Do not override a manual takeover with an automatic handoff.
  if (parsed.data.mode === 'handoff' && conv.mode === 'human') {
    return NextResponse.json({ success: true, unchanged: true, mode: conv.mode });
  }
  const updated = await repo.setMode(conv.id, parsed.data.mode, null, parsed.data.reason || 'n8n: ' + defaultModeReason(parsed.data.mode), null);
  return NextResponse.json({ success: true, mode: updated.mode, ai_enabled: updated.ai_enabled });
}
