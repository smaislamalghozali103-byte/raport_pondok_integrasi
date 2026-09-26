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

function normalizePersonName(value) {
  return norm(value)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\b(الاسم|كامل|nama|siswa|peserta|didik)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellMatchesFlexibleNumber(cell, wanted) {
  const target = normDigits(wanted);
  if (!target) return false;

  const raw = clean(cell).normalize('NFKC');
  const direct = normDigits(raw);
  if (direct === target || direct.replace(/^0+/, '') === target.replace(/^0+/, '')) {
    return true;
  }

  // Google Sheets dapat mengembalikan angka panjang sebagai scientific notation.
  const scientific = raw.replace(/,/g, '.').match(/^[-+]?\d+(?:\.\d+)?[eE][+-]?\d+$/);
  if (scientific) {
    const numeric = Number(raw.replace(/,/g, '.'));
    if (Number.isFinite(numeric)) {
      const rounded = String(Math.round(numeric));
      if (rounded === target || rounded.replace(/^0+/, '') === target.replace(/^0+/, '')) {
        return true;
      }
    }
  }

  return false;
}

function findStudentRow(values, student) {
  const wantedNisn = normDigits(student.nisn);
  const wantedNis = normDigits(student.nis);
  const wantedName = normalizePersonName(student.name || student.fullName);
  const columns = detectStudentColumns(values);

  // 1. NISN/NIS pada kolom yang terdeteksi.
  for (let i = 0; i < values.length; i++) {
    const row = values[i] || [];
    if (wantedNisn && columns.nisn.some(col => cellMatchesFlexibleNumber(row[col], wantedNisn))) {
      return { rowIndex: i, matchedBy: 'NISN' };
    }
    if (wantedNis && columns.nis.some(col => cellMatchesFlexibleNumber(row[col], wantedNis))) {
      return { rowIndex: i, matchedBy: 'NIS' };
    }
  }

  // 2. Nama exact pada kolom yang terdeteksi.
  if (wantedName) {
    for (let i = 0; i < values.length; i++) {
      const row = values[i] || [];
      if (columns.name.some(col => normalizePersonName(row[col]) === wantedName)) {
        return { rowIndex: i, matchedBy: 'NAMA_EXACT' };
      }
    }
  }

  // 3. Fallback angka: scan SEMUA sel, termasuk scientific notation.
  for (let i = 0; i < values.length; i++) {
    const row = values[i] || [];
    if (wantedNisn && row.some(cell => cellMatchesFlexibleNumber(cell, wantedNisn))) {
      return { rowIndex: i, matchedBy: 'NISN_FALLBACK' };
    }
    if (wantedNis && row.some(cell => cellMatchesFlexibleNumber(cell, wantedNis))) {
      return { rowIndex: i, matchedBy: 'NIS_FALLBACK' };
    }
  }

  if (!wantedName) return null;

  const wantedTokens = wantedName.split(' ').filter(token => token.length >= 2);

  // 4. Nama dalam satu baris / label "الاسم كامل : NAMA".
  for (let i = 0; i < values.length; i++) {
    const row = values[i] || [];
    const normalizedCells = row.map(normalizePersonName).filter(Boolean);
    const rowNorm = normalizePersonName(rowText(row));

    if (rowNorm.includes(wantedName)) {
      return { rowIndex: i, matchedBy: 'NAMA_IN_CONTENT' };
    }

    for (const cell of row) {
      const raw = clean(cell);
      if (!raw) continue;
      const parts = raw.split(/[:：=|]/).map(part => normalizePersonName(part)).filter(Boolean);
      if (parts.some(part => part === wantedName || part.includes(wantedName))) {
        return { rowIndex: i, matchedBy: 'NAMA_LABEL_VALUE' };
      }
    }

    if (wantedTokens.length >= 2 && wantedTokens.every(token => rowNorm.includes(token))) {
      return { rowIndex: i, matchedBy: 'NAMA_TOKENS_ROW' };
    }

    // Beberapa template membagi nama ke beberapa sel tanpa header.
    if (wantedTokens.length >= 2) {
      const joined = normalizedCells.join(' ');
      if (joined.includes(wantedName)) {
        return { rowIndex: i, matchedBy: 'NAMA_TOKENS_CELLS' };
      }
    }
  }

  // 5. Nama dapat terpecah ke dua/tiga baris berurutan.
  for (let i = 0; i < values.length; i++) {
    const windowRows = [];
    for (let j = i; j < Math.min(values.length, i + 3); j++) {
      windowRows.push(normalizePersonName(rowText(values[j] || [])));
    }
    const windowText = windowRows.join(' ');
    if (windowText.includes(wantedName)) {
      return { rowIndex: i, matchedBy: 'NAMA_MULTIROW' };
    }
    if (wantedTokens.length >= 2) {
      const hits = wantedTokens.filter(token => windowText.includes(token));
      if (hits.length >= Math.max(2, Math.ceil(wantedTokens.length * 0.75))) {
        return { rowIndex: i, matchedBy: 'NAMA_MULTIROW_TOKENS' };
      }
    }
  }

  // 6. Fuzzy matching sebagai jalan terakhir.
  let best = { rowIndex: -1, score: 0 };
  const candidateColumns = columns.name.length ? columns.name : null;

  for (let i = 0; i < values.length; i++) {
    const row = values[i] || [];
    const cells = candidateColumns ? candidateColumns.map(col => row[col]) : row;

    for (const cell of cells) {
      const value = normalizePersonName(cell);
      if (!value || value.length < 3) continue;

      const score = similarity(value, wantedName);
      if (score > best.score) {
        best = { rowIndex: i, score };
      }
    }
  }

  if (best.rowIndex >= 0 && best.score >= 0.72) {
    return {
      rowIndex: best.rowIndex,
      matchedBy: 'NAMA_FUZZY',
      score: Number(best.score.toFixed(3))
    };
  }

  return null;
}

function isReportSheetName(title) {
  const normalized = clean(title).normalize('NFKC').trim().toUpperCase();
  return normalized === 'RAPORT' || normalized === 'RAPOT';
}

function scoreReportSheet(title, values, student) {
  const sheetNorm = norm(title);
  const sample = norm(
    (values || []).slice(0, 120)
      .map(row => (row || []).slice(0, 30).map(clean).join(' '))
      .join(' ')
  );

  let score = 0;
  const reasons = [];

  if (isReportSheetName(title)) {
    score += 150;
    reasons.push('nama-sheet-raport');
  }
  if (/rekap|rekapitulasi|nilai/.test(sheetNorm)) {
    score -= 100;
    reasons.push('nama-sheet-rekap');
  }

  const reportSignals = [
    ['mata pelajaran', 35],
    ['nama lengkap', 30],
    ['tahun ajaran', 25],
    ['peringkat', 25],
    ['wali kelas', 25],
    ['wali الفصل', 20],
    ['jumlah', 15],
    ['nilai rata rata', 15],
    ['hasil', 10],
    ['مدير المعهد', 10],
    ['الاسم كامل', 10],
    ['العام الدراسي', 10],
    ['النتيجة المعدلة', 10]
  ];

  for (const [signal, points] of reportSignals) {
    if (sample.includes(norm(signal))) {
      score += points;
      reasons.push(signal);
    }
  }

  const rekapSignals = [
    ['rekap', 45],
    ['nisn', 25],
    ['kode mapel', 15],
    ['nama siswa', 15],
    ['kelas', 10],
    ['guru', 10],
    ['mapel', 10]
  ];

  let rekapHits = 0;
  for (const [signal, points] of rekapSignals) {
    if (sample.includes(norm(signal))) {
      score -= points;
      rekapHits++;
    }
  }
  if (rekapHits >= 3) {
    score -= 60;
    reasons.push('struktur-rekap');
  }

  if (student) {
    const match = findStudentRow(values, student);
    if (match) {
      score += 80;
      reasons.push('siswa-' + match.matchedBy);
    }
  }

  return { score, reasons };
}

async function findBestReportSheet(meta, spreadsheetId, configuredSheetName, student) {
  const candidates = [];
  const sheets = meta.sheets || [];

  for (let index = 0; index < sheets.length; index++) {
    const sheet = sheets[index];
    const title = clean(sheet.title);
    if (!title) continue;

    const valuesResult = await readSheet(spreadsheetId, title, 'A:ZZ');
    const scored = scoreReportSheet(title, valuesResult.values || [], student);

    candidates.push({
      sheet,
      values: valuesResult.values || [],
      index,
      score: scored.score,
      reasons: scored.reasons
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  if (!candidates.length) return null;

  // RAPORT/RAPOT adalah nama resmi sheet raport.
  // Jika sheet tersebut ada, jangan biarkan sheet REKAP menang hanya
  // karena memiliki kecocokan siswa atau struktur tabel yang lebih tinggi.
  const namedReports = candidates
    .filter(c => isReportSheetName(c.sheet.title))
    .sort((a, b) => b.score - a.score);

  if (namedReports.length) {
    return namedReports[0];
  }

  return candidates[0];
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

    // Deteksi otomatis sheet RAPORT berdasarkan NAMA + ISI + kecocokan siswa.
    // Tidak lagi bergantung pada posisi sheet (mis. "sheet ke-4").
    let studentForDetection = null;
    if (mode === 'student' && studentId) {
      const studentSnapForDetection = await db.collection('students').doc(studentId).get();
      if (studentSnapForDetection.exists) {
        studentForDetection = {
          id: studentSnapForDetection.id,
          ...studentSnapForDetection.data()
        };
      }
    }

    const bestReport = await findBestReportSheet(
      meta,
      spreadsheetId,
      sheetName,
      studentForDetection
    );

    if (!bestReport) {
      throw new Error('Tidak ditemukan sheet yang dapat dikenali sebagai RAPORT.');
    }

    const targetSheet = bestReport.sheet;
    const valuesResult = { values: bestReport.values };
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
            sheet: targetSheet.title,
            configuredSheet: sheetName,
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

    // Jangan mengirim seluruh columnCount sheet ke exporter.
    // Template Rapot sering mempunyai banyak kolom kosong di sebelah kanan,
    // yang membuat Google Sheets mengecilkan raport saat fit-to-width.
    // Gunakan lebar area yang benar-benar berisi data/form raport.
    const usedColumnCount = Math.max(
      1,
      ...valuesResult.values.map(row => {
        const cells = row || [];
        let last = -1;
        for (let i = cells.length - 1; i >= 0; i--) {
          if (clean(cells[i])) {
            last = i;
            break;
          }
        }
        return last + 1;
      })
    );

    // Sheet Rapot adalah template raport satu siswa. Jangan memotongnya
    // mulai dari baris tempat nama ditemukan karena bagian kop, identitas,
    // tanda tangan, wali kelas, dan mudir dapat berada sebelum/sesudah baris itu.
    // Validasi siswa tetap dilakukan, tetapi PDF memakai seluruh area terisi.
    const usedRowCount = Math.max(
      valuesResult.values.length,
      ...valuesResult.values.map((row, index) => row && row.some(cell => clean(cell)) ? index + 1 : 0),
      1
    );

    const exportRowStart = mode === "student" ? 0 : rowStart;
    const exportRowEnd = mode === "student" ? usedRowCount : rowEnd;

    const pdf = await exportSheetPdf(spreadsheetId, {
      sheetName: targetSheet.title,
      rowStart: exportRowStart,
      rowEnd: exportRowEnd,
      colStart: 0,
      colEnd: Math.min(
        Number(targetSheet.gridProperties?.columnCount || usedColumnCount),
        usedColumnCount
      ),
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
