import { db } from '@/lib/firebase-admin';
import { requireAdmin } from '@/lib/admin-auth';
import { noStore } from '@/lib/production';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status, headers: noStore() });
  const collections = ['teachers', 'units', 'classes', 'subjects', 'students', 'grades', 'grade_batches', 'sync_queue', 'audit_logs', 'rekap_layouts'];
  const counts = {};
  for (const name of collections) {
    const snap = await db.collection(name).count().get();
    counts[name] = snap.data().count;
  }
  return Response.json({
    success: true,
    version: '16.0',
    node: process.version,
    environment: process.env.NODE_ENV || 'development',
    serverTime: new Date().toISOString(),
    counts
  }, { headers: noStore() });
}
