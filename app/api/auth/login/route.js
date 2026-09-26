import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/security';
import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth-session';

export async function POST(req) {
  try {
    const rl = checkRateLimit(`login:${clientIp(req)}`);
    if (!rl.allowed) {
      return Response.json({
        success: false,
        message: 'Terlalu banyak percobaan. Coba lagi beberapa menit.'
      }, { status: 429 });
    }

    const { teacherId, pin } = await req.json();
    const id = String(teacherId || '').trim();
    const p = String(pin || '').trim();

    if (!id) {
      return Response.json({ success: false, message: 'Silakan pilih nama guru.' }, { status: 400 });
    }
    if (!/^\d{6,}$/.test(p)) {
      return Response.json({ success: false, message: 'PIN minimal 6 digit angka.' }, { status: 400 });
    }

    const s = await db.collection('teachers').doc(id).get();
    if (!s.exists) {
      return Response.json({ success: false, message: 'Nama guru tidak ditemukan.' }, { status: 404 });
    }

    const t = s.data();
    if (String(t.status || '').trim().toUpperCase() !== 'AKTIF') {
      return Response.json({ success: false, message: 'Akun guru tidak aktif.' }, { status: 403 });
    }
    if (!t.pinConfigured || !t.pinHash) {
      return Response.json({
        success: false,
        needsPinSetup: true,
        message: 'Guru ini belum memiliki PIN. Silakan buat PIN terlebih dahulu.'
      }, { status: 409 });
    }

    const validPin = await bcrypt.compare(p, t.pinHash);
    if (!validPin) {
      return Response.json({ success: false, message: 'PIN salah.' }, { status: 401 });
    }

    const rawRole = String(t.role || 'guru').trim().toLowerCase();
    const role = ['wali_kelas', 'wali kelas', 'wali'].includes(rawRole) ? 'wali_kelas' : 'guru';

    const teacher = {
      teacherId: id,
      teacherCode: t.teacherCode || id,
      teacherName: t.name || '',
      role,
      roleLabel: role === 'wali_kelas' ? 'Wali Kelas' : 'Guru',
      schoolYear: process.env.SCHOOL_YEAR || '2026-2027'
    };

    const isHttps = req.headers.get('x-forwarded-proto') === 'https' || process.env.NODE_ENV === 'production';
    (await cookies()).set(SESSION_COOKIE_NAME, createSessionToken(teacher), {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    });

    return Response.json({ success: true, teacher });
  } catch (e) {
    console.error('[LOGIN ERROR]', e);
    return Response.json({ success: false, message: e.message }, { status: 500 });
  }
}
