import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  return Response.json({
    success: true,
    authenticated: token === 'authenticated'
  });
}

export async function POST(req) {
  try {
    const { password } = await req.json();
    const cleanPass = String(password || '').trim();

    const expectedPass = String(process.env.ADMIN_PASSWORD || 'admin_alghozali').trim();

    if (!cleanPass) {
      return Response.json({ success: false, message: 'Silakan masukkan password admin.' }, { status: 400 });
    }

    if (cleanPass !== expectedPass) {
      return Response.json({ success: false, message: 'Password admin salah.' }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE_NAME, 'authenticated', {
      httpOnly: true,
      secure: false, // compatible with localhost
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 4 // 4 jam sesi admin
    });

    return Response.json({ success: true, message: 'Verifikasi admin berhasil.' });
  } catch (e) {
    return Response.json({ success: false, message: e.message }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  return Response.json({ success: true, message: 'Sesi admin berakhir.' });
}
