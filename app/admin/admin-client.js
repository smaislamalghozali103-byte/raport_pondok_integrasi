'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const tabs = [
  ['overview', 'Ringkasan'],
  ['classes', 'Kelas & Spreadsheet'],
  ['teachers', 'Guru'],
  ['subjects', 'Mapel'],
  ['students', 'Siswa'],
  ['monitoring', 'Monitoring']
];

export default function AdminClient() {
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({ classes: [], teachers: [], subjects: [], units: [], monitoring: [] });
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  // Admin password states
  const [authorized, setAuthorized] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authErr, setAuthErr] = useState('');

  useEffect(() => {
    checkAdminAuth();
  }, []);

  async function get(url) {
    const r = await fetch(url, { cache: 'no-store' });
    const d = await r.json();
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
        body: JSON.stringify({ password: adminPass })
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || 'Password salah.');
      setAuthorized(true);
      setAdminPass('');
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
      const [c, t, s, u, m] = await Promise.all([
        get('/api/admin/classes'),
        get('/api/admin/teachers'),
        get('/api/admin/subjects'),
        get('/api/admin/units'),
        get('/api/admin/monitoring')
      ]);
      setData({
        classes: c.classes || [],
        teachers: t.teachers || [],
        subjects: s.subjects || [],
        units: u.units || [],
        monitoring: m.items || m.batches || []
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
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
    students: students.length,
    batches: data.monitoring.length
  };

  if (loading && !authorized) {
    return <main style={S.page}><div style={S.card}>Memeriksa status admin…</div></main>;
  }

  // Tampilan Login Password Admin
  if (!authorized) {
    return (
      <main style={S.page}>
        <div style={{ maxWidth: 440, margin: '60px auto', background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 8px 30px rgba(0,0,0,.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Verifikasi Akses Admin</h1>
          <p style={{ color: '#667085', fontSize: 14, marginBottom: 20 }}>
            Masukkan Password Admin untuk mengelola koneksi Spreadsheet ID, Impor Rekap, dan Master Data.
          </p>
          {authErr && <div style={{ ...S.error, textAlign: 'left', marginBottom: 16 }}>{authErr}</div>}
          <form onSubmit={verifyAdminPass}>
            <input
              type="password"
              placeholder="Masukkan Password Admin…"
              value={adminPass}
              onChange={e => setAdminPass(e.target.value)}
              style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: 16, fontSize: 16 }}
              autoFocus
            />
            <button
              type="submit"
              disabled={authLoading || !adminPass}
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

        {tab === 'overview' && (
          <div style={S.grid}>
            {[
              ['Kelas', stats.classes],
              ['Terhubung Sheets', stats.connected],
              ['Guru', stats.teachers],
              ['Mapel', stats.subjects],
              ['Batch Nilai', stats.batches]
            ].map(([a, b]) => (
              <div style={S.card} key={a}>
                <div style={S.label}>{a}</div>
                <div style={S.big}>{b}</div>
              </div>
            ))}
            <div style={{ ...S.card, gridColumn: '1/-1' }}>
              <h2 style={S.h2}>Checklist Pengaturan Spreadsheet</h2>
              <p>1. Buka tab <b>Kelas & Spreadsheet</b> di atas.</p>
              <p>2. Masukkan URL atau Spreadsheet ID untuk setiap kelas.</p>
              <p>3. Klik <b>Tes</b> untuk memastikan Google Sheet dapat dibaca.</p>
              <p>4. Klik <b>Impor Rekap</b> untuk mengambil daftar siswa kelas tersebut ke database.</p>
            </div>
          </div>
        )}

        {tab === 'classes' && (
          <Section title="Kelas & Koneksi Google Spreadsheet">
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
          <Section title="Master Guru">
            <Toolbar search={search} setSearch={setSearch} />
            <table>
              <thead>
                <tr><th>ID</th><th>Nama</th><th>Unit</th><th>PIN</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered(data.teachers, ['name', 'unit', 'id']).map(x => (
                  <tr key={x.id}>
                    <td>{x.id}</td>
                    <td>{x.name || '-'}</td>
                    <td>{x.unit || '-'}</td>
                    <td>{x.pinConfigured ? 'Sudah dibuat' : 'Belum dibuat'}</td>
                    <td>{x.status || '-'}</td>
                    <td><button style={S.sm} onClick={() => toggle('teacher', x)}>Ubah Status</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
