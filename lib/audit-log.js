import { db } from './firebase-admin';

export async function writeAudit({ session, action, resourceType='', resourceId='', details={} }) {
  const now = new Date();
  const ref = db.collection('audit_logs').doc();
  await ref.set({
    id: ref.id,
    action: String(action || 'UNKNOWN'),
    resourceType: String(resourceType || ''),
    resourceId: String(resourceId || ''),
    teacherId: session?.teacherId || null,
    teacherCode: session?.teacherCode || null,
    teacherName: session?.teacherName || null,
    details,
    createdAt: now,
  });
  return ref.id;
}
