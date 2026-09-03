import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from './auth-session';

export async function requireAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) return { ok: false, status: 401, message: 'Belum login.' };
  const ids = String(process.env.ADMIN_TEACHER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!ids.includes(String(session.teacherId))) return { ok: false, status: 403, message: 'Akses admin ditolak.' };
  return { ok: true, session };
}
