import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';
import { noStore } from '@/lib/production';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return Response.json({ success: false, message: auth.message }, { status: auth.status, headers: noStore() });
    }

    const { searchParams } = new URL(request.url);
    const teacherId = String(searchParams.get('teacherId') || '').trim();
    const classId = String(searchParams.get('classId') || '').trim();
    const unit = String(searchParams.get('unit') || '').trim();

    let query = db.collection('teacher_assignments');

    if (teacherId) {
      query = query.where('teacherId', '==', teacherId);
    }
    if (classId) {
      query = query.where('classId', '==', classId);
    }

    const snap = await query.get();
    let assignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (unit) {
      assignments = assignments.filter(a => String(a.unit || '').toLowerCase() === unit.toLowerCase());
    }

    return Response.json({
      success: true,
      total: assignments.length,
      assignments
    }, { headers: noStore() });
  } catch (err) {
    console.error('ADMIN ASSIGNMENTS ERROR', err);
    return Response.json({ success: false, message: err?.message || 'Gagal memuat penugasan guru.' }, { status: 500 });
  }
}
