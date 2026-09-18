import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';

export const ADMIN_COOKIE_NAME = 'raport_admin_session';

export async function requireAdmin() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  // 1. Cek apakah sesi password admin sudah diverifikasi
  if (adminToken === 'authenticated') {
    return { ok: true, session: session || { teacherId: 'ADMIN', teacherName: 'Administrator' } };
  }

  if (!session) return { ok: false, status: 401, message: 'Silakan login terlebih dahulu.' };

  // 2. Cek apakah teacherId ada di daftar ADMIN_TEACHER_IDS (bypass jika diset)
  const ids = String(process.env.ADMIN_TEACHER_IDS || 'GURU_01').split(',').map(x => x.trim()).filter(Boolean);
  if (ids.length > 0 && ids.includes(String(session.teacherId))) {
    return { ok: true, session };
  }

  return { ok: false, status: 403, needsAdminPassword: true, message: 'Akses memerlukan password admin.' };
}
