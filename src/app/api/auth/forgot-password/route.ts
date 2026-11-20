import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { requestPasswordReset } from '@/lib/password-reset';
import { resolveLogin } from '@/lib/security';
import { getAdminSupabase } from '@/lib/supabase/admin';

// { username, recovery_email? (Admin), reason? (staff) } — or the older { email, reason }.
const Body = z.object({
  username: z.string().trim().max(150).optional(),
  email: z.string().trim().max(150).optional(),
  recovery_email: z.string().trim().max(200).optional(),
  reason: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rateLimit(`forgot-pw:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many requests. Please wait 10 minutes.' }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !(parsed.data.username || parsed.data.email)) {
    return NextResponse.json({ error: 'Enter your username.' }, { status: 400 });
  }

  try {
    let target = parsed.data.email || '';
    if (parsed.data.username) {
      const acct = await resolveLogin(parsed.data.username);
      if (!acct) return NextResponse.json({ error: 'No account with this username.' }, { status: 404 });
      const { data: p } = await getAdminSupabase().from('profiles').select('role, recovery_email').eq('id', acct.userId).maybeSingle();
      if (p?.role === 'owner') {
        // The Admin confirms the recovery email; the link goes there.
        const typed = (parsed.data.recovery_email || '').toLowerCase();
        if (!p.recovery_email || typed !== String(p.recovery_email).toLowerCase()) {
          return NextResponse.json({ error: 'This is not the recovery email saved for this account.' }, { status: 400 });
        }
        target = p.recovery_email;
      } else {
        target = acct.email;
      }
    }
    const result = await requestPasswordReset(target, parsed.data.reason, req.nextUrl.origin);
    return NextResponse.json(result);
  } catch (err: any) {
    const status = typeof err.status === 'number' ? err.status : 400;
    return NextResponse.json({ error: err.message || 'Unable to process request.' }, { status });
  }
}
