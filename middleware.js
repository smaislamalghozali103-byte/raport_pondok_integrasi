import { NextResponse } from 'next/server';

const ADMIN_COOKIE_NAME = 'raport_admin_session';
const TEACHER_COOKIE_NAME = 'raport_session';

export function middleware(request) {
  const path = request.nextUrl.pathname;

  // Area administrator hanya mengenali cookie admin.
  if (path.startsWith('/admin')) {
    const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;

    if (!adminToken) {
      // Biarkan /admin menampilkan form PIN administrator.
      // API akan melakukan verifikasi otoritatif dengan signature.
      return NextResponse.next();
    }
  }

  // Area guru hanya menggunakan sesi guru.
  if (path.startsWith('/dashboard')) {
    const teacherToken = request.cookies.get(TEACHER_COOKIE_NAME)?.value;

    if (!teacherToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*']
};
