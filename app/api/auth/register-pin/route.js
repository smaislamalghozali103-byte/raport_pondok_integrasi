import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { db } from '../../../../lib/firebase-admin';
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '../../../../lib/auth-session';

export async function POST(req) {
  try {
    const body = await req.json();
    const id = String(body.teacherId || '').trim();
    const p = String(body.pin || '').trim();
    const c = String(body.confirmPin || body.pinConfirm || '').trim();

    if (!id) {
      return Response.json({ success: false, message: 'Guru belum dipilih.' }, { status: 400 });
    }
    if (!/^\d{6,}$/.test(p)) {
      return Response.json({ success: false, message: 'PIN minimal 6 digit angka.' }, { status: 400 });
    }
    if (p !== c) {
      return Response.json({ success: false, message: 'Konfirmasi PIN tidak sama.' }, { status: 400 });
    }

    const r = db.collection('teachers').doc(id);
    const s = await r.get();
    if (!s.exists) {
      return Response.json({ success: false, message: 'Guru tidak ditemukan.' }, { status: 404 });
    }

    const t = s.data();
    if (String(t.status || '').trim().toUpperCase() !== 'AKTIF') {
      return Response.json({ success: false, message: 'Akun guru tidak aktif.' }, { status: 403 });
    }

    // Buat hash PIN
    const pinHash = await bcrypt.hash(p, 12);
    await r.update({
      pinHash,
      pinConfigured: true,
      pinCreatedAt: new Date(),
      updatedAt: new Date()
    });

    // Otomatis login guru setelah PIN dibuat
    const teacher = {
      teacherId: id,
      teacherCode: t.teacherCode || id,
      teacherName: t.name || '',
      schoolYear: process.env.SCHOOL_YEAR || '2026-2027'
    };

    const isHttps = req.headers.get('x-forwarded-proto') === 'https';
    (await cookies()).set(SESSION_COOKIE_NAME, createSessionToken(teacher), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    });

    return Response.json({
      success: true,
      message: 'PIN berhasil dibuat dan berhasil login.',
      teacher
    });
  } catch (e) {
    return Response.json({ success: false, message: e.message }, { status: 500 });
  }
}
