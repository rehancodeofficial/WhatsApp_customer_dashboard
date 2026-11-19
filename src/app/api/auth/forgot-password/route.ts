import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { requestPasswordReset } from '@/lib/password-reset';

const Body = z.object({
  email: z.string().email(),
  reason: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`forgot-pw:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 10 minutes.' }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  try {
    const result = await requestPasswordReset(parsed.data.email, parsed.data.reason);
    return NextResponse.json(result);
  } catch (err: any) {
    const status = typeof err.status === 'number' ? err.status : 400;
    return NextResponse.json({ error: err.message || 'Unable to process request.' }, { status });
  }
}
