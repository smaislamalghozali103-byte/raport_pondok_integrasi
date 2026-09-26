import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { getTeacherRole } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session) {
    return Response.json({ success: false, authenticated: false });
  }

  const role = await getTeacherRole(session.teacherId);

  return Response.json({
    success: true,
    authenticated: true,
    teacher: {
      ...session,
      role,
      roleLabel: role === 'wali_kelas' ? 'Wali Kelas' : 'Guru'
    }
  }, { headers: { 'Cache-Control': 'no-store' } });
}
