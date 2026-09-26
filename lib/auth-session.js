import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'raport_session';
export const SESSION_MAX_AGE = 60 * 60 * 12;

function getSecret() {
  const secret = String(process.env.SESSION_SECRET || '');

  if (secret.length < 32) {
    throw new Error(
      'SESSION_SECRET belum dikonfigurasi dengan benar. Minimal 32 karakter.'
    );
  }

  return secret;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

export function createSessionToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + SESSION_MAX_AGE };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');

  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token) {
  try {
    if (!token) return null;

    const parts = String(token).split('.');
    if (parts.length !== 2) return null;

    const [encoded, provided] = parts;
    const expected = sign(encoded);

    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      return null;
    }

    const data = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    );

    if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return data;
  } catch (err) {
    console.error('[AUTH] verifySessionToken error:', err.message);
    return null;
  }
}
