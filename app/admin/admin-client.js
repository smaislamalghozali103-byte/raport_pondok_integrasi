'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import MasterDataAI from './master-data-ai';

const tabs = [
  ['overview', 'Ringkasan'],
  ['master_ai', '🤖 Master Data AI'],
  ['raport_asli', '📊 Bedah & Isi Raport Asli'],
  ['classes', 'Kelas & Spreadsheet'],
  ['assignments', 'Penugasan Guru'],
  ['teachers', 'Guru'],
  ['subjects', 'Mapel'],
  ['students', 'Siswa'],
  ['monitoring', 'Monitoring'],
  ['print', '🖨️ Cetak Raport']
];

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Server tidak mengirim respons JSON (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server mengirim respons yang bukan JSON (HTTP ${response.status}). ${text.slice(0, 180)}`);
  }
}

export default function AdminClient() {
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({ classes: [], teachers: [], subjects: [], units: [], monitoring: [], assignments: [] });
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  // States untuk Bedah & Isi Raport Asli
  const [templateFile, setTemplateFile] = useState(null);
  const [bedahResult, setBedahResult] = useState(null);
  const [bedahLoading, setBedahLoading] = useState(false);
  const [fillClassId, setFillClassId] = useState('');
  const [fillLoading, setFillLoading] = useState(false);
  const [fillResultMsg, setFillResultMsg] = useState('');
  const [spreadsheetUploadResult, setSpreadsheetUploadResult] = useState(null);
  const [jsonMappingFile, setJsonMappingFile] = useState(null);
  const [jsonMappingText, setJsonMappingText] = useState('');
  const [jsonMappingLoading, setJsonMappingLoading] = useState(false);


  // Admin PIN states
  const [authorized, setAuthorized] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [pinSetupCode, setPinSetupCode] = useState(null);

  useEffect(() => {
    checkAdminAuth();
  }, []);

  async function get(url) {
    const r = await fetch(url, { cache: 'no-store' });
    const d = await readJsonResponse(r);
    if (!r.ok) throw new Error(d.message || 'Gagal memuat data');
    return d;
  }

  async function checkAdminAuth() {
    try {
      setLoading(true);
      const authRes = await get('/api/admin/auth');
      if (authRes.authenticated) {
        setAuthorized(true);
        await loadData();
      } else {
        setAuthorized(false);
      }
    } catch {
      setAuthorized(false);
    } finally {
      setLoading(false);
    }
  }

  async function verifyAdminPass(e) {
    e.preventDefault();
    try {
      setAuthLoading(true);
      setAuthErr('');
      const r = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin })
      });
      const d = await readJsonResponse(r);
      if (!r.ok || !d.success) throw new Error(d.message || 'PIN administrator salah.');
      setAuthorized(true);
      setAdminPin('');
      await loadData();
    } catch (err) {
      setAuthErr(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const [c, t, s, u, m, a] = await Promise.all([
        get('/api/admin/classes'),
        get('/api/admin/teachers'),
        get('/api/admin/subjects'),
        get('/api/admin/units'),
        get('/api/admin/monitoring'),
        get('/api/admin/assignments').catch(() => ({ assignments: [] }))
      ]);
      setData({
        classes: c.classes || [],
        teachers: t.teachers || [],
        subjects: s.subjects || [],
        units: u.units || [],
        monitoring: m.items || m.batches || [],
        assignments: a.assignments || []
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function syncAllMasterData() {
    try {
      setBusy('syncMaster');
      setMsg('Sedang menghubungkan dan menyinkronkan seluruh data master...');
      setErr('');
      const r = await fetch('/api/admin/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const d = await readJsonResponse(r);
      if (!d.success) throw new Error(d.message);
      setMsg(`✓ ${d.message} (Unit: ${d.counts?.units}, Guru: ${d.counts?.teachers}, Mapel: ${d.counts?.subjects}, Kelas: ${d.counts?.classes}, Penugasan: ${d.counts?.assignments}, Siswa: ${d.counts?.students})`);
      await loadData();
    } catch (e) {
      setErr(e.message || 'Gagal sinkronisasi data master.');
    } finally {
      setBusy('');
    }
  }

  async function handleBedahTemplate(file) {
    if (!file) return;
    try {
      setBedahLoading(true);
      setErr('');
      setMsg('Sedang membedah struktur file template raport asli...');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/raport/bedah-template', {
        method: 'POST',
        body: formData,
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      setBedahResult(d);
      setMsg(`✓ Berhasil membedah file "${d.fileName}". Terdeteksi ${d.summary.totalSheets} sheet, baris header: ${d.summary.headerRow}, ${d.summary.totalStudentsDetected} santri, dan ${d.summary.detectedSubjectsCount} mapel.`);
    } catch (e) {
      setErr('Gagal membedah template: ' + (e.message || 'Error'));
    } finally {
      setBedahLoading(false);
    }
  }

  async function handleFillTemplate() {
    if (!templateFile) {
      setErr('Silakan pilih file template Excel terlebih dahulu.');
      return;
    }
    if (!fillClassId) {
      setErr('Silakan pilih Kelas yang ingin diisikan nilainya ke raport.');
      return;
    }
    try {
      setFillLoading(true);
      setFillResultMsg('');
      setErr('');
      setMsg('Sedang mengisi nilai ke dalam file raport asli secara non-destruktif (menjaga 100% desain, formula, dan border)...');

      const formData = new FormData();
      formData.append('file', templateFile);
      formData.append('classId', fillClassId);

      const res = await fetch('/api/raport/fill-template', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Gagal mengisi template.');
      }

      const updatedCells = res.headers.get('X-Updated-Cells') || '0';
      const sheetName = res.headers.get('X-Sheet-Name') || '';

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const targetClassObj = data.classes.find(c => c.id === fillClassId);
      const safeClassName = (targetClassObj?.name || 'Kelas').replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `Raport_Asli_Terisi_${safeClassName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      const successText = `✓ BERHASIL! ${updatedCells} sel nilai berhasil diisi ke sheet "${sheetName}". Desain asli, rumus formula, dan border 100% utuh. File terunduh otomatis.`;
      setFillResultMsg(successText);
      setMsg(successText);
    } catch (e) {
      setErr('Gagal mengisi raport: ' + (e.message || 'Error'));
    } finally {
      setFillLoading(false);
    }
  }


  async function submitJsonMapping(payload, sourceLabel = 'JSON') {
    try {
      setJsonMappingLoading(true);
      setSpreadsheetUploadResult(null);
      setErr('');
      setMsg(`Sedang memvalidasi dan menerapkan mapping ${sourceLabel}...`);

      let body;
      try {
        body = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch {
        throw new Error('JSON tidak valid. Periksa tanda kutip, koma, dan kurung.');
      }

      if (!body || typeof body !== 'object') {
        throw new Error('Format JSON harus berupa object atau array.');
      }

      const r = await fetch('/api/admin/classes/bulk-spreadsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await readJsonResponse(r);

      if (!r.ok || !d.success) {
        throw new Error(d.message || 'Gagal menerapkan mapping JSON.');
      }

      setSpreadsheetUploadResult(d);
      setMsg(d.message || 'Mapping JSON berhasil diterapkan.');
      setJsonMappingFile(null);
      await loadData();
    } catch (e) {
      setErr(e.message || 'Gagal menerapkan mapping JSON.');
    } finally {
      setJsonMappingLoading(false);
    }
  }

  async function handleJsonMappingFile() {
    if (!jsonMappingFile) {
      setErr('Silakan pilih file JSON terlebih dahulu.');
      return;
    }
    const text = await jsonMappingFile.text();
    await submitJsonMapping(text, `file ${jsonMappingFile.name}`);
  }

  function useJsonTemplate() {
    setJsonMappingText(JSON.stringify({
      schoolYear: '2026-2027',
      semester: 'GANJIL',
      createMissingClasses: true,
      classes: [
        {
          classId: '1A',
          className: '1A',
          unit: 'SMP',
          jenjang: 'SMP',
          spreadsheetId: 'ISI_SPREADSHEET_ID',
          spreadsheetSheet: 'Rekap',
          reportSheets: ['RAPOT', 'RAPORT']
        }
      ]
    }, null, 2));
  }

  async function downloadJsonTemplate() {
    const text = JSON.stringify({
      schoolYear: '2026-2027',
      semester: 'GANJIL',
      createMissingClasses: true,
      classes: [
        {
          classId: '1A',
          className: '1A',
          unit: 'SMP',
          jenjang: 'SMP',
          spreadsheetId: 'ISI_SPREADSHEET_ID',
          spreadsheetSheet: 'Rekap',
          reportSheets: ['RAPOT', 'RAPORT']
        }
      ]
    }, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-mapping-kelas-raport.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveClass(c) {
    try {
      setBusy(c.id);
      const r = await fetch('/api/admin/classes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: c.id,
          spreadsheetId: c.spreadsheetId,
          sheetName: c.spreadsheetSheet || 'Rekap'
        })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      setMsg('Pengaturan spreadsheet disimpan.');
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function testClass(c) {
    try {
      setBusy(c.id + 't');
      const r = await fetch('/api/admin/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: c.id,
          spreadsheetId: c.spreadsheetId,
          sheetName: c.spreadsheetSheet || 'Rekap'
        })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      setMsg(`Koneksi OK: ${d.rows} baris.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function importRekap(c) {
    try {
      setBusy(c.id + 'i');
      const r = await fetch('/api/admin/classes/import-rekap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: c.id,
          spreadsheetId: c.spreadsheetId,
          sheetName: c.spreadsheetSheet || 'Rekap'
        })
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      setMsg(`${c.name}: ${d.studentsImported} siswa diimpor, ${d.subjectsDetected} mapel terdeteksi.`);
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function toggle(kind, item) {
    try {
      setBusy(item.id);
      const endpoint = kind === 'teacher' ? '/api/admin/teachers' : kind === 'subject' ? '/api/admin/subjects' : '/api/admin/units';
      const body = kind === 'teacher' ? { teacherId: item.id, status: item.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF' } : kind === 'subject' ? { subjectId: item.id, status: item.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF' } : { unitId: item.id, status: item.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF' };
      const r = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.message);
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function updateTeacherRole(teacher, role, homeroomClassId = teacher.homeroomClassId || '') {
    try {
      setBusy(teacher.id);
      const r = await fetch('/api/admin/teachers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: teacher.id,
          role,
          homeroomClassId: role === 'wali_kelas' ? homeroomClassId : ''
        })
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || 'Gagal mengubah role guru.');
      setMsg('Role guru berhasil diperbarui.');
      await loadData();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  async function generateTeacherPinSetupCode(teacher) {
    try {
      setBusy('pin-' + teacher.id);
      setPinSetupCode(null);
      setErr('');

      const r = await fetch('/api/admin/teachers/pin-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: teacher.id })
      });
      const d = await r.json();

      if (!r.ok || !d.success) {
        throw new Error(d.message || 'Gagal membuat kode aktivasi PIN.');
      }

      setPinSetupCode(d);
      setMsg('Kode aktivasi PIN berhasil dibuat. Berikan kode tersebut kepada guru.');
    } catch (e) {
      setErr(e.message || 'Gagal membuat kode aktivasi PIN.');
    } finally {
      setBusy('');
    }
  }

  async function loadStudents(id) {
    setSelectedClass(id);
    try {
      const d = await get('/api/admin/students?classId=' + encodeURIComponent(id));
      setStudents(d.students || []);
    } catch (e) {
      setErr(e.message);
    }
  }

  const filtered = (arr, keys) => arr.filter(x => keys.some(k => String(x[k] ?? '').toLowerCase().includes(search.toLowerCase())));
  const stats = {
    classes: data.classes.length,
    connected: data.classes.filter(x => x.spreadsheetId).length,
    teachers: data.teachers.length,
    subjects: data.subjects.length,
    assignments: (data.assignments || []).length,
    students: students.length,
    batches: data.monitoring.length
  };

  if (loading && !authorized) {
    return <main style={S.page}><div style={S.card}>Memeriksa status admin…</div></main>;
  }

  // Tampilan Login PIN Administrator
  if (!authorized) {
    return (
      <main style={S.page}>
        <div style={{ maxWidth: 440, margin: '60px auto', background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Verifikasi Akses Admin</h1>
          <p style={{ color: '#667085', fontSize: 14, marginBottom: 20 }}>
            Masukkan PIN Administrator untuk mengelola koneksi Spreadsheet ID, Impor Rekap, dan Master Data.
          </p>
          {authErr && <div style={{ ...S.error, textAlign: 'left', marginBottom: 16 }}>{authErr}</div>}
          <form onSubmit={verifyAdminPass}>
            <input
              type="password"
              placeholder="Masukkan PIN Administrator…"
              value={adminPin}
              onChange={e => setAdminPin(e.target.value)}
              style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: 16, fontSize: 16 }}
              autoFocus
            />
            <button
              type="submit"
              disabled={authLoading || !adminPin}
              style={{ ...S.btn, width: '100%', padding: '12px', fontSize: 15, fontWeight: 700 }}
            >
              {authLoading ? 'MEMVERIFIKASI…' : '🔓 BUKA PANEL ADMIN'}
            </button>
          </form>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ background: 'transparent', border: 0, color: '#667085', marginTop: 18, cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}
          >
            ← Kembali ke Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <header style={S.header}>
          <div>
            <div style={S.kicker}>RAPORT INTEGRASI • ADMIN PANEL</div>
            <h1 style={S.h1}>Master & Monitoring</h1>
            <p style={S.muted}>Kelola master data, koneksi Google Sheets per kelas, impor siswa, dan pantau sinkronisasi.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={S.btn} onClick={() => router.push('/dashboard')}>← Dashboard Guru</button>
          </div>
        </header>

        {err && <div style={S.error} onClick={() => setErr('')}>{err}</div>}
        {msg && <div style={S.success} onClick={() => setMsg('')}>{msg}</div>}

        <nav style={S.tabs}>
          {tabs.map(([id, n]) => (
            <button key={id} style={tab === id ? S.tabActive : S.tab} onClick={() => { setTab(id); setSearch(''); }}>
              {n}
            </button>
          ))}
        </nav>

        {tab === 'master_ai' && (
          <MasterDataAI />
        )}

        {tab === 'print' && (
          <Section title="Ruang Cetak Raport">
            <div style={{ ...S.card, background: '#f0f7f2', border: '1px solid #dbe7df', boxShadow: 'none' }}>
              <h3 style={{ ...S.h2, marginTop: 0 }}>🖨️ Cetak Raport Asli</h3>
              <p style={{ ...S.muted, lineHeight: 1.6 }}>
                Buka ruang cetak khusus untuk memilih kelas dan siswa. Raport diekspor langsung dari
                Google Spreadsheet yang terhubung, sehingga tampilan raport asli tetap dipertahankan.
              </p>
              <button
                type="button"
                style={S.btn}
                onClick={() => router.push('/report-print')}
              >
                BUKA RUANG CETAK RAPORT
              </button>
            </div>
          </Section>
        )}

        {tab === 'overview' && (
          <div style={S.grid}>
            {[
              ['Kelas', stats.classes],
              ['Terhubung Sheets', stats.connected],
              ['Guru', stats.teachers],
              ['Mapel', stats.subjects],
              ['Penugasan Guru', stats.assignments],
              ['Batch Nilai', stats.batches]
            ].map(([a, b]) => (
              <div style={S.card} key={a}>
                <div style={S.label}>{a}</div>
                <div style={S.big}>{b}</div>
              </div>
            ))}
            <div style={{ ...S.card, gridColumn: '1/-1', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ ...S.h2, margin: '0 0 6px', color: '#166534' }}>Hubungkan & Sinkronkan Semua Data Master</h2>
                  <p style={{ margin: 0, color: '#15803d', fontSize: 14 }}>
                    Menghubungkan seluruh Unit ({data.units.length}), Guru ({stats.teachers}), Mapel ({stats.subjects}), Kelas ({stats.classes}), dan Penugasan Guru ({stats.assignments}) dari Master Excel ke database.
                  </p>
                </div>
                <button
                  style={{ ...S.btn, background: '#166534', padding: '12px 20px', fontSize: 14 }}
                  disabled={busy === 'syncMaster'}
                  onClick={syncAllMasterData}
                >
                  {busy === 'syncMaster' ? 'SEDANG MENYINKRONKAN…' : '🔄 SINKRONKAN SEMUA DATA MASTER'}
                </button>
              </div>
            </div>
            <div style={{ ...S.card, gridColumn: '1/-1' }}>
              <h2 style={S.h2}>Checklist Pengaturan Spreadsheet</h2>
              <p>1. Buka tab <b>Kelas & Spreadsheet</b> di atas.</p>
              <p>2. Masukkan URL atau Spreadsheet ID untuk setiap kelas.</p>
              <p>3. Klik <b>Tes</b> untuk memastikan Google Sheet dapat dibaca.</p>
              <p>4. Klik <b>Impor Rekap</b> untuk mengambil daftar siswa kelas tersebut ke database.</p>
            </div>
          </div>
        )}

        {tab === 'raport_asli' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ ...S.card, background: 'linear-gradient(135deg, #1e293b, #0f172a)', color: '#fff', border: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                    STANDAR FINAL • NON-DESTRUCTIVE FILLER
                  </span>
                  <h2 style={{ fontSize: 24, margin: '12px 0 8px', color: '#fff' }}>
                    Bedah Struktur & Pengisian Raport Asli (.xlsx)
                  </h2>
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, maxWidth: 820, lineHeight: 1.6 }}>
                    Engine ini membaca struktur file Excel raport asli Anda secara biner, memetakan letak baris siswa dan kolom mata pelajaran, serta menginjeksi nilai dari database <b>hanya pada sel-sel nilai</b>. Seluruh kop sekolah/pondok, logo, border tabel, warna sel, format font, dan formula rekap (SUM, AVERAGE, RANK, dsb.) <b>dijamin 100% utuh tanpa rusak</b>.
                  </p>
                </div>
              </div>
            </div>

            {/* Bagian 1: Upload & Bedah File Template */}
            <div style={S.card}>
              <h3 style={{ ...S.h2, margin: '0 0 10px' }}>1. Upload & Bedah Struktur File Raport Asli</h3>
              <p style={{ ...S.muted, margin: '0 0 16px', fontSize: 14 }}>
                Pilih file template raport asli yang telah Anda siapkan (format <code>.xlsx</code>).
              </p>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
                <input
                  type="file"
                  id="templateUploadInput"
                  accept=".xlsx,.xls"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setTemplateFile(f);
                      handleBedahTemplate(f);
                    }
                  }}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById('templateUploadInput')?.click()}
                  style={{ ...S.btn, background: '#2563eb', padding: '12px 20px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  📁 {templateFile ? 'GANTI FILE TEMPLATE EXCEL' : 'PILIH FILE RAPORT ASLI (.XLSX)'}
                </button>
                {templateFile && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                    File Terpilih: {templateFile.name} ({(templateFile.size / 1024).toFixed(1)} KB)
                  </span>
                )}
                {bedahLoading && (
                  <span style={{ fontSize: 14, color: '#2563eb', fontWeight: 600 }}>
                    ⏳ Sedang membedah struktur file...
                  </span>
                )}
              </div>

              {/* Hasil Bedah Struktur */}
              {bedahResult && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                    <h4 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
                      Hasil Pembedahan Struktur: <b>{bedahResult.fileName}</b>
                    </h4>
                    <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
                      ✓ Struktur Siap Diisi
                    </span>
                  </div>

                  {/* Ringkasan Matriks */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
                    <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>TOTAL SHEET</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                        {bedahResult.summary.totalSheets} Sheet
                      </div>
                      <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
                        {bedahResult.summary.sheetNames.join(', ')}
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>BARIS HEADER & SISWA</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                        Baris {bedahResult.summary.headerRow || '-'}
                      </div>
                      <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                        {bedahResult.summary.totalStudentsDetected} santri teridentifikasi
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>KOLOM MAPEL COCOK</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>
                        {bedahResult.summary.detectedSubjectsCount} Mapel
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        Cocok dengan Master Pondok
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>KEAMANAN FORMULA</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#166534' }}>
                        {bedahResult.summary.formulaCount} Formula
                      </div>
                      <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                        ✓ Terlindungi & Tidak Akan Rusak
                      </div>
                    </div>

                    <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>MERGED CELLS</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                        {bedahResult.summary.mergedCellsCount} Sel Gabungan
                      </div>
                      <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                        ✓ 100% Desain Asli Terjaga
                      </div>
                    </div>
                  </div>

                  {/* Detail Kolom Mata Pelajaran yang Terdeteksi */}
                  {bedahResult.primaryAnalysis?.subjectColumns?.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#0f172a' }}>
                        Daftar Kolom Mata Pelajaran yang Terdeteksi di Sheet "{bedahResult.summary.primarySheet}":
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {bedahResult.primaryAnalysis.subjectColumns.map((col, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#1e40af',
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                          >
                            Kolom <b>{col.colLetter}</b>: {col.rawHeader}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sample Santri yang Terdeteksi */}
                  {bedahResult.primaryAnalysis?.sampleStudents?.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#0f172a' }}>
                        Contoh Santri yang Terdeteksi (5 Baris Pertama):
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                              <th style={{ padding: '6px 10px', border: '1px solid #cbd5e1' }}>Baris Excel</th>
                              <th style={{ padding: '6px 10px', border: '1px solid #cbd5e1' }}>Nama Santri</th>
                              <th style={{ padding: '6px 10px', border: '1px solid #cbd5e1' }}>NISN</th>
                              <th style={{ padding: '6px 10px', border: '1px solid #cbd5e1' }}>NIS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bedahResult.primaryAnalysis.sampleStudents.map((st, i) => (
                              <tr key={i}>
                                <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1' }}>{st.row}</td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1', fontWeight: 600 }}>{st.name}</td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1' }}>{st.nisn || '-'}</td>
                                <td style={{ padding: '6px 10px', border: '1px solid #cbd5e1' }}>{st.nis || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bagian 2: Pengisian Nilai & Unduh Raport Terisi */}
            <div style={{ ...S.card, border: '2px solid #3b82f6' }}>
              <h3 style={{ ...S.h2, margin: '0 0 10px', color: '#1d4ed8' }}>
                2. Eksekusi Pengisian Nilai & Unduh Raport Terisi
              </h3>
              <p style={{ ...S.muted, margin: '0 0 16px', fontSize: 14 }}>
                Pilih Kelas target untuk mengambil seluruh nilai santri yang ada di database Firestore, lalu klik tombol untuk mengisinya ke template raport asli Anda.
              </p>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: 320 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    PILIH KELAS TARGET:
                  </label>
                  <select
                    value={fillClassId}
                    onChange={e => setFillClassId(e.target.value)}
                    style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {data.classes.map(c => (
                      <option key={c.id} value={c.id}>
                        [{c.jenjang || c.unit || 'UMUM'}] {c.name} {c.spreadsheetId ? '✓ (Sheets)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ alignSelf: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={fillLoading || !templateFile || !fillClassId}
                    onClick={handleFillTemplate}
                    style={{
                      ...S.btn,
                      background: fillLoading || !templateFile || !fillClassId ? '#94a3b8' : '#16a34a',
                      padding: '12px 24px',
                      fontSize: 15,
                      fontWeight: 800,
                    }}
                  >
                    {fillLoading ? '⏳ MENGISI RAPORT ASLI…' : '⚡ ISI NILAI SANTRI & UNDUH RAPORT (.XLSX)'}
                  </button>
                </div>
              </div>

              {fillResultMsg && (
                <div style={{ ...S.success, marginTop: 16, fontWeight: 600 }}>
                  {fillResultMsg}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'assignments' && (
          <Section title={`Penugasan Guru (${data.assignments?.length || 0} Data)`}>
            <Toolbar search={search} setSearch={setSearch} />
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Guru</th>
                    <th>Unit</th>
                    <th>Kelas</th>
                    <th>Mata Pelajaran</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered(data.assignments || [], ['teacherName', 'teacherId', 'className', 'subjectName', 'unit']).map((x, i) => (
                    <tr key={x.id || i}>
                      <td>{i + 1}</td>
                      <td><b>{x.teacherName}</b><br /><small style={{ color: '#888' }}>{x.teacherId}</small></td>
                      <td><span style={{ padding: '2px 8px', borderRadius: 6, background: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{x.unit}</span></td>
                      <td><b>{x.className}</b></td>
                      <td>{x.subjectName}</td>
                      <td><span style={{ color: x.status === 'AKTIF' ? '#166534' : '#888', fontWeight: 700 }}>{x.status || 'AKTIF'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {tab === 'classes' && (
          <Section title="Kelas & Koneksi Google Spreadsheet — JSON">
            <div style={{ ...S.card, background: '#eff6ff', border: '1px solid #bfdbfe', boxShadow: 'none', marginBottom: 18 }}>
              <h3 style={{ ...S.h2, margin: '0 0 8px', color: '#1e3a8a' }}>🔗 Koneksi Spreadsheet per Kelas — JSON</h3>
              <p style={{ ...S.muted, margin: '0 0 14px', fontSize: 13, lineHeight: 1.6 }}>
                Format koneksi sekarang menggunakan <b>JSON saja</b>. Tidak ada lagi upload Markdown.
                Admin dapat upload file <code>.json</code> atau langsung <b>copy/paste JSON</b>. Sistem akan mencocokkan kelas dengan Master Kelas dan menyimpan Spreadsheet ID/URL beserta nama sheet.
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <button type="button" style={S.sm} onClick={useJsonTemplate}>📝 ISI CONTOH JSON</button>
                <button type="button" style={S.sm} onClick={downloadJsonTemplate}>⬇️ DOWNLOAD TEMPLATE JSON</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(280px, 1fr)', gap: 14 }}>
                <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 12, padding: 14 }}>
                  <b style={{ fontSize: 14, color: '#1e3a8a' }}>📁 Upload JSON</b>
                  <p style={{ ...S.muted, fontSize: 12, margin: '6px 0 10px' }}>
                    Upload satu file JSON berisi seluruh kelas. Bisa menggunakan format lengkap <code>classes: []</code> atau format singkat <code>{'{ "1A": "SPREADSHEET_ID" }'}</code>.
                  </p>
                  <input
                    id="jsonMappingUploadInput"
                    type="file"
                    accept=".json,application/json"
                    onChange={e => setJsonMappingFile(e.target.files?.[0] || null)}
                  />
                  {jsonMappingFile && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                      File JSON: <b>{jsonMappingFile.name}</b> ({(jsonMappingFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                  <button
                    type="button"
                    style={{ ...S.btn, marginTop: 10, background: jsonMappingLoading ? '#94a3b8' : '#1d4ed8' }}
                    disabled={jsonMappingLoading || !jsonMappingFile}
                    onClick={handleJsonMappingFile}
                  >
                    {jsonMappingLoading ? '⏳ MEMPROSES…' : '📥 UPLOAD & TERAPKAN JSON'}
                  </button>
                </div>

                <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 12, padding: 14 }}>
                  <b style={{ fontSize: 14, color: '#1e3a8a' }}>📋 Copy / Paste JSON</b>
                  <p style={{ ...S.muted, fontSize: 12, margin: '6px 0 10px' }}>
                    Tempel seluruh mapping langsung ke kotak di bawah. Tidak perlu membuat file.
                  </p>
                  <textarea
                    value={jsonMappingText}
                    onChange={e => setJsonMappingText(e.target.value)}
                    placeholder={'{
  "createMissingClasses": true,
  "classes": [
    {
      "classId": "1A",
      "spreadsheetId": "SPREADSHEET_ID",
      "spreadsheetSheet": "Rekap"
    }
  ]
}'}
                    style={{ width: '100%', minHeight: 170, boxSizing: 'border-box', padding: 10, border: '1px solid #d0d5dd', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <button
                    type="button"
                    style={{ ...S.btn, marginTop: 10, background: jsonMappingLoading ? '#94a3b8' : '#166534' }}
                    disabled={jsonMappingLoading || !jsonMappingText.trim()}
                    onClick={() => submitJsonMapping(jsonMappingText, 'Copy/Paste')}
                  >
                    {jsonMappingLoading ? '⏳ MEMPROSES…' : '✅ VALIDASI & TERAPKAN JSON'}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#fff', fontSize: 12, color: '#475569' }}>
                <b>createMissingClasses: true</b> = jika classId belum ada, sistem membuat master kelas baru.
                Jika <b>false</b>, kelas yang belum terdaftar hanya dilaporkan sebagai dilewati.
              </div>

              {spreadsheetUploadResult && (
                <div style={{ marginTop: 14, background: '#fff', border: '1px solid #d1fae5', borderRadius: 10, padding: 12, fontSize: 13 }}>
                  <b style={{ color: '#166534' }}>✓ {spreadsheetUploadResult.updatedCount} kelas berhasil dihubungkan</b>
                  {spreadsheetUploadResult.skippedCount > 0 && (
                    <span style={{ marginLeft: 12, color: '#92400e' }}>⚠ {spreadsheetUploadResult.skippedCount} dilewati</span>
                  )}
                  {spreadsheetUploadResult.errorCount > 0 && (
                    <span style={{ marginLeft: 12, color: '#b42318' }}>✕ {spreadsheetUploadResult.errorCount} error</span>
                  )}
                  {(spreadsheetUploadResult.skipped?.length || spreadsheetUploadResult.errors?.length) > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Lihat detail mapping yang tidak terhubung</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, marginTop: 8 }}>
                        {JSON.stringify([...(spreadsheetUploadResult.skipped || []), ...(spreadsheetUploadResult.errors || [])], null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>

            <Toolbar search={search} setSearch={setSearch} />
            <table>
              <thead>
                <tr>
                  <th>Kelas</th>
                  <th>Jenjang</th>
                  <th>Spreadsheet (ID / URL)</th>
                  <th>Sheet</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered(data.classes, ['name', 'jenjang', 'id']).map(c => (
                  <tr key={c.id}>
                    <td><b>{c.name || c.id}</b><br /><small style={{ color: '#888' }}>{c.id}</small></td>
                    <td>{c.jenjang || c.unit || '-'}</td>
                    <td>
                      <input
                        style={S.cell}
                        value={c.spreadsheetId || ''}
                        onChange={e => setData(d => ({
                          ...d,
                          classes: d.classes.map(x => x.id === c.id ? { ...x, spreadsheetId: e.target.value } : x)
                        }))}
                        placeholder="Tempel ID atau Link URL Spreadsheet..."
                      />
                    </td>
                    <td>
                      <input
                        style={{ ...S.cell, width: 100 }}
                        value={c.spreadsheetSheet || 'Rekap'}
                        onChange={e => setData(d => ({
                          ...d,
                          classes: d.classes.map(x => x.id === c.id ? { ...x, spreadsheetSheet: e.target.value } : x)
                        }))}
                      />
                    </td>
                    <td>
                      <button style={S.sm} disabled={busy === c.id} onClick={() => saveClass(c)}>Simpan</button>{' '}
                      <button style={S.sm} disabled={!c.spreadsheetId || busy === c.id + 't'} onClick={() => testClass(c)}>Tes</button>{' '}
                      <button style={S.sm} disabled={!c.spreadsheetId || busy === c.id + 'i'} onClick={() => importRekap(c)}>Impor Rekap</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {tab === 'teachers' && (
          <Section title="Master Guru & Role">
            {pinSetupCode && (
              <div style={{ ...S.card, background: '#fffbeb', border: '1px solid #f59e0b', boxShadow: 'none', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#92400e' }}>🔑 Kode Aktivasi PIN Guru</div>
                    <div style={{ marginTop: 6, fontSize: 13, color: '#78350f' }}>
                      {pinSetupCode.teacherName} • berlaku sampai {new Date(pinSetupCode.expiresAt).toLocaleString('id-ID')}
                    </div>
                    <code style={{ display: 'inline-block', marginTop: 10, padding: '10px 14px', background: '#fff', border: '1px dashed #d97706', borderRadius: 8, fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>
                      {pinSetupCode.setupToken}
                    </code>
                    <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
                      Kode hanya ditampilkan sekarang. Jangan dipasang di GitHub, screenshot publik, atau chat grup terbuka.
                    </div>
                  </div>
                  <button
                    style={S.sm}
                    onClick={() => navigator.clipboard?.writeText(pinSetupCode.setupToken)}
                  >
                    Salin Kode
                  </button>
                </div>
              </div>
            )}
            <Toolbar search={search} setSearch={setSearch} />
            <p style={{ ...S.muted, fontSize: 13 }}>
              <b>Guru</b> hanya melihat kelas/mapel yang ditugaskan. <b>Wali Kelas</b> juga memiliki monitoring kelas binaan.
              <br />Admin tetap menggunakan PIN administrator terpisah di <code>/admin</code>.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>ID</th><th>Nama</th><th>Unit</th><th>Role</th><th>Kelas Binaan</th><th>PIN</th><th>Status</th><th>Aksi</th></tr>
                </thead>
                <tbody>
                  {filtered(data.teachers, ['name', 'unit', 'id', 'role']).map(x => (
                    <tr key={x.id}>
                      <td>{x.id}</td>
                      <td>{x.name || '-'}</td>
                      <td>{x.unit || '-'}</td>
                      <td>
                        <select
                          value={x.role === 'wali_kelas' ? 'wali_kelas' : 'guru'}
                          onChange={e => {
                            const role = e.target.value;
                            setData(d => ({
                              ...d,
                              teachers: d.teachers.map(t => t.id === x.id ? { ...t, role } : t)
                            }));
                          }}
                          style={S.sm}
                        >
                          <option value="guru">Guru</option>
                          <option value="wali_kelas">Wali Kelas</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={x.homeroomClassId || ''}
                          disabled={x.role !== 'wali_kelas'}
                          onChange={e => setData(d => ({
                            ...d,
                            teachers: d.teachers.map(t => t.id === x.id ? { ...t, homeroomClassId: e.target.value } : t)
                          }))}
                          style={{ ...S.sm, minWidth: 180 }}
                        >
                          <option value="">-- Pilih kelas --</option>
                          {data.classes.map(cls => (
                            <option key={cls.id} value={cls.id}>{cls.name} ({cls.jenjang || cls.unit || '-'})</option>
                          ))}
                        </select>
                      </td>
                      <td>{x.pinConfigured ? 'Sudah dibuat' : 'Belum dibuat'}</td>
                      <td>{x.status || '-'}</td>
                      <td>
                        <button
                          style={S.sm}
                          disabled={busy === x.id}
                          onClick={() => updateTeacherRole(x, x.role === 'wali_kelas' ? 'wali_kelas' : 'guru', x.homeroomClassId || '')}
                        >
                          {busy === x.id ? 'Menyimpan…' : 'Simpan Role'}
                        </button>{' '}
                        {!x.pinConfigured && (
                          <button
                            style={S.sm}
                            disabled={busy === 'pin-' + x.id}
                            onClick={() => generateTeacherPinSetupCode(x)}
                          >
                            {busy === 'pin-' + x.id ? 'Membuat…' : 'Buat Kode PIN'}
                          </button>
                        )}{' '}
                        <button style={S.sm} onClick={() => toggle('teacher', x)}>Ubah Status</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {tab === 'subjects' && (
          <Section title="Master Mata Pelajaran">
            <Toolbar search={search} setSearch={setSearch} />
            <table>
              <thead>
                <tr><th>Kode</th><th>Mapel</th><th>Unit</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered(data.subjects, ['name', 'unit', 'code', 'id']).map(x => (
                  <tr key={x.id}>
                    <td>{x.code || x.id}</td>
                    <td>{x.name || '-'}</td>
                    <td>{x.unit || '-'}</td>
                    <td>{x.status || '-'}</td>
                    <td><button style={S.sm} onClick={() => toggle('subject', x)}>Ubah Status</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {tab === 'students' && (
          <Section title="Daftar Siswa">
            <div style={S.toolbar}>
              <select style={S.input} value={selectedClass} onChange={e => loadStudents(e.target.value)}>
                <option value="">Pilih kelas…</option>
                {data.classes.map(c => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
              <span>{students.length} siswa</span>
            </div>
            {selectedClass && (
              <table>
                <thead>
                  <tr><th>No</th><th>NISN</th><th>NIS</th><th>Nama</th><th>Baris Rekap</th></tr>
                </thead>
                <tbody>
                  {students.map((x, i) => (
                    <tr key={x.id}>
                      <td>{i + 1}</td>
                      <td>{x.nisn || '-'}</td>
                      <td>{x.nis || '-'}</td>
                      <td>{x.name || x.fullName || '-'}</td>
                      <td>{x.rekapRow ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        )}

        {tab === 'monitoring' && (
          <Section title="Monitoring Batch Nilai">
            <Toolbar search={search} setSearch={setSearch} />
            <table>
              <thead>
                <tr><th>Waktu</th><th>Guru</th><th>Kelas</th><th>Mapel</th><th>Jumlah</th><th>Status</th><th>Arsip</th></tr>
              </thead>
              <tbody>
                {filtered(data.monitoring, ['teacherName', 'className', 'subjectName', 'status', 'syncStatus']).map(x => (
                  <tr key={x.id}>
                    <td>{x.createdAt ? new Date(x.createdAt._seconds ? x.createdAt._seconds * 1000 : x.createdAt).toLocaleString('id-ID') : '-'}</td>
                    <td>{x.teacherName}</td>
                    <td>{x.className}</td>
                    <td>{x.subjectName}</td>
                    <td>{x.matchedRows ?? x.totalStudents ?? '-'}</td>
                    <td>{x.syncStatus || x.status || '-'}</td>
                    <td>{x.archiveStatus || '-'} {x.archiveUrl && <a href={x.archiveUrl} target="_blank" rel="noreferrer">Buka</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }) {
  return <div style={S.card}><h2 style={S.h2}>{title}</h2>{children}</div>;
}

function Toolbar({ search, setSearch }) {
  return (
    <div style={S.toolbar}>
      <input style={S.input} placeholder="Cari data…" value={search} onChange={e => setSearch(e.target.value)} />
    </div>
  );
}

const S = {
  page: { minHeight: '100vh', background: '#f4f6f8', padding: '28px 18px', fontFamily: 'Arial,sans-serif' },
  wrap: { maxWidth: 1400, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 18 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 2, opacity: 0.6 },
  h1: { margin: '6px 0', fontSize: 30 },
  h2: { margin: '0 0 15px', fontSize: 20 },
  muted: { color: '#667085' },
  card: { background: '#fff', border: '1px solid #e4e7ec', borderRadius: 16, padding: 18, boxShadow: '0 4px 18px rgba(0,0,0,.05)', marginBottom: 18 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 },
  big: { fontSize: 32, fontWeight: 800, marginTop: 8 },
  label: { color: '#667085', fontSize: 13 },
  tabs: { display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 },
  tab: { padding: '10px 13px', border: '1px solid #d0d5dd', borderRadius: 10, background: '#fff', cursor: 'pointer' },
  tabActive: { padding: '10px 13px', border: '1px solid #111827', borderRadius: 10, background: '#111827', color: '#fff', cursor: 'pointer' },
  btn: { padding: '10px 14px', border: 0, borderRadius: 10, background: '#111827', color: '#fff', cursor: 'pointer', fontWeight: 700 },
  sm: { padding: '7px 11px', border: '1px solid #d0d5dd', borderRadius: 8, background: '#fff', cursor: 'pointer', marginBottom: 4, fontWeight: 700 },
  input: { padding: '10px 12px', border: '1px solid #d0d5dd', borderRadius: 9, minWidth: 280 },
  cell: { width: 330, maxWidth: '28vw', padding: '8px 10px', border: '1px solid #d0d5dd', borderRadius: 8 },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 },
  error: { padding: 12, marginBottom: 12, borderRadius: 10, background: '#fef3f2', color: '#b42318' },
  success: { padding: 12, marginBottom: 12, borderRadius: 10, background: '#ecfdf3', color: '#027a48' }
};
