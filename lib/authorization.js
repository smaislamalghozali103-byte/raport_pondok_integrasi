import { db } from './firebase-admin';

const norm = v => String(v ?? '').trim().toLowerCase();

export async function canTeach(session, classId, subjectId) {
  if (!session?.teacherId || !classId || !subjectId) return false;
  const snap = await db.collection('teacher_assignments')
    .where('teacherId', '==', session.teacherId)
    .where('classId', '==', classId)
    .where('subjectId', '==', subjectId)
    .get();
  if (!snap.empty) return snap.docs.some(d => norm(d.data()?.status) === 'aktif');

  // Fallback for imported master data that uses the original collection name.
  const old = await db.collection('assignments')
    .where('teacherId', '==', session.teacherId)
    .where('classId', '==', classId)
    .where('subjectId', '==', subjectId)
    .get();
  return !old.empty && old.docs.some(d => norm(d.data()?.status) === 'aktif');
}
