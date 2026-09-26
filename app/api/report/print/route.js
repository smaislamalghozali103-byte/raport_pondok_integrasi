import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { requireAdmin } from '@/lib/admin-auth';
import { getHomeroomClassIds } from '@/lib/authorization';
import { readSheet, spreadsheetMeta, exportSheetPdf } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const clean = v => String(v ?? '').trim();
const norm = v => clean(v).toLowerCase().normalize('NFKC').replace(/[^\\p{L}\\p{N}]+/gu, ' ').replace(/\\s+/g, ' ').trim();

function rowText(row) {
  return (row || []).map(clean).join(' ');
}

function findStudentRow(values, student) {
  const wantedNis = norm(student.nisn || student.nis || '');
  const wantedName = norm(student.name || student.fullName || '');

  for (let i = 0; i < values.length; i++) {
    const text = norm(rowText(values[i]));
    if (wantedNis && text.includes(wantedNis)) return i;
    if (wantedName && text.includes(wantedName)) return i;
  }
  return -1;
}

function studentBlock(values, rowIndex) {
  if (rowIndex < 0) return null;

  let start = rowIndex;
  let end = rowIndex + 1;

  // Jika setiap raport/siswa dipisahkan baris kosong, ambil satu blok utuh.
  for (let i = rowIndex - 1; i >= 0; i--) {
    if (!rowText(values[i])) break;
    start = i;
  }
  for (let i = rowIndex + 1; i < values.length; i++) {
    if (!rowText(values[i])) break;
    end = i + 1;
  }

  // Hindari blok terlalu kecil akibat format tanpa baris kosong.
  if (end - start < 5) {
    start = Math.max(0, rowIndex - 12);
    end = Math.min(values.length, rowIndex + 25);
  }

  return { start, end };
}

async function getAccess() {
  const admin = await requireAdmin();
  if (admin.ok) return { admin: true, session: admin.session };

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) return { admin: false, session: null };

  const homeroomIds = await getHomeroomClassIds(session);
  return { admin: false, session, homeroomIds };
}

export async function GET(request) {
  try {
    const access = await getAccess();
    if (!access.session) {
      return Response.json({ success: false, message: 'Sesi login tidak valid.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classId = clean(searchParams.get('classId'));
    const studentId = clean(searchParams.get('studentId'));
    const mode = clean(searchParams.get('mode') || 'class').toLowerCase();

    if (!classId) {
      return Response.json({ success: false, message: 'Kelas wajib dipilih.' }, { status: 400 });
    }

    if (!access.admin && !(access.homeroomIds || []).map(String).includes(String(classId))) {
      return Response.json({
        success: false,
        message: 'Ruang cetak raport hanya tersedia untuk wali kelas atas kelas binaannya.'
      }, { status: 403 });
    }

    const classSnap = await db.collection('classes').doc(classId).get();
    if (!classSnap.exists) {
      return Response.json({ success: false, message: 'Kelas tidak ditemukan.' }, { status: 404 });
    }

    const classData = classSnap.data() || {};
    const spreadsheetId = clean(classData.spreadsheetId);
    const sheetName = clean(classData.spreadsheetSheet || 'Rekap') || 'Rekap';

    if (!spreadsheetId) {
      return Response.json({
        success: false,
        message: 'Kelas ini belum memiliki Spreadsheet Raport yang terhubung.'
      }, { status: 400 });
    }

    const meta = await spreadsheetMeta(spreadsheetId);
    const targetSheet = meta.sheets.find(s => String(s.title) === sheetName) || meta.sheets[0];
    if (!targetSheet) throw new Error('Sheet raport tidak ditemukan.');

    const valuesResult = await readSheet(spreadsheetId, targetSheet.title, 'A:ZZ');
    let rowStart = 0;
    let rowEnd = Number(targetSheet.gridProperties?.rowCount || valuesResult.values.length || 1000);

    let fileLabel = classData.name || 'Kelas';

    if (mode === 'student') {
      if (!studentId) {
        return Response.json({ success: false, message: 'Siswa wajib dipilih untuk cetak per siswa.' }, { status: 400 });
      }

      const studentSnap = await db.collection('students').doc(studentId).get();
      if (!studentSnap.exists) {
        return Response.json({ success: false, message: 'Siswa tidak ditemukan.' }, { status: 404 });
      }

      const student = { id: studentSnap.id, ...studentSnap.data() };
      if (String(student.classId || '') !== String(classId)) {
        return Response.json({ success: false, message: 'Siswa bukan anggota kelas yang dipilih.' }, { status: 400 });
      }

      const foundRow = findStudentRow(valuesResult.values, student);
      if (foundRow < 0) {
        return Response.json({
          success: false,
          message: 'Nama/NISN siswa tidak ditemukan pada Spreadsheet Raport. Cetak kelas tetap dapat digunakan.'
        }, { status: 404 });
      }

      const block = studentBlock(valuesResult.values, foundRow);
      rowStart = block.start;
      rowEnd = block.end;
      fileLabel = student.name || student.fullName || 'Siswa';
    }

    const pdf = await exportSheetPdf(spreadsheetId, {
      sheetName: targetSheet.title,
      rowStart,
      rowEnd,
      colStart: 0,
      colEnd: Number(targetSheet.gridProperties?.columnCount || 26),
      portrait: true
    });

    const safe = String(fileLabel).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Raport';
    const filename = mode === 'student'
      ? `Raport_${safe}.pdf`
      : `Raport_${safe}_1_Kelas.pdf`;

    return new Response(pdf.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Raport-Spreadsheet-Id': spreadsheetId,
        'X-Raport-Sheet': targetSheet.title,
        'X-Raport-Mode': mode
      }
    });
  } catch (error) {
    console.error('[REPORT PRINT ERROR]', error);
    return Response.json({
      success: false,
      message: error?.message || 'Gagal membuat PDF raport asli.'
    }, { status: 500 });
  }
}
