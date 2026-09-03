"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardClient() {
  const router = useRouter();
  const fileRef = useRef(null);

  const [teacher, setTeacher] = useState(null);
  const [units, setUnits] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);

  const [jenjang, setJenjang] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [grades, setGrades] = useState({});

  const [loading, setLoading] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [excelPreview, setExcelPreview] = useState(null);
  const [lastBatchId, setLastBatchId] = useState("");
  const [syncing, setSyncing] = useState(false);

  const selectedClass = useMemo(
    () => classes.find(c => c.id === classId),
    [classes, classId]
  );
  const selectedSubject = useMemo(
    () => subjects.find(s => s.id === subjectId),
    [subjects, subjectId]
  );

  useEffect(() => {
    loadInitial();
  }, []);

  async function loadInitial() {
    try {
      setLoading(true);
      const [meRes, unitsRes] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store", credentials: "include" }),
        fetch("/api/master/units", { cache: "no-store", credentials: "include" }),
      ]);
      const me = await meRes.json();
      const unitsData = await unitsRes.json();

      if (!me.authenticated) {
        window.location.href = "/login";
        return;
      }
      if (!unitsData.success) throw new Error(unitsData.message);

      setTeacher(me.teacher);
      setUnits(unitsData.units || []);
    } catch (err) {
      setError(err.message || "Gagal memuat dashboard.");
    } finally {
      setLoading(false);
    }
  }

  async function changeJenjang(value) {
    setJenjang(value);
    setClassId("");
    setSubjectId("");
    setClasses([]);
    setSubjects([]);
    setStudents([]);
    setGrades({});
    setExcelPreview(null);
    setError("");
    setMessage("");

    if (!value) return;

    try {
      setLoadingClasses(true);
      const res = await fetch(`/api/master/classes?jenjang=${encodeURIComponent(value)}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setClasses(data.classes || []);
    } catch (err) {
      setError(err.message || "Gagal memuat kelas.");
    } finally {
      setLoadingClasses(false);
    }
  }

  async function changeClass(value) {
    setClassId(value);
    setSubjectId("");
    setSubjects([]);
    setStudents([]);
    setGrades({});
    setExcelPreview(null);
    setError("");
    setMessage("");

    if (!value) return;

    try {
      setLoadingSubjects(true);
      const res = await fetch(
        `/api/master/subjects?jenjang=${encodeURIComponent(jenjang)}&classId=${encodeURIComponent(value)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSubjects(data.subjects || []);
    } catch (err) {
      setError(err.message || "Gagal memuat mata pelajaran.");
    } finally {
      setLoadingSubjects(false);
    }
  }

  async function showStudents(overrideSubjectId) {
    const activeSubjectId = overrideSubjectId || subjectId;
    if (!jenjang || !classId || !activeSubjectId) {
      setError("Pilih jenjang, kelas, dan mata pelajaran terlebih dahulu.");
      return;
    }

    try {
      setLoadingStudents(true);
      setError("");
      setMessage("");

      const res = await fetch(`/api/master/students?classId=${encodeURIComponent(classId)}`, { cache: "no-store" });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const list = data.students || [];
      setStudents(list);

      if (list.length === 0) {
        setMessage("ℹ️ Belum ada data santri/siswa di kelas ini. Pastikan Admin sudah memasukkan Spreadsheet ID dan klik 'Impor Rekap' di menu Admin.");
      } else {
        const initial = {};
        list.forEach(s => { initial[s.id] = ""; });
        setGrades(initial);
        setExcelPreview(null);
      }
    } catch (err) {
      setError(err.message || "Gagal memuat siswa.");
    } finally {
      setLoadingStudents(false);
    }
  }

  async function handleSubjectChange(value) {
    setSubjectId(value);
    setStudents([]);
    setGrades({});
    setExcelPreview(null);
    if (value) {
      await showStudents(value);
    }
  }

  function updateGrade(studentId, value) {
    if (value !== "" && (!/^\d{0,3}(\.\d{0,2})?$/.test(value) || Number(value) > 100)) return;
    setGrades(prev => ({ ...prev, [studentId]: value }));
  }

  function normalize(v) {
    return String(v ?? "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findColumn(headers, candidates) {
    for (const candidate of candidates) {
      const n = normalize(candidate);
      const exact = headers.find(h => normalize(h) === n);
      if (exact) return exact;
    }
    return headers.find(h => candidates.some(c => normalize(h).includes(normalize(c))));
  }

  async function downloadTemplate() {
    try {
      const XLSX = await import("xlsx");

      const rows = students.map((s, idx) => ({
        "No": idx + 1,
        "NISN": s.nisn || s.nis || "",
        "Nama Siswa": s.name || s.fullName || "",
        "Nilai": grades[s.id] !== undefined && grades[s.id] !== "" ? Number(grades[s.id]) : ""
      }));

      const dataToExport = rows.length > 0 ? rows : [
        { "No": 1, "NISN": "0012345678", "Nama Siswa": "Contoh Nama Santri 1", "Nilai": 85 },
        { "No": 2, "NISN": "0012345679", "Nama Siswa": "Contoh Nama Santri 2", "Nilai": 90 }
      ];

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);

      worksheet["!cols"] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 35 },
        { wch: 12 }
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template Nilai");

      const className = selectedClass?.name ? selectedClass.name.replace(/[^a-zA-Z0-9_-]/g, "_") : "Kelas";
      const subjName = selectedSubject?.name ? selectedSubject.name.replace(/[^a-zA-Z0-9_-]/g, "_") : "Mapel";
      const fileName = `Template_Nilai_${className}_${subjName}.xlsx`;

      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      setError("Gagal mengunduh template Excel: " + err.message);
    }
  }

  async function handleExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setMessage("");

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) throw new Error("File Excel tidak berisi data.");

      const headers = Object.keys(rows[0]);
      const nisnCol = findColumn(headers, ["NISN", "NIS"]);
      const nameCol = findColumn(headers, ["Nama Siswa", "Nama", "Siswa"]);
      const gradeCol = findColumn(headers, ["Nilai", "Nilai Akhir", "Score"]);

      if (!nameCol && !nisnCol) {
        throw new Error("Kolom Nama Siswa atau NISN tidak ditemukan.");
      }
      if (!gradeCol) {
        throw new Error("Kolom Nilai tidak ditemukan.");
      }

      const mapped = [];
      const unmatched = [];

      for (const row of rows) {
        const nisn = normalize(nisnCol ? row[nisnCol] : "");
        const name = normalize(nameCol ? row[nameCol] : "");
        const raw = row[gradeCol];
        const value = raw === "" || raw === null || raw === undefined ? "" : Number(raw);

        if (value !== "" && (!Number.isFinite(value) || value < 0 || value > 100)) {
          throw new Error(`Nilai "${raw}" tidak valid. Nilai harus 0-100.`);
        }

        let student = students.find(s => {
          const sn = normalize(s.nisn || s.nis || "");
          const ss = normalize(s.name || "");
          return (nisn && sn && nisn === sn) || (name && ss && name === ss);
        });

        if (!student) {
          unmatched.push({
            nisn: nisnCol ? row[nisnCol] : "",
            name: nameCol ? row[nameCol] : "",
            value: raw,
          });
          continue;
        }

        mapped.push({
          studentId: student.id,
          studentName: student.name,
          nisn: student.nisn || student.nis || "",
          value,
        });
      }

      setExcelPreview({
        fileName: file.name,
        rows: mapped,
        unmatched,
      });

      const next = { ...grades };
      mapped.forEach(item => { next[item.studentId] = item.value; });
      setGrades(next);

      if (unmatched.length) {
        setError(`${unmatched.length} baris Excel tidak cocok dengan siswa kelas ini. Data yang cocok tetap dimuat untuk preview.`);
      } else {
        setMessage(`${mapped.length} nilai berhasil dibaca dari Excel.`);
      }
    } catch (err) {
      setError(err.message || "Gagal membaca Excel.");
      setExcelPreview(null);
    } finally {
      event.target.value = "";
    }
  }

  function filledGrades() {
    return students
      .map(s => ({
        studentId: s.id,
        value: grades[s.id] === "" || grades[s.id] === undefined ? null : Number(grades[s.id]),
      }))
      .filter(x => x.value !== null);
  }

  async function saveGrades() {
    const payloadGrades = filledGrades();

    if (!payloadGrades.length) {
      setError("Belum ada nilai yang diisi.");
      return;
    }

    if (payloadGrades.some(x => !Number.isFinite(x.value) || x.value < 0 || x.value > 100)) {
      setError("Ada nilai yang tidak valid. Nilai harus 0-100.");
      return null;
    }

    if (!skipConfirm && !window.confirm(`Simpan ${payloadGrades.length} nilai untuk ${selectedSubject?.name} kelas ${selectedClass?.name}?`)) {
      return null;
    }

    try {
      setSaving(true);
      setError("");
      setMessage("");

      const res = await fetch("/api/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          className: selectedClass?.name,
          subjectId,
          subjectName: selectedSubject?.name,
          inputMethod: excelPreview ? "excel" : "manual",
          grades: payloadGrades,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      setLastBatchId(data.batchId);
      setMessage(`✓ ${data.saved} nilai berhasil disimpan di database.`);
      setExcelPreview(null);
      return data.batchId;
    } catch (err) {
      setError(err.message || "Gagal menyimpan nilai.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function syncLastBatch() {
    if (filledGrades().length === 0) {
      setError("Belum ada nilai yang diisi.");
      return;
    }

    let activeBatch = lastBatchId;

    // Jika belum pernah disimpan manual, simpan otomatis dulu ke Firestore
    if (!activeBatch) {
      activeBatch = await saveGrades(true);
      if (!activeBatch) return;
    }

    try {
      setSyncing(true);
      setError("");
      setMessage("Sedang menyinkronkan nilai ke Google Sheets Rekap...");

      const res = await fetch("/api/sync/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: activeBatch }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      if (data.unmatched) {
        setMessage(`✓ Sinkronisasi selesai. ${data.matched} siswa masuk ke Google Sheets Rekap, ${data.unmatched} tidak cocok${data.archive ? ` · Arsip Drive: ${data.archive.archiveName}` : data.archiveError ? ` · Arsip Drive gagal: ${data.archiveError}` : ''}.`);
      } else {
        setMessage(`✓ Berhasil! ${data.updatedCells || data.matched || 'Semua'} nilai santri berhasil masuk ke Google Sheets Rekap${data.archive ? ` · Arsip Drive: ${data.archive.archiveName}` : ''}.`);
      }
    } catch (err) {
      setError(err.message || "Gagal sinkronisasi ke Google Sheets.");
    } finally {
      setSyncing(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (loading) return <main style={styles.page}><div style={styles.card}>Memuat data...</div></main>;

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <header style={styles.header}>
          <img src="/assets/logo-ypi-al-ghozali.png" alt="Logo YPI Al-Ghozali" style={styles.logo} />
          <div>
            <h1 style={styles.title}>RAPORT INTEGRASI</h1>
            <p style={styles.school}>Pondok Modern Al-Ghozali</p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => router.push("/admin")}
              style={{ ...styles.logout, background: "#176b3a", color: "#fff", display: "flex", alignItems: "center", gap: 6 }}
              title="Akses menu Admin untuk mengatur Spreadsheet ID per kelas"
            >
              ⚙️ KELOLA SPREADSHEET (ADMIN)
            </button>
            <button onClick={logout} style={styles.logout}>KELUAR</button>
          </div>
        </header>

        <div style={styles.teacherBox}>
          <strong>{teacher?.teacherName}</strong>
          <span>Kode Guru: {teacher?.teacherCode}</span>
        </div>

        <h2 style={styles.sectionTitle}>INPUT NILAI RAPORT</h2>

        <div style={{ background: "#e8f4ec", border: "1px solid #b7e1c6", padding: "12px 16px", borderRadius: 10, color: "#145a32", fontSize: 14, margin: "14px 0" }}>
          💡 <strong>Petunjuk:</strong> Pilih <b>Jenjang</b>, <b>Kelas</b>, dan <b>Mata Pelajaran</b> di bawah ini. Tabel daftar siswa dan kolom input nilai akan otomatis muncul.
        </div>

        <label style={styles.label}>1. Jenjang (Unit)</label>
        <select value={jenjang} onChange={e => changeJenjang(e.target.value)} style={styles.input}>
          <option value="">-- Pilih Jenjang --</option>
          {units.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
        </select>

        <label style={styles.label}>2. Kelas</label>
        <select value={classId} onChange={e => changeClass(e.target.value)} style={styles.input} disabled={!jenjang || loadingClasses}>
          <option value="">{loadingClasses ? "Memuat kelas..." : "-- Pilih Kelas --"}</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <label style={styles.label}>3. Mata Pelajaran</label>
        <select value={subjectId} onChange={e => handleSubjectChange(e.target.value)} style={styles.input} disabled={!classId || loadingSubjects}>
          <option value="">{loadingSubjects ? "Memuat mata pelajaran..." : "-- Pilih Mata Pelajaran --"}</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        {error && <div style={styles.error}>{error}</div>}
        {message && <div style={styles.success}>{message}</div>}

        <button onClick={() => showStudents()} disabled={!subjectId || loadingStudents} style={{ ...styles.primary, marginTop: 14, display: "block", width: "100%" }}>
          {loadingStudents ? "MEMUAT SISWA..." : "TAMPILKAN DAFTAR SISWA"}
        </button>

        {students.length > 0 && (
          <div style={styles.students}>
            <div style={styles.toolbar}>
              <div>
                <h2 style={styles.sectionTitle}>{selectedSubject?.name} — {selectedClass?.name}</h2>
                <p style={styles.meta}>Guru: {teacher?.teacherName} · {students.length} siswa</p>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={downloadTemplate} style={styles.downloadBtn} title="Unduh template Excel dengan daftar nama santri kelas ini">
                  📥 UNDUH TEMPLATE EXCEL
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcel} style={{ display: "none" }} />
                <button onClick={() => fileRef.current?.click()} style={styles.secondary} title="Upload file Excel nilai yang sudah diisi">
                  📤 UPLOAD NILAI EXCEL
                </button>
              </div>
            </div>

            {excelPreview && (
              <div style={styles.preview}>
                <strong>Preview Excel: {excelPreview.fileName}</strong>
                <span>{excelPreview.rows.length} cocok · {excelPreview.unmatched.length} tidak cocok</span>
                {excelPreview.unmatched.length > 0 && (
                  <details>
                    <summary>Lihat baris yang tidak cocok</summary>
                    <ul>{excelPreview.unmatched.map((x, i) => <li key={i}>{x.name || x.nisn || "(tanpa identitas)"}</li>)}</ul>
                  </details>
                )}
              </div>
            )}

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>No</th>
                    <th style={styles.th}>NISN</th>
                    <th style={styles.th}>Nama Siswa</th>
                    <th style={styles.th}>Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id}>
                      <td style={styles.td}>{i + 1}</td>
                      <td style={styles.td}>{s.nisn || s.nis || "-"}</td>
                      <td style={styles.td}>{s.name}</td>
                      <td style={styles.td}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={grades[s.id] ?? ""}
                          onChange={e => updateGrade(s.id, e.target.value)}
                          style={styles.grade}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={styles.actions}>
              <span style={styles.count}>{filledGrades().length} / {students.length} nilai terisi</span>
              <button
                onClick={() => saveGrades(false)}
                disabled={saving || syncing || filledGrades().length === 0}
                style={styles.secondary}
                title="Simpan nilai ke database tanpa langsung mengirim ke Google Sheets"
              >
                {saving ? "MENYIMPAN..." : "💾 SIMPAN SAJA (DATABASE)"}
              </button>
              <button
                onClick={syncLastBatch}
                disabled={saving || syncing || filledGrades().length === 0}
                style={{ ...styles.primary, background: "#176b3a", boxShadow: "0 4px 14px rgba(23,107,58,.3)" }}
                title="Simpan nilai ke database dan langsung kirim ke Google Sheets kelas"
              >
                {syncing ? "MENYINKRONKAN KE GOOGLE SHEETS..." : "⚡ SIMPAN & SINKRONKAN KE GOOGLE SHEETS"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f7f4", padding: 28, boxSizing: "border-box" },
  card: { maxWidth: 1100, margin: "0 auto", background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 12px 40px rgba(0,0,0,.08)" },
  header: { display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #eee", paddingBottom: 20 },
  logo: { width: 62, height: 62, objectFit: "contain" },
  title: { margin: 0, fontSize: 25 },
  school: { margin: "5px 0 0", color: "#777" },
  logout: { marginLeft: "auto", border: 0, borderRadius: 9, padding: "10px 14px", background: "#eee", cursor: "pointer", fontWeight: 700 },
  teacherBox: { margin: "20px 0", padding: 15, background: "#f0f7f2", borderRadius: 12, display: "flex", justifyContent: "space-between", gap: 15, flexWrap: "wrap" },
  sectionTitle: { color: "#176b3a", fontSize: 18, margin: "20px 0 10px" },
  label: { display: "block", fontWeight: 700, fontSize: 14, margin: "14px 0 7px" },
  input: { width: "100%", boxSizing: "border-box", padding: "12px 13px", border: "1px solid #d5d5d5", borderRadius: 10, background: "#fff", fontSize: 15 },
  downloadBtn: { border: "1px solid #176b3a", borderRadius: 10, padding: "12px 18px", background: "#f0fdf4", color: "#15803d", fontWeight: 800, cursor: "pointer", transition: "all .2s" },
  secondary: { padding: "12px 18px", borderRadius: 10, border: "1px solid #1f6f43", background: "#fff", color: "#1f6f43", fontWeight: 700, cursor: "pointer" },
  primary: { border: 0, borderRadius: 10, padding: "12px 18px", background: "#176b3a", color: "#fff", fontWeight: 800, cursor: "pointer" },
  secondary: { border: "1px solid #176b3a", borderRadius: 10, padding: "12px 18px", background: "#fff", color: "#176b3a", fontWeight: 800, cursor: "pointer" },
  error: { marginTop: 15, padding: 12, borderRadius: 9, background: "#fff0f0", color: "#a21d1d", fontSize: 14 },
  success: { marginTop: 15, padding: 12, borderRadius: 9, background: "#edf9f0", color: "#176b3a", fontSize: 14 },
  students: { marginTop: 28 },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 15, flexWrap: "wrap" },
  meta: { margin: 0, color: "#777", fontSize: 13 },
  preview: { margin: "16px 0", padding: 14, background: "#fff9e8", border: "1px solid #ead8a1", borderRadius: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: 14 },
  tableWrap: { overflowX: "auto", marginTop: 16 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: 11, background: "#f1f5f2", borderBottom: "1px solid #ddd" },
  td: { padding: 10, borderBottom: "1px solid #eee" },
  grade: { width: 90, padding: 8, border: "1px solid #ccc", borderRadius: 7 },
  actions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 18, flexWrap: "wrap" },
  count: { marginRight: "auto", color: "#666", fontSize: 13 },
};
