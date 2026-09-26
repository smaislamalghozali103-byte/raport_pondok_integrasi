import crypto from 'crypto';
import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';

export const ADMIN_COOKIE_NAME = 'raport_admin_session';
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 4;

function adminSecret() {
  const secret = String(process.env.SESSION_SECRET || '');
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET minimal 32 karakter untuk sesi administrator.');
  }
  return secret;
}

function signAdminValue(value) {
  return crypto.createHmac('sha256', adminSecret()).update(value).digest('hex');
}

export function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({
    role: 'administrator',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE
  })).toString('base64url');

  return `${payload}.${signAdminValue(payload)}`;
}

export function verifyAdminToken(token) {
  try {
    if (!token) return null;

    const parts = String(token).split('.');
    if (parts.length !== 2) return null;

    const [payload, signature] = parts;
    const expected = signAdminValue(payload);

    if (signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.role !== 'administrator' || !data.exp || data.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return data;
  } catch (err) {
    console.error('[ADMIN AUTH] verifyAdminToken:', err.message);
    return null;
  }
}

export async function requireAdmin() {
  const cookieStore = await cookies();
  const adminToken = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  const adminSession = verifyAdminToken(adminToken);

  // PIN administrator yang berhasil diverifikasi adalah otorisasi utama.
  if (adminSession) {
    return {
      ok: true,
      session: session || {
        teacherId: 'ADMIN',
        teacherName: 'Administrator',
        role: 'administrator'
      },
      adminSession
    };
  }

  if (!session) {
    return {
      ok: false,
      status: 401,
      message: 'Silakan login terlebih dahulu.'
    };
  }

  // Login guru biasa tidak otomatis menjadi administrator.
  const adminIds = String(process.env.ADMIN_TEACHER_IDS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  if (adminIds.includes(String(session.teacherId))) {
    return { ok: true, session, adminSession: null };
  }

  return {
    ok: false,
    status: 403,
    needsAdminPin: true,
    message: 'Akses memerlukan PIN administrator.'
  };
}

export { ADMIN_SESSION_MAX_AGE };
