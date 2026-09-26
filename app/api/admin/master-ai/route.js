import { requireAdmin } from '@/lib/admin-auth';
import { readSheet, spreadsheetIdFromUrl } from '@/lib/google-sheets';
import { db } from '@/lib/firebase-admin';
import { groqHealth, parseMarkdownMappings, parseMasterRows, normalize } from '@/lib/groq-master-parser';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function stamp() { return new Date(); }
function cleanId(value, fallback) {
  const raw = String(value || '').trim();
  return raw || fallback;
}
function findByValue(items, value) {
  const n = normalize(value);
  if (!n) return null;
  return items.find(x => [x.id, x.code, x.name].some(v => normalize(v) === n)) || null;
}
async function writeChunks(collection, entries, version) {
  let written = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    entries.slice(i, i + 400).forEach(item => {
      batch.set(db.collection(collection).doc(String(item.id)), {
        ...item, syncVersion: version, updatedAt: stamp()
      }, { merge: true });
    });
    await batch.commit();
    written += Math.min(400, entries.length - i);
  }
  return written;
}
async function syncGuru(rows, version) {
  const entries = rows.map(row => {
    const id = cleanId(row.id, normalize(row.name).replace(/\s+/g, '_').toUpperCase());
    return {
      id, teacherId: id, teacherCode: row.code || id, name: row.name || row.id,
      fullName: row.name || row.id, unit: row.unit, status: row.status || 'AKTIF',
      source: 'google_sheet_ai'
    };
  }).filter(x => x.name || x.id);
  return writeChunks('teachers', entries, version);
}
async function syncMapel(rows, version) {
  const entries = rows.map(row => {
    const id = cleanId(row.id || row.code, normalize(row.name).replace(/\s+/g, '_').toUpperCase());
    return {
      id, code: row.code || id, name: row.name || row.id, unit: row.unit,
      status: row.status || 'AKTIF', source: 'google_sheet_ai'
    };
  }).filter(x => x.name || x.id);
  return writeChunks('subjects', entries, version);
}
async function syncWali(rows, version) {
  const [teachersSnap, classesSnap] = await Promise.all([
    db.collection('teachers').get(),
    db.collection('classes').get()
  ]);
  const teachers = teachersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const classes = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const resolved = [];
  const errors = [];
  for (const row of rows) {
    const teacher = findByValue(teachers, row.id) || findByValue(teachers, row.name);
    const cls = findByValue(classes, row.classValue);
    if (!teacher || !cls) {
      errors.push({
        row: row.rowNumber, guru: row.name || row.id, kelas: row.classValue,
        reason: !teacher ? 'Guru tidak ditemukan' : 'Kelas tidak ditemukan'
      });
    } else {
      resolved.push({ teacher, cls, row });
    }
  }
  if (errors.length) {
    throw new Error('Penugasan Wali Kelas tidak valid: ' + JSON.stringify(errors.slice(0, 20)));
  }

  const resetBatch = db.batch();
  teachers.filter(t => String(t.role || '').toLowerCase() === 'wali_kelas')
    .forEach(t => resetBatch.set(db.collection('teachers').doc(t.id), {
      role: 'guru', homeroomClassId: null, homeroomClassIds: [], waliKelasClassId: null,
      updatedAt: stamp(), syncVersion: version
    }, { merge: true }));
  await resetBatch.commit();

  const assignmentBatch = db.batch();
  for (const { teacher, cls, row } of resolved) {
    assignmentBatch.set(db.collection('teachers').doc(teacher.id), {
      role: 'wali_kelas',
      homeroomClassId: cls.id,
      homeroomClassIds: [cls.id],
      waliKelasClassId: cls.id,
      updatedAt: stamp(),
      syncVersion: version
    }, { merge: true });

    const assignmentId = 'WALI_' + teacher.id + '_' + cls.id;
    assignmentBatch.set(db.collection('teacher_assignments').doc(assignmentId), {
      id: assignmentId, teacherId: teacher.id, teacherName: teacher.name || row.name,
      unit: row.unit || cls.unit || cls.jenjang || '', classId: cls.id,
      className: cls.name || row.classValue, subjectId: '', subjectName: '',
      role: 'wali_kelas', isHomeroom: true, status: row.status || 'AKTIF',
      syncVersion: version, updatedAt: stamp()
    }, { merge: true });
  }
  await assignmentBatch.commit();
  return resolved.length;
}
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status });
  const health = await groqHealth();
  const state = await db.collection('master_sync').doc('state').get();
  return Response.json({
    success: true, ai: health,
    sync: state.exists ? state.data() : { status: 'NEVER', version: 0 }
  }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req) {
  const auth = await requireAdmin();
  if (!auth.ok) return Response.json({ success: false, message: auth.message }, { status: auth.status });

  const health = await groqHealth();
  if (!health.active) {
    return Response.json({
      success: false, aiActive: false,
      message: health.message || 'AI Groq tidak aktif. Upload dibatalkan.'
    }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!file || typeof file.text !== 'function') {
    return Response.json({
      success: false,
      message: 'Upload wajib berupa file Markdown (.md) mapping Spreadsheet.'
    }, { status: 400 });
  }
  const text = await file.text();
  const mappings = parseMarkdownMappings(text);
  if (!mappings.length) {
    return Response.json({
      success: false,
      message: 'Mapping Markdown tidak ditemukan. Gunakan kolom MASTER, SPREADSHEET ID/URL, SHEET.'
    }, { status: 400 });
  }

  // Tahap VALIDASI: semua sumber dibaca dan semua parsing AI selesai dahulu.
  // Jika salah satu gagal, fungsi berhenti sebelum menulis data master.
  const version = Date.now().toString();
  const parsed = [];
  for (const mapping of mappings) {
    const sheet = await readSheet(mapping.spreadsheetId, mapping.sheet, 'A:ZZ');
    if (!sheet.values.length) throw new Error('Sheet ' + mapping.sheet + ' kosong.');
    const headers = sheet.values[0] || [];
    const rows = sheet.values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[String(h || '').trim() || 'COL_' + i] = row[i] ?? '';
      });
      return obj;
    }).filter(r => Object.values(r).some(v => String(v).trim() !== ''));
    const result = await parseMasterRows(mapping.masterType, rows);
    parsed.push({
      ...mapping,
      result,
      sourceSpreadsheetId: spreadsheetIdFromUrl(mapping.spreadsheetId)
    });
  }

  // Semua AI parsing selesai. Baru publish perubahan ke Firestore.
  const counts = {};
  for (const p of parsed) {
    if (p.masterType === 'guru') counts.teachers = await syncGuru(p.result.rows, version);
    if (p.masterType === 'mapel') counts.subjects = await syncMapel(p.result.rows, version);
  }
  for (const p of parsed) {
    if (p.masterType === 'wali_kelas') counts.waliKelas = await syncWali(p.result.rows, version);
  }

  await db.collection('master_sync').doc('state').set({
    status: 'SYNCED',
    version,
    updatedAt: stamp(),
    updatedBy: auth.session.teacherId,
    aiModel: parsed.map(p => p.result.model),
    mappings: mappings.map(m => ({
      masterType: m.masterType,
      spreadsheetId: spreadsheetIdFromUrl(m.spreadsheetId),
      sheet: m.sheet
    })),
    counts
  });

  return Response.json({ success: true, aiActive: true, version, counts, mappings });
}
