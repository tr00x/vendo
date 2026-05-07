import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/refer', '/account', '/help', '/clinic'];
const COOKIE_NAME = 'vendo.sid';

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(COOKIE_NAME);

  // Cheap edge-time gate: if the cookie is missing entirely, bounce protected
  // pages straight to /login. We can't validate the session here (iron-session
  // can't run in Edge), so any further check happens in the page's own
  // requireSession() call.
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Note: we DON'T redirect /login → /r when a cookie is present. A stale or
  // expired cookie would create a redirect loop (login → /r → requireSession
  // fails → /login → middleware sees cookie → /r). The login page itself does
  // a server-side validity check and only then redirects an already-signed-in
  // user away.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api/health|favicon.ico|public).*)'],
};
