import crypto from 'crypto';

export function requireSecret(name) {
  const value = process.env[name];
  if (!value || value.length < 32 || value.startsWith('CHANGE_THIS')) {
    throw new Error(`${name} belum dikonfigurasi dengan aman`);
  }
  return value;
}

export function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
}
