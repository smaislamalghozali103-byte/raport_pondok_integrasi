import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const a = await requireAdmin();
  if (!a.ok) return Response.json({ success: false, message: a.message }, { status: a.status });
  const s = await db.collection('units').orderBy('name').get();
  return Response.json({ success: true, units: s.docs.map(d => ({ id: d.id, ...d.data() })) });
}

export async function PATCH(req) {
  const a = await requireAdmin();
  if (!a.ok) return Response.json({ success: false, message: a.message }, { status: a.status });
  const b = await req.json();
  const id = String(b.unitId || '').trim();
  if (!id) return Response.json({ success: false, message: 'unitId wajib.' }, { status: 400 });
  await db.collection('units').doc(id).set({
    status: String(b.status || 'AKTIF').toUpperCase(),
    updatedAt: new Date(),
    updatedBy: a.session.teacherId
  }, { merge: true });
  return Response.json({ success: true });
}
