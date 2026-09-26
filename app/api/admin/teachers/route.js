import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status });
  const snap = await db.collection('teachers').orderBy('name').get();
  return Response.json({ success: true, teachers: snap.docs.map(d => ({ id: d.id, ...d.data(), pinHash: undefined })) });
}

export async function PATCH(req) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status });
  const b = await req.json();
  const id = String(b.teacherId || '').trim();
  if (!id) return Response.json({ success: false, message: 'teacherId wajib.' }, { status: 400 });
  const ref = db.collection('teachers').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return Response.json({ success: false, message: 'Guru tidak ditemukan.' }, { status: 404 });
  const data = {};
  if (b.status !== undefined) data.status = String(b.status).toUpperCase();
  if (b.name !== undefined) data.name = String(b.name).trim();

  if (b.role !== undefined) {
    const role = String(b.role).trim().toLowerCase();
    if (!['guru', 'wali_kelas'].includes(role)) {
      return Response.json({ success: false, message: 'Role harus guru atau wali_kelas.' }, { status: 400 });
    }
    data.role = role;
  }

  if (b.homeroomClassId !== undefined) {
    data.homeroomClassId = b.homeroomClassId ? String(b.homeroomClassId).trim() : null;
  }
  await ref.set({ ...data, updatedAt: new Date(), updatedBy: auth.session.teacherId }, { merge: true });
  return Response.json({ success: true });
}
