import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';

export const ADMIN_COOKIE_NAME = 'raport_admin_session';

export async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) return { ok: false, status: 401, message: 'Silakan login terlebih dahulu.' };

  // 1. Cek apakah sesi password admin sudah diverifikasi
  const adminToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (adminToken === 'authenticated') {
    return { ok: true, session };
  }

  // 2. Cek apakah teacherId ada di daftar ADMIN_TEACHER_IDS (bypass jika diset)
  const ids = String(process.env.ADMIN_TEACHER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (ids.length > 0 && ids.includes(String(session.teacherId))) {
    return { ok: true, session };
  }

  return { ok: false, status: 403, needsAdminPassword: true, message: 'Akses memerlukan password admin.' };
}
