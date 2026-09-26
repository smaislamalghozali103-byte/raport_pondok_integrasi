import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIp, safeEqual } from '@/lib/security';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  createAdminToken,
  verifyAdminToken
} from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

function getAdminPinConfig() {
  const hash = String(process.env.ADMIN_PIN_HASH || '').trim();
  const pin = String(process.env.ADMIN_PIN || '').trim();

  if (!hash && !pin) {
    throw new Error('ADMIN_PIN_HASH atau ADMIN_PIN belum dikonfigurasi.');
  }

  if (pin && !/^\d{6,}$/.test(pin)) {
    throw new Error('ADMIN_PIN harus berupa minimal 6 digit angka.');
  }

  return { hash, pin };
}

async function verifyAdminPin(inputPin) {
  const config = getAdminPinConfig();

  // Utamakan bcrypt hash jika tersedia.
  if (config.hash) {
    try {
      if (await bcrypt.compare(inputPin, config.hash)) {
        return true;
      }
    } catch (err) {
      // Jika hash di deployment lama/keliru, lanjutkan ke fallback ADMIN_PIN.
      console.error('[ADMIN AUTH] ADMIN_PIN_HASH tidak valid, mencoba ADMIN_PIN fallback.');
    }
  }

  // Fallback server-side untuk memudahkan setup awal.
  // Nilai ini tidak pernah dikirim ke browser atau disimpan di browser.
  if (config.pin) {
    return safeEqual(inputPin, config.pin);
  }

  return false;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;

  return Response.json({
    success: true,
    authenticated: Boolean(verifyAdminToken(token))
  });
}

export async function POST(req) {
  try {
    const rl = checkRateLimit(`admin-login:${clientIp(req)}`);
    if (!rl.allowed) {
      return Response.json({
        success: false,
        message: 'Terlalu banyak percobaan. Coba lagi beberapa menit.'
      }, { status: 429 });
    }

    const body = await req.json();
    const pin = String(body.pin || '').trim();

    if (!/^\d{6,}$/.test(pin)) {
      return Response.json({
        success: false,
        message: 'PIN administrator minimal 6 digit angka.'
      }, { status: 400 });
    }

    const valid = await verifyAdminPin(pin);

    if (!valid) {
      return Response.json({
        success: false,
        message: 'PIN administrator salah.'
      }, { status: 401 });
    }

    const cookieStore = await cookies();
    const isHttps =
      req.headers.get('x-forwarded-proto') === 'https' ||
      process.env.NODE_ENV === 'production';

    cookieStore.set(ADMIN_COOKIE_NAME, createAdminToken(), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE
    });

    return Response.json({
      success: true,
      message: 'Verifikasi PIN administrator berhasil.'
    });
  } catch (err) {
    console.error('[ADMIN AUTH ERROR]', err);
    return Response.json({
      success: false,
      message: err?.message || 'Konfigurasi PIN administrator belum lengkap.'
    }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);

  return Response.json({
    success: true,
    message: 'Sesi administrator berakhir.'
  });
}
