import crypto from 'crypto';
import { cookies } from 'next/headers';

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

    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      return null;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    if (
      data.role !== 'administrator' ||
      !data.exp ||
      data.exp <= Math.floor(Date.now() / 1000)
    ) {
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
  const adminSession = verifyAdminToken(adminToken);

  // Hanya sesi admin yang sah yang boleh mengakses API administrator.
  // Sesi guru TIDAK pernah menjadi fallback administrator.
  if (!adminSession) {
    return {
      ok: false,
      status: 403,
      needsAdminPin: true,
      message: 'Akses khusus administrator. Silakan verifikasi PIN administrator.'
    };
  }

  return {
    ok: true,
    session: {
      teacherId: 'ADMIN',
      teacherName: 'Administrator',
      role: 'administrator'
    },
    adminSession
  };
}

export { ADMIN_SESSION_MAX_AGE };
