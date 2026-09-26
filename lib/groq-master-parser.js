const GROQ_BASE = 'https://api.groq.com/openai/v1';

function getKeys() {
  return [...new Set([
    process.env.GROQ_API_KEY,
    ...(String(process.env.GROQ_API_KEYS || '').split(','))
  ].map(x => String(x || '').trim()).filter(Boolean))];
}

const preferredModels = () => [...new Set([
  ...(String(process.env.GROQ_MODELS || '').split(',')),
  process.env.GROQ_MODEL,
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile'
].map(x => String(x || '').trim()).filter(Boolean))];

async function listModels(key) {
  const res = await fetch(GROQ_BASE + '/models', {
    headers: { Authorization: 'Bearer ' + key },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error('Groq models endpoint gagal (' + res.status + ').');
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

async function chooseRuntime() {
  const keys = getKeys();
  if (!keys.length) throw new Error('AI Groq belum dikonfigurasi. Isi GROQ_API_KEY atau GROQ_API_KEYS di Vercel.');

  const failures = [];
  for (const key of keys) {
    try {
      const models = await listModels(key);
      const active = new Set(models.filter(m => m.active !== false).map(m => m.id));
      const model = preferredModels().find(m => active.has(m));
      if (model) return { key, model, availableModels: models };
      failures.push('Tidak ada model pilihan yang aktif untuk API key ini.');
    } catch (e) {
      failures.push(e.message);
    }
  }
  throw new Error('AI Groq tidak aktif/tersedia. Upload dibatalkan dan TIDAK ada data yang disinkronkan. ' + failures.join(' | '));
}

export async function groqHealth() {
  try {
    const runtime = await chooseRuntime();
    return {
      active: true,
      model: runtime.model,
      availableModels: runtime.availableModels.filter(m => m.active !== false).map(m => m.id).slice(0, 100)
    };
  } catch (e) {
    return { active: false, message: e.message, availableModels: [] };
  }
}

const schema = {
  type: 'object',
  properties: {
    masterType: { type: 'string', enum: ['guru', 'mapel', 'wali_kelas'] },
    idColumn: { type: 'string' },
    nameColumn: { type: 'string' },
    codeColumn: { type: 'string' },
    unitColumn: { type: 'string' },
    classColumn: { type: 'string' },
    subjectColumn: { type: 'string' },
    statusColumn: { type: 'string' },
    roleColumn: { type: 'string' },
    confidence: { type: 'number' },
    notes: { type: 'array', items: { type: 'string' } }
  },
  required: ['masterType','idColumn','nameColumn','codeColumn','unitColumn','classColumn','subjectColumn','statusColumn','roleColumn','confidence','notes'],
  additionalProperties: false
};

async function askGroq(masterType, headers, sampleRows) {
  const runtime = await chooseRuntime();
  const system = [
    'Anda adalah AI parser master data sekolah Pondok Modern Al-Ghozali.',
    'Petakan kolom spreadsheet ke struktur master yang diminta.',
    'Jangan membuat nama atau ID yang tidak ada di data.',
    'Jika kolom tidak ada, kembalikan string kosong.',
    'Guru: idColumn = ID/Kode Guru, nameColumn = Nama Guru.',
    'Mapel: idColumn/codeColumn = Kode Mapel, nameColumn = Nama Mapel/Mata Pelajaran.',
    'Wali Kelas: idColumn = ID/Kode Guru, nameColumn = Nama Guru, classColumn = Kelas, unitColumn = Unit/Jenjang.',
    'Jawab hanya JSON sesuai schema.'
  ].join(' ');
  const res = await fetch(GROQ_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + runtime.key },
    body: JSON.stringify({
      model: runtime.model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ masterType, headers, sampleRows }, null, 2) }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'master_column_mapping', strict: true, schema }
      }
    }),
    cache: 'no-store'
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('Groq parser gagal (' + res.status + '): ' + detail.slice(0, 400));
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq tidak mengembalikan hasil parser.');
  return { mapping: JSON.parse(content), model: runtime.model };
}

function normalize(v) {
  return String(v ?? '').toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function get(row, column) {
  if (!column) return '';
  return row[column] ?? '';
}

export async function parseMasterRows(masterType, rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Sheet master tidak berisi data.');
  const headers = Object.keys(rows[0] || {});
  if (!headers.length) throw new Error('Header sheet master tidak ditemukan.');
  const parsed = await askGroq(masterType, headers, rows.slice(0, 12));
  const m = parsed.mapping;
  if (m.confidence < 0.65) {
    throw new Error('AI Groq confidence ' + m.confidence + '. Upload dibatalkan untuk mencegah salah sinkron.');
  }
  const data = rows.map((row, index) => {
    const idRaw = get(row, m.idColumn) || get(row, m.codeColumn) || get(row, m.nameColumn);
    const nameRaw = get(row, m.nameColumn) || get(row, m.idColumn);
    const codeRaw = get(row, m.codeColumn) || get(row, m.idColumn);
    return {
      rowNumber: index + 2,
      id: String(idRaw || '').trim(),
      name: String(nameRaw || '').trim(),
      code: String(codeRaw || '').trim(),
      unit: String(get(row, m.unitColumn) || '').trim(),
      classValue: String(get(row, m.classColumn) || '').trim(),
      subjectValue: String(get(row, m.subjectColumn) || '').trim(),
      status: String(get(row, m.statusColumn) || 'AKTIF').trim().toUpperCase() || 'AKTIF',
      role: String(get(row, m.roleColumn) || '').trim()
    };
  }).filter(x => x.id || x.name || x.classValue);
  return { masterType, mapping: m, rows: data, model: parsed.model };
}

export function parseMarkdownMappings(markdown) {
  const lines = String(markdown || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const records = [];
  const table = lines.findIndex(x => /^\|.*\|/.test(x));
  if (table >= 0) {
    const headers = lines[table].split('|').map(x => x.trim()).filter(Boolean).map(x => normalize(x));
    for (let i = table + 1; i < lines.length; i++) {
      if (/^\|\s*:?-+/.test(lines[i])) continue;
      if (!/^\|.*\|/.test(lines[i])) break;
      const cells = lines[i].split('|').map(x => x.trim()).filter(Boolean);
      const obj = {};
      headers.forEach((h, idx) => obj[h] = cells[idx] || '');
      const type = obj.master || obj.tipe || obj.data || '';
      const url = obj['spreadsheet id/url'] || obj.spreadsheet || obj.url || obj['spreadsheet id'] || '';
      const sheet = obj.sheet || obj['nama sheet'] || '';
      if (type && url) {
        const masterType = normalizeMasterType(type);
        records.push({ masterType, spreadsheetId: url, sheet: sheet || defaultSheet(masterType) });
      }
    }
  }
  const blocks = String(markdown || '').split(/\n\s*\n/);
  for (const block of blocks) {
    const type = block.match(/(?:MASTER|TIPE|DATA)\s*:\s*(.+)/i)?.[1];
    const url = block.match(/(?:SPREADSHEET\s*ID\s*\/\s*URL|SPREADSHEET\s*ID|SPREADSHEET)\s*:\s*(.+)/i)?.[1];
    const sheet = block.match(/SHEET\s*:\s*(.+)/i)?.[1];
    if (type && url) {
      const masterType = normalizeMasterType(type);
      records.push({ masterType, spreadsheetId: url.trim(), sheet: (sheet || defaultSheet(masterType)).trim() });
    }
  }
  const unique = new Map();
  records.forEach(x => unique.set(x.masterType, x));
  return [...unique.values()];
}

function normalizeMasterType(v) {
  const n = normalize(v);
  if (n.includes('wali')) return 'wali_kelas';
  if (n.includes('mapel') || n.includes('mata pelajaran')) return 'mapel';
  if (n.includes('guru')) return 'guru';
  throw new Error('Jenis master tidak dikenali: ' + v);
}

function defaultSheet(type) {
  return type === 'guru' ? 'MASTER GURU' : type === 'mapel' ? 'MASTER MAPEL' : 'PENUGASAN WALI KELAS';
}

export { chooseRuntime, normalize };
