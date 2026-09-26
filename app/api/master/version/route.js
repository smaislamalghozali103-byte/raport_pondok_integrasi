import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) return Response.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const snap = await db.collection('master_sync').doc('state').get();
  const data = snap.exists ? snap.data() : {};
  return Response.json({
    success: true,
    version: data.version || null,
    updatedAt: data.updatedAt || null,
    status: data.status || 'NEVER'
  }, { headers: { 'Cache-Control': 'no-store' } });
}
