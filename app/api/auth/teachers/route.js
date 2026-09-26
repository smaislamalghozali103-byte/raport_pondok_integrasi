import { db } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await db.collection('teachers').orderBy('name').get();

    // Administrator sepenuhnya terpisah dari login guru.
    // ID admin tidak boleh muncul pada dropdown login guru.
    const adminIds = new Set(
      String(process.env.ADMIN_TEACHER_IDS || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    );

    const teachers = s.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => String(t.status || '').trim().toUpperCase() === 'AKTIF')
      .filter(t => !adminIds.has(String(t.id)))
      .map(t => ({
        id: t.id,
        teacherCode: t.teacherCode || t.id,
        name: t.name || '',
        unit: t.unit || '',
        pinConfigured: t.pinConfigured === true
      }));

    return Response.json(
      { success: true, teachers },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (e) {
    return Response.json(
      { success: false, message: e.message || 'Gagal memuat master guru.' },
      { status: 500 }
    );
  }
}
