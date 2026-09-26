import { cookies } from 'next/headers';
import { db } from '@/lib/firebase-admin';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';
import { requireAdmin } from '@/lib/admin-auth';
import { getHomeroomClassIds } from '@/lib/authorization';
import { readSheet, spreadsheetMeta, exportSheetPdf } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

const clean = v => String(v ?? '').trim();

function norm(v) {
  return clean(v)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\\u200B-\\u200D\\uFEFF]/g, '')
    .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function normDigits(v) {
  return clean(v)
    .normalize('NFKC')
    .replace(/\\D/g, '');
}

function compact(v) {
  return norm(v).replace(/\\s+/g, '');
}

function rowText(row) {
  return (row || []).map(clean).join(' ');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur.push(Math.min(
        cur[j] + 1,
        prev[j + 1] + 1,
        prev[j] + cost
      ));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(a, b) {
  const x = compact(a);
  const y = compact(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) {
    return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  }
  const distance = levenshtein(x, y);
  return 1 - distance / Math.max(x.length, y.length);
}

function detectStudentColumns(values) {
  const aliases = {
    nisn: ['nisn', 'n i s n', 'nomor induk siswa nasional', 'no nisn'],
    nis: ['nis', 'n i s', 'nomor induk siswa', 'no nis'],
    name: ['nama', 'nama siswa', 'nama peserta didik', 'peserta didik', 'siswa']
  };

  const columns = { nisn: [], nis: [], name: [] };
  const scanRows = Math.min(values.length, 30);

  for (let rowIndex = 0; rowIndex < scanRows; rowIndex++) {
    const row = values[rowIndex] || [];
    row.forEach((cell, colIndex) => {
      const header = norm(cell);
      if (!header) return;

      for (const key of Object.keys(aliases)) {
        if (aliases[key].some(alias => header === alias || header.includes(alias))) {
          if (!columns[key].includes(colIndex)) columns[key].push(colIndex);
        }
      }
    });
  }

  return columns;
}

function cellMatchesNis(cell, wanted) {
  const a = normDigits(cell);
  const b = normDigits(wanted);
  if (!a || !b) return false;
  if (a === b) return true;

  // Google Sheets/Excel kadang mengubah angka menjadi format yang
  // berbeda. Untuk NIS/NISN numerik, bandingkan nilai tanpa pemisah.
  return a.replace(/^0+/, '') === b.replace(/^0+/, '');
}

function findStudentRow(values, student) {
  const wantedNisn = normDigits(student.nisn);
  const wantedNis = normDigits(student.nis);
  const wantedName = norm(student.name || student.fullName);
  const columns = detectStudentColumns(values);

  // 1. Prioritas tertinggi: NISN pada kolom yang terdeteksi.
  if (wantedNisn) {
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      if (columns.nisn.some(col => cellMatchesNis(row[col], wantedNisn))) {
        return { rowIndex: i, matchedBy: 'NISN' };
      }
    }
  }

  // 2. Fallback: NIS pada kolom yang terdeteksi.
  if (wantedNis) {
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      if (columns.nis.some(col => cellMatchesNis(row[col], wantedNis))) {
        return { rowIndex: i, matchedBy: 'NIS' };
      }
    }
  }

  // 3. Nama exact pada kolom nama.
  if (wantedName) {
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      if (columns.name.some(col => norm(row[col]) === wantedName)) {
        return { rowIndex: i, matchedBy: 'NAMA_EXACT' };
      }
    }
  }

  // 4. Jika header tidak terdeteksi, tetap coba semua sel untuk NIS/NISN.
  if (wantedNisn || wantedNis) {
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      if ((wantedNisn && row.some(cell => cellMatchesNis(cell, wantedNisn))) ||
          (wantedNis && row.some(cell => cellMatchesNis(cell, wantedNis)))) {
        return { rowIndex: i, matchedBy: wantedNisn ? 'NISN_FALLBACK' : 'NIS_FALLBACK' };
      }
    }
  }

  // 5. Fallback nama: toleransi tanda baca, spasi, dan typo kecil.
  if (wantedName) {
    let best = { rowIndex: -1, score: 0 };
    const candidateColumns = columns.name.length ? columns.name : null;

    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      const cells = candidateColumns
        ? candidateColumns.map(col => row[col])
        : row;

      for (const cell of cells) {
        const value = norm(cell);
        if (!value || value.length < 3) continue;

        const score = similarity(value, wantedName);
        if (score > best.score) {
          best = { rowIndex: i, score };
        }
      }
    }

    if (best.rowIndex >= 0 && best.score >= 0.82) {
      return {
        rowIndex: best.rowIndex,
        matchedBy: 'NAMA_FUZZY',
        score: Number(best.score.toFixed(3))
      };
    }
  }

  return null;
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
    const configuredSheetIndex = meta.sheets.findIndex(
      s => String(s.title).trim().toLowerCase() === sheetName.trim().toLowerCase()
    );

    // spreadsheetSheet tetap menunjuk ke sheet REKAP sebagai sumber pemetaan.
    // Untuk cetak raport, gunakan sheet RAPORT yang berada setelah REKAP.
    // Prioritas:
    // 1) sheet bernama "Raport" / "Rapor"
    // 2) sheet setelah sheet REKAP
    // 3) sheet konfigurasi jika tidak ada alternatif.
    const reportSheet =
      meta.sheets.find(s => /^(raport|rapor)$/i.test(String(s.title).trim())) ||
      (configuredSheetIndex >= 0 ? meta.sheets[configuredSheetIndex + 1] : null) ||
      meta.sheets.find(s => /raport|rapor/i.test(String(s.title))) ||
      (configuredSheetIndex >= 0 ? meta.sheets[configuredSheetIndex] : null) ||
      meta.sheets[0];

    if (!reportSheet) throw new Error('Sheet raport tidak ditemukan.');

    const targetSheet = reportSheet;
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

      const match = findStudentRow(valuesResult.values, student);
      if (!match) {
        return Response.json({
          success: false,
          message: 'Nama/NIS/NISN siswa tidak ditemukan pada Spreadsheet Raport. Cetak kelas tetap dapat digunakan.',
          debug: {
            namaDicari: clean(student.name || student.fullName),
            nisDicari: clean(student.nis),
            nisnDicari: clean(student.nisn),
            spreadsheetId,
            sheet: targetSheet.title,\n            configuredSheet: sheetName,\n            configuredSheetIndex,
            rowsChecked: valuesResult.values.length,
            detectedColumns: detectStudentColumns(valuesResult.values)
          }
        }, { status: 404 });
      }

      const block = studentBlock(valuesResult.values, match.rowIndex);
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
