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

function parseMarkdownRows(text) {
  const lines = String(text || '').replace(/\\r/g, '').split('\\n');
  const rows = [];
  let headers = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.includes('|')) continue;

    const cells = line
      .replace(/^\\|/, '')
      .replace(/\\|$/, '')
      .split('|')
      .map(v => v.trim());

    if (cells.length < 2) continue;
    if (cells.every(v => /^:?-{3,}:?$/.test(v))) continue;

    if (!headers) {
      headers = cells;
      continue;
    }

    const row = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] || '';
    });
    rows.push(row);
  }

  // Format Markdown alternatif:
  // KELAS: 1A
  // SPREADSHEET ID: xxxxx
  // SHEET: Rekap
  if (!rows.length) {
    let current = {};
    for (const rawLine of lines) {
      const m = rawLine.match(/^\\s*[-*]?\\s*(KELAS|SPREADSHEET(?:\\s+ID|_ID)?|SPREADSHEET|SHEET)\\s*:\\s*(.+?)\\s*$/i);
      if (!m) continue;
      current[m[1]] = m[2];
      if (current.KELAS && (current['SPREADSHEET ID'] || current.SPREADSHEET || current.SPREADSHEET_ID)) {
        rows.push({ ...current });
        current = {};
      }
    }
  }

  return rows;
}

function parseJsonMappings(text) {
  const parsed = JSON.parse(String(text || ''));
  const root = Array.isArray(parsed) ? { classes: parsed } : (parsed || {});
  const createMissingClasses = root.createMissingClasses === true;
  const source = Array.isArray(root.classes)
    ? root.classes
    : Object.entries(root.classes || root).filter(([key]) =>
        !['schoolYear', 'semester', 'createMissingClasses', 'metadata'].includes(key)
      ).map(([classId, value]) => ({
        classId,
        className: classId,
        ...(typeof value === 'string' ? { spreadsheetId: value } : (value || {}))
      }));

  const rows = source.map((item, index) => ({
    ...item,
    __jsonIndex: index,
    KELAS: item.classId ?? item.id ?? item.code ?? item.className ?? item.name ?? '',
    'SPREADSHEET ID': item.spreadsheetId ?? item.spreadsheetUrl ?? item.spreadsheet ?? item.url ?? '',
    SHEET: item.spreadsheetSheet ?? item.sheet ?? item.sheetName ?? 'Rekap',
    UNIT: item.unit ?? item.jenjang ?? '',
    JENJANG: item.jenjang ?? item.level ?? item.unit ?? ''
  }));

  return { rows, createMissingClasses };
}

function parseMarkdownRows(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const rows = [];
  let headers = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.includes('|')) continue;

    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(v => v.trim());

    if (cells.length < 2) continue;
    if (cells.every(v => /^:?-{3,}:?$/.test(v))) continue;

    if (!headers) {
      headers = cells;
      continue;
    }

    const row = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] || '';
    });
    rows.push(row);
  }

  if (!rows.length) {
    let current = {};
    for (const rawLine of lines) {
      const m = rawLine.match(/^\s*[-*]?\s*(KELAS|SPREADSHEET(?:\s+ID|_ID)?|SPREADSHEET|SHEET)\s*:\s*(.+?)\s*$/i);
      if (!m) continue;
      current[m[1]] = m[2];
      if (current.KELAS && (current['SPREADSHEET ID'] || current.SPREADSHEET || current.SPREADSHEET_ID)) {
        rows.push({ ...current });
        current = {};
      }
    }
  }

  return rows;
}

function extractRows(buffer, fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.json')) {
    return { workbook: null, ...parseJsonMappings(buffer.toString('utf8')) };
  }
  if (lower.endsWith('.md')) {
    return { workbook: null, rows: parseMarkdownRows(buffer.toString('utf8')), createMissingClasses: false };
  }
  throw new Error('Format harus .json atau .md.');
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

    if (!/\\.(md|json)$/.test(lowerName)) {
      return Response.json(
        { success: false, message: 'Format harus .json atau .md (Markdown).' },
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

    let extracted;
    try {
      extracted = extractRows(buffer, fileName);
    } catch (parseError) {
      return Response.json({ success: false, message: `Format mapping tidak valid: ${parseError.message}` }, { status: 400 });
    }
    const { rows, createMissingClasses } = extracted;

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

      let target =
        byId.get(norm(classValue)) ||
        byName.get(norm(classValue));

      if (!target && createMissingClasses) {
        const classId = clean(row.classId || row.id || classValue);
        const className = clean(row.className || row.name || classValue);
        if (!/^[A-Za-z0-9._-]+$/.test(classId)) {
          errors.push({
            row: index + 2,
            class: classValue,
            reason: 'ID kelas baru hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung.'
          });
          continue;
        }
        const newRef = db.collection('classes').doc(classId);
        const newData = {
          name: className,
          code: clean(row.code || classId),
          jenjang: clean(row.jenjang || row.level || row.unit || ''),
          unit: clean(row.unit || row.jenjang || ''),
          status: 'AKTIF',
          createdAt: new Date(),
          createdBy: auth.session.teacherId,
          updatedAt: new Date(),
          updatedBy: auth.session.teacherId
        };
        await newRef.set(newData, { merge: true });
        target = { id: classId, ...newData };
        byId.set(norm(classId), target);
        byName.set(norm(className), target);
      }

      if (!target) {
        skipped.push({
          row: index + 2,
          class: classValue,
          reason: 'Kelas tidak ditemukan di master kelas. Gunakan createMissingClasses: true untuk membuat kelas baru.'
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

      const wasExisting = byId.has(norm(target.id)) || byName.has(norm(target.name));
      const extra = {};
      if (Array.isArray(row.reportSheets)) extra.reportSheets = row.reportSheets.map(clean).filter(Boolean);
      if (clean(row.unit || row.jenjang || row.level)) {
        extra.unit = clean(row.unit || row.jenjang || row.level);
        extra.jenjang = clean(row.jenjang || row.level || row.unit);
      }
      await db.collection('classes').doc(target.id).set({
        spreadsheetId,
        spreadsheetSheet: sheetName,
        ...extra,
        updatedAt: new Date(),
        updatedBy: auth.session.teacherId
      }, { merge: true });

      updated.push({
        classId: target.id,
        className: target.name || target.id,
        spreadsheetId,
        sheetName,
        created: createMissingClasses && !wasExisting
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
      createdCount: updated.filter(x => x.created).length,
      mode: lowerName.endsWith('.json') ? 'json' : 'markdown',
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
