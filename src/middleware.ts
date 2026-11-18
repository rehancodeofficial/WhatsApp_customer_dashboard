import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isDemoMode } from '@/lib/config';

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

  if (!user && pathname !== '/login') return redirectToLogin();
  if (user && pathname === '/login') return redirectToDashboard();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
