import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { requireAdmin } from '@/lib/admin-auth';
import { getHomeroomClassIds } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = await requireAdmin();
    let session = admin.ok ? admin.session : null;
    let adminAccess = admin.ok;

    if (!session) {
      const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
      session = verifySessionToken(token);
    }

    if (!session) {
      return Response.json({ success: false, message: 'Sesi login tidak valid.' }, { status: 401 });
    }

    let classIds = null;
    if (!adminAccess) classIds = await getHomeroomClassIds(session);

    const snap = await db.collection('classes').orderBy('name').get();
    const classes = [];

    for (const doc of snap.docs) {
      if (classIds && !classIds.map(String).includes(String(doc.id))) continue;

      const data = doc.data() || {};
      const studentsSnap = await db.collection('students')
        .where('classId', '==', doc.id)
        .get();

      classes.push({
        id: doc.id,
        name: data.name || doc.id,
        unit: data.unit || data.unitId || '',
        spreadsheetId: data.spreadsheetId || '',
        spreadsheetSheet: data.spreadsheetSheet || 'Rekap',
        students: studentsSnap.docs
          .map(s => ({ id: s.id, ...s.data() }))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id'))
          .map(s => ({
            id: s.id,
            name: s.name || s.fullName || '',
            nisn: s.nisn || s.nis || ''
          }))
      });
    }

    return Response.json({
      success: true,
      role: adminAccess ? 'admin' : session.role,
      classes
    });
  } catch (error) {
    console.error('[REPORT PRINT CLASSES ERROR]', error);
    return Response.json({
      success: false,
      message: error?.message || 'Gagal memuat kelas raport.'
    }, { status: 500 });
  }
}
