import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth-session';

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

    const ref = db.collection('teachers').doc(id);
    const snap = await ref.get();

    if (!snap.exists) {
      return Response.json({ success: false, message: 'Guru tidak ditemukan.' }, { status: 404 });
    }

    const teacher = snap.data();

    const configuredAdminIds = String(process.env.ADMIN_TEACHER_IDS || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);

    const rawRole = String(teacher.role || '').trim().toLowerCase();
    const isAdminAccount =
      configuredAdminIds.includes(id) ||
      rawRole === 'admin' ||
      rawRole === 'administrator' ||
      teacher.isAdmin === true;

    if (isAdminAccount) {
      return Response.json({
        success: false,
        message: 'Akun administrator tidak dapat membuat PIN melalui login Guru. Gunakan /admin.'
      }, { status: 403 });
    }

    if (String(teacher.status || '').trim().toUpperCase() !== 'AKTIF') {
      return Response.json({ success: false, message: 'Akun guru tidak aktif.' }, { status: 403 });
    }

    // PIN hanya boleh dibuat satu kali melalui endpoint bootstrap.
    // Setelah PIN ada, perubahan/reset harus dilakukan oleh administrator.
    if (teacher.pinConfigured || teacher.pinHash) {
      return Response.json({
        success: false,
        message: 'PIN guru sudah dibuat. Untuk reset/perubahan PIN, hubungi administrator.'
      }, { status: 409 });
    }

    const pinHash = await bcrypt.hash(p, 12);

    await ref.update({
      pinHash,
      pinConfigured: true,
      pinCreatedAt: new Date(),
      updatedAt: new Date()
    });

    const role = ['wali_kelas', 'wali kelas', 'wali'].includes(rawRole) ? 'wali_kelas' : 'guru';

    const teacherSession = {
      teacherId: id,
      teacherCode: teacher.teacherCode || id,
      teacherName: teacher.name || '',
      role,
      roleLabel: role === 'wali_kelas' ? 'Wali Kelas' : 'Guru',
      schoolYear: process.env.SCHOOL_YEAR || '2026-2027'
    };

    const isHttps =
      req.headers.get('x-forwarded-proto') === 'https' ||
      process.env.NODE_ENV === 'production';

    (await cookies()).set(SESSION_COOKIE_NAME, createSessionToken(teacherSession), {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE
    });

    return Response.json({
      success: true,
      message: 'PIN berhasil dibuat dan berhasil login.',
      teacher: teacherSession
    });
  } catch (err) {
    console.error('[REGISTER PIN ERROR]', err);
    return Response.json({
      success: false,
      message: err?.message || 'Gagal membuat PIN.'
    }, { status: 500 });
  }
}
