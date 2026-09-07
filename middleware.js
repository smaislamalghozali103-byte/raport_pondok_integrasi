import { NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'raport_session';

export function middleware(request) {
  const path = request.nextUrl.pathname;
  const protectedPath = path.startsWith('/dashboard') || path.startsWith('/admin');

  if (protectedPath) {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Periksa apakah token memiliki format valid (encoded.signature) dan belum kedaluwarsa
    const parts = token.split('.');
    if (parts.length !== 2) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      let jsonStr = '';
      if (typeof Buffer !== 'undefined') {
        jsonStr = Buffer.from(parts[0], 'base64url').toString('utf8');
      } else {
        let b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        jsonStr = atob(b64);
      }
      const data = JSON.parse(jsonStr);
      if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
    } catch {
      // Jika parsing gagal, arahkan ke login
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

export const config = { matcher: ['/dashboard/:path*', '/admin/:path*'] };
