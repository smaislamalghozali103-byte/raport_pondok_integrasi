import { requireAdmin } from '@/lib/admin-auth';
import { db } from '@/lib/firebase-admin';
import { spreadsheetIdFromUrl } from '@/lib/google-sheets';
import XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

const clean = (v) => String(v ?? '').trim();
const norm = (v) => clean(v)
  .toLowerCase()
  .normalize('NFKC')
  .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
  .replace(/\\s+/g, ' ')
  .trim();

function pick(row, names) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    if (row[name] != null && clean(row[name])) return clean(row[name]);
  }
  const wanted = names.map(norm);
  for (const key of keys) {
    if (wanted.includes(norm(key)) && clean(row[key])) return clean(row[key]);
  }
  return '';
}

function extractRows(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const rows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const values = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    for (const row of values) rows.push({ ...row, __sourceSheet: sheetName });
  }

  return { workbook, rows };
}

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) {
      return Response.json(
        { success: false, message: auth.message },
        { status: auth.status }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return Response.json(
        { success: false, message: 'File mapping Spreadsheet wajib diunggah.' },
        { status: 400 }
      );
    }

    const fileName = clean(file.name || 'spreadsheet-mapping.xlsx');
    const lowerName = fileName.toLowerCase();

    if (!/\\.(xlsx|xls|csv)$/.test(lowerName)) {
      return Response.json(
        { success: false, message: 'Format harus .xlsx, .xls, atau .csv.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) {
      return Response.json(
        { success: false, message: 'Ukuran file tidak valid. Maksimal 10 MB.' },
        { status: 400 }
      );
    }

    const { rows } = extractRows(buffer);

    if (!rows.length) {
      return Response.json(
        { success: false, message: 'Tidak ada data pada file mapping Spreadsheet.' },
        { status: 400 }
      );
    }

    const classSnap = await db.collection('classes').get();
    const classes = classSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const byId = new Map();
    const byName = new Map();

    for (const item of classes) {
      byId.set(norm(item.id), item);
      byId.set(norm(item.code), item);
      byName.set(norm(item.name), item);
    }

    const updated = [];
    const skipped = [];
    const errors = [];
    const seenClassIds = new Set();

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const classValue = pick(row, [
        'KELAS', 'KELAS ID', 'ID KELAS', 'NAMA KELAS',
        'CLASS', 'CLASS ID', 'CLASS NAME', 'KODE KELAS'
      ]);
      const spreadsheetValue = pick(row, [
        'SPREADSHEET ID', 'SPREADSHEET_ID', 'SPREADSHEET',
        'SPREADSHEET URL', 'URL SPREADSHEET', 'GOOGLE SHEET',
        'GOOGLE SHEETS', 'SHEET URL', 'LINK'
      ]);
      const sheetName = pick(row, [
        'SHEET', 'SHEET NAME', 'NAMA SHEET', 'TAB',
        'TAB SHEET', 'SPREADSHEET SHEET'
      ]) || 'Rekap';

      if (!classValue && !spreadsheetValue) continue;

      if (!classValue || !spreadsheetValue) {
        skipped.push({
          row: index + 2,
          class: classValue || '',
          reason: 'Kolom kelas atau Spreadsheet ID/URL kosong.'
        });
        continue;
      }

      let spreadsheetId;
      try {
        spreadsheetId = spreadsheetIdFromUrl(spreadsheetValue);
      } catch (error) {
        errors.push({
          row: index + 2,
          class: classValue,
          reason: error.message
        });
        continue;
      }

      const target =
        byId.get(norm(classValue)) ||
        byName.get(norm(classValue));

      if (!target) {
        skipped.push({
          row: index + 2,
          class: classValue,
          reason: 'Kelas tidak ditemukan di master kelas.'
        });
        continue;
      }

      if (seenClassIds.has(target.id)) {
        skipped.push({
          row: index + 2,
          class: classValue,
          reason: 'Kelas duplikat; baris pertama digunakan.'
        });
        continue;
      }

      seenClassIds.add(target.id);

      await db.collection('classes').doc(target.id).set({
        spreadsheetId,
        spreadsheetSheet: sheetName,
        updatedAt: new Date(),
        updatedBy: auth.session.teacherId
      }, { merge: true });

      updated.push({
        classId: target.id,
        className: target.name || target.id,
        spreadsheetId,
        sheetName
      });
    }

    return Response.json({
      success: true,
      fileName,
      totalRows: rows.length,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      updated,
      skipped,
      errors,
      message: updated.length
        ? `${updated.length} kelas berhasil dihubungkan dengan Spreadsheet.`
        : 'Tidak ada kelas yang berhasil diperbarui.'
    });
  } catch (error) {
    console.error('BULK SPREADSHEET IMPORT ERROR', error);
    return Response.json({
      success: false,
      message: error?.message || 'Gagal mengimpor mapping Spreadsheet.'
    }, { status: 500 });
  }
}
