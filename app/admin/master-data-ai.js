'use client';

import { useEffect, useRef, useState } from 'react';

export default function MasterDataAI() {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const r = await fetch('/api/admin/master-ai', { cache: 'no-store' });
      const d = await r.json();
      if (r.ok) setState(d);
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function upload() {
    if (!file) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/admin/master-ai', { method: 'POST', body: form });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || 'Sinkronisasi gagal.');
      setMessage('✓ AI berhasil memparse seluruh master dan database sudah diperbarui.');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      setError(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const aiActive = state?.ai?.active === true;

  return (
    <section style={{ background: '#fff', border: '1px solid #e4e7ec', borderRadius: 16, padding: 18, boxShadow: '0 4px 18px rgba(0,0,0,.05)', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.4, color: '#667085' }}>MASTER DATA • AI SYNC</div>
          <h2 style={{ margin: '6px 0' }}>🤖 Upload Guru, Mata Pelajaran & Penugasan Wali Kelas</h2>
          <p style={{ margin: 0, color: '#667085', lineHeight: 1.55, maxWidth: 900 }}>
            Satu file Markdown berisi ID/URL Spreadsheet resmi. Sistem mengambil data langsung dari Google Sheet,
            Groq AI memetakan kolom secara dinamis, lalu Firestore diperbarui sebagai sumber data dashboard guru.
          </p>
        </div>
        <div style={{
          padding: '8px 12px', borderRadius: 999, fontWeight: 800, fontSize: 12,
          background: aiActive ? '#ecfdf3' : '#fef2f2',
          color: aiActive ? '#166534' : '#b42318'
        }}>
          {aiActive ? '● AI GROQ AKTIF' : '● AI GROQ TIDAK AKTIF'}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: '#f8fafc', border: '1px solid #d0d5dd', borderRadius: 12, padding: 14 }}>
          <b>Format Markdown</b>
          <pre style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.5 }}>{'| MASTER | SPREADSHEET ID/URL | SHEET |\\n|---|---|---|\\n| GURU | https://docs.google.com/spreadsheets/d/ID/edit | MASTER GURU |\\n| MAPEL | https://docs.google.com/spreadsheets/d/ID/edit | MASTER MAPEL |\\n| WALI KELAS | https://docs.google.com/spreadsheets/d/ID/edit | PENUGASAN WALI KELAS |'}</pre>
          <a href="/template-master-data-ai.md" download style={{ color: '#176b3a', fontWeight: 800, fontSize: 13 }}>
            📥 Unduh template Markdown
          </a>
        </div>

        <div style={{ border: '1px dashed #98a2b3', borderRadius: 12, padding: 14, background: '#fff' }}>
          <b>Upload & Sinkronisasi</b>
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown"
            onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ display: 'block', marginTop: 12 }}
          />
          {file && <div style={{ marginTop: 8, fontSize: 13 }}>File: <b>{file.name}</b></div>}
          <button
            type="button"
            disabled={!file || busy || !aiActive}
            onClick={upload}
            style={{ marginTop: 12, padding: '11px 16px', border: 0, borderRadius: 10, background: (!file || busy || !aiActive) ? '#98a2b3' : '#176b3a', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
          >
            {busy ? '⏳ AI MEMPARSE & SINKRON...' : '🚀 UPLOAD • PARSE AI • SINKRONKAN'}
          </button>
          <div style={{ marginTop: 10, fontSize: 12, color: '#667085' }}>
            Jika AI Groq tidak aktif, tombol terkunci dan server juga menolak upload. Tidak ada perubahan database.
          </div>
        </div>
      </div>

      {(message || error) && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: error ? '#fef2f2' : '#ecfdf3', color: error ? '#b42318' : '#166534' }}>
          {error || message}
        </div>
      )}

      {state?.sync && (
        <div style={{ marginTop: 14, fontSize: 12, color: '#667085' }}>
          Sinkron terakhir: <b>{state.sync.updatedAt ? new Date(state.sync.updatedAt._seconds ? state.sync.updatedAt._seconds * 1000 : state.sync.updatedAt).toLocaleString('id-ID') : '-'}</b>
          {' · '}Versi: <b>{state.sync.version || '-'}</b>
          {' · '}Status: <b>{state.sync.status || '-'}</b>
          {state.sync.aiModel?.length ? <>{' · '}Model: <b>{state.sync.aiModel.join(', ')}</b></> : null}
        </div>
      )}
    </section>
  );
}
