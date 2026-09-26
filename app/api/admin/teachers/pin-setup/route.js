import crypto from 'crypto';
import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return Response.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const teacherId = String(body.teacherId || '').trim();

    if (!teacherId) {
      return Response.json({ success: false, message: 'teacherId wajib.' }, { status: 400 });
    }

    const ref = db.collection('teachers').doc(teacherId);
    const snap = await ref.get();

    if (!snap.exists) {
      return Response.json({ success: false, message: 'Guru tidak ditemukan.' }, { status: 404 });
    }

    const teacher = snap.data() || {};
    const role = String(teacher.role || '').trim().toLowerCase();

    if (teacher.isAdmin === true || ['admin', 'administrator'].includes(role)) {
      return Response.json({
        success: false,
        message: 'Akun administrator tidak menggunakan PIN login Guru.'
      }, { status: 403 });
    }

    if (String(teacher.status || 'AKTIF').toUpperCase() !== 'AKTIF') {
      return Response.json({ success: false, message: 'Akun guru tidak aktif.' }, { status: 403 });
    }

    if (teacher.pinHash || teacher.pinConfigured) {
      return Response.json({
        success: false,
        message: 'Guru ini sudah memiliki PIN. Reset PIN dilakukan melalui prosedur administrator.'
      }, { status: 409 });
    }

    const token = crypto.randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await ref.set({
      pinSetupTokenHash: hashToken(token),
      pinSetupTokenExpiresAt: expiresAt,
      pinSetupTokenCreatedAt: new Date(),
      pinSetupTokenCreatedBy: auth.session.teacherId,
      updatedAt: new Date()
    }, { merge: true });

    return Response.json({
      success: true,
      teacherId,
      teacherName: teacher.name || teacher.fullName || teacherId,
      setupToken: token,
      expiresAt: expiresAt.toISOString(),
      message: 'Kode aktivasi PIN dibuat. Berikan kode ini kepada guru dan jangan simpan di tempat publik.'
    });
  } catch (error) {
    console.error('PIN SETUP TOKEN ERROR', error);
    return Response.json({
      success: false,
      message: error?.message || 'Gagal membuat kode aktivasi PIN.'
    }, { status: 500 });
  }
}
