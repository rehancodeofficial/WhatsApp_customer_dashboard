import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isDemoMode } from '@/lib/config';
import { EMAIL_MFA_COOKIE, emailMfaOk, TRUST_COOKIE, trustOk } from '@/lib/mfa-cookie';

const DEMO_COOKIE = 'pb_demo_session';

// Sends signed-out visitors to /login. Role checks (Admin vs Management) happen in each API route.
// n8n (/api/n8n/*), cron and login endpoints use their own checks.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/api/n8n/') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  const redirectToLogin = () => {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' || pathname === '/dashboard' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  };
  const redirectToDashboard = () => {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  };

  if (isDemoMode()) {
    // Signature is verified in the route handlers; here we only check that a session exists.
    const has = !!request.cookies.get(DEMO_COOKIE)?.value;
    if (!has && pathname !== '/login') return redirectToLogin();
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const open = pathname === '/login' || pathname === '/reset-password';
  if (!user && !open) return redirectToLogin();
  if (user) {
    // Two-factor on but the code not entered yet: only the login page (code step) is reachable.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsCode =
      aal?.nextLevel === 'aal2' &&
      aal.currentLevel !== 'aal2' &&
      !(await emailMfaOk(request.cookies.get(EMAIL_MFA_COOKIE)?.value, user.id)) &&
      !(await trustOk(request.cookies.get(TRUST_COOKIE)?.value, user.id)); // password check is done by getViewer
    if (needsCode) {
      if (open) return response;
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Enter your two-factor code' }, { status: 401 });
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '?mfa=1';
      return NextResponse.redirect(url);
    }
    if (pathname === '/login') return redirectToDashboard();
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
