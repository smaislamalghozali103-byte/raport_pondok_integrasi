import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'raport_session';
export const SESSION_MAX_AGE = 60 * 60 * 12;

const FALLBACK_SECRET = 'c7e48b9f1d0a52384a6c9d7e1b3f02485e9a7c6d1b2f3e4a5c6b7d8e9f0a1b2c';

function getSecret() {
  const s = process.env.SESSION_SECRET;
  return (s && s.length >= 32) ? s : FALLBACK_SECRET;
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
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, provided] = parts;
    const expected = sign(encoded);
    if (provided !== expected) {
      console.warn('[AUTH] Session token signature mismatch');
      return null;
    }
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!data.exp || data.exp <= Math.floor(Date.now() / 1000)) {
      console.warn('[AUTH] Session token expired');
      return null;
    }
    return data;
  } catch (err) {
    console.error('[AUTH] verifySessionToken error:', err.message);
    return null;
  }
}
