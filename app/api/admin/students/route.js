import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const a = await requireAdmin();
  if (!a.ok) return Response.json({ success: false, message: a.message }, { status: a.status });
  const p = new URL(req.url).searchParams;
  const classId = String(p.get('classId') || '').trim();
  if (!classId) return Response.json({ success: false, message: 'classId wajib.' }, { status: 400 });
  const s = await db.collection('students').where('classId', '==', classId).get();
  const students = s.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), 'id'));
  return Response.json({ success: true, students });
}


export async function DELETE(req) {
  const a = await requireAdmin();
  if (!a.ok) return Response.json({ success: false, message: a.message }, { status: a.status });
  try {
    const p = new URL(req.url).searchParams;
    const classId = String(p.get('classId') || '').trim();
    if (!classId) return Response.json({ success: false, message: 'classId wajib.' }, { status: 400 });

    const snap = await db.collection('students').where('classId', '==', classId).get();
    if (!snap.size) {
      return Response.json({ success: true, deleted: 0, message: 'Tidak ada data siswa untuk direset.' });
    }

    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 300) {
      const batch = db.batch();
      for (const doc of docs.slice(i, i + 300)) batch.delete(db.collection('students').doc(doc.id));
      await batch.commit();
    }

    const layoutSnap = await db.collection('rekap_layouts').where('classId', '==', classId).get();
    for (const doc of layoutSnap.docs) {
      await db.collection('rekap_layouts').doc(doc.id).delete();
    }

    return Response.json({
      success: true,
      deleted: docs.length,
      message: `Reset siswa kelas berhasil. ${docs.length} data siswa dihapus dari APP_DB. Nilai tidak dihapus.`
    });
  } catch (err) {
    console.error('RESET STUDENTS ERROR', err);
    return Response.json({ success: false, message: err?.message || 'Gagal reset siswa.' }, { status: 500 });
  }
}
