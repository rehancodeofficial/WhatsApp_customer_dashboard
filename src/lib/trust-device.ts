import type { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { makeTrustCookie, passwordEpoch, TRUST_COOKIE, TRUST_DAYS } from '@/lib/mfa-cookie';

/** "Don't ask again on this device for 3 days": put the signed cookie on the response. */
export async function rememberDevice(res: NextResponse, userId: string) {
  const { data } = await getAdminSupabase().from('profiles').select('password_changed_at').eq('id', userId).maybeSingle();
  res.cookies.set(TRUST_COOKIE, await makeTrustCookie(userId, passwordEpoch(data?.password_changed_at)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TRUST_DAYS * 86_400,
  });
}
