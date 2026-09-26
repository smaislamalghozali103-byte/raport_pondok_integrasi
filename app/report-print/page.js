"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function ReportPrintPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [studentPage, setStudentPage] = useState(0);
  const STUDENTS_PER_PAGE = 4;

  const students = selectedClass?.students || [];
  const totalStudentPages = Math.max(1, Math.ceil(students.length / STUDENTS_PER_PAGE));
  const visibleStudents = students.slice(
    studentPage * STUDENTS_PER_PAGE,
    studentPage * STUDENTS_PER_PAGE + STUDENTS_PER_PAGE
  );

  const selectedClass = useMemo(
    () => classes.find(c => c.id === classId),
    [classes, classId]
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const r = await fetch("/api/report/print/classes", { cache: "no-store", credentials: "include" });
      const d = await r.json();
      if (!r.ok || !d.success) {
        if (r.status === 401) {
          window.location.href = "/login";
          return;
        }
        throw new Error(d.message || "Gagal memuat ruang cetak raport.");
      }
      setRole(d.role || "");
      setClasses(d.classes || []);
      if (d.classes?.[0]) setClassId(d.classes[0].id);
    } catch (e) {
      setError(e.message || "Gagal memuat data.");
    } finally {
      setLoading(false);
    }
  }

  function openPrint(mode, sid = "") {
    if (!classId) {
      setError("Pilih kelas terlebih dahulu.");
      return;
    }
    if (mode === "student" && !sid) {
      setError("Pilih siswa terlebih dahulu.");
      return;
    }

    const params = new URLSearchParams({
      classId,
      mode,
      ...(sid ? { studentId: sid } : {})
    });

    const url = "/api/report/print?" + params.toString();
    window.open(url, "_blank", "noopener,noreferrer");
    setMessage(
      mode === "student"
        ? "PDF raport siswa sedang dibuka di tab baru."
        : "PDF raport satu kelas sedang dibuat."
    );
  }

  async function exportPdfClass() {
    if (!classId) {
      setError("Pilih kelas terlebih dahulu.");
      return;
    }

    setPrinting("pdf");
    setError("");
    try {
      const params = new URLSearchParams({ classId, mode: "class" });
      const r = await fetch("/api/report/print?" + params.toString(), {
        cache: "no-store",
        credentials: "include"
      });

      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || "Gagal export PDF.");
      }

      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Raport_${(selectedClass?.name || "Kelas").replace(/[^a-zA-Z0-9_-]+/g, "_")}_1_Kelas.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("✓ PDF satu kelas berhasil diekspor.");
    } catch (e) {
      setError(e.message || "Gagal export PDF.");
    } finally {
      setPrinting("");
    }
  }

  function printStudent(sid) {
    setPrinting("student-" + sid);
    setError("");
    openPrint("student", sid);
    setTimeout(() => setPrinting(""), 800);
  }

  if (loading) {
    return <main style={styles.page}><div style={styles.card}>Memuat ruang cetak raport…</div></main>;
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <header style={styles.header}>
          <img src="/assets/logo-ypi-al-ghozali.png" alt="Logo YPI Al-Ghozali" style={styles.logo} />
          <div>
            <h1 style={styles.title}>RUANG CETAK RAPORT</h1>
            <p style={styles.school}>Pondok Modern Al-Ghozali</p>
            <span style={styles.role}>{role === "admin" ? "ADMIN" : "WALI KELAS"}</span>
          </div>
          <button onClick={() => router.push(role === "admin" ? "/admin" : "/dashboard")} style={styles.back}>
            ← Kembali
          </button>
        </header>

        <div style={styles.info}>
          <b>Raport asli dari Google Spreadsheet</b>
          <span>
            PDF dibuat langsung dari Spreadsheet yang terhubung ke kelas sehingga layout, border,
            formula, dan desain raport tetap mengikuti dokumen asli.
          </span>
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {message && <div style={styles.success}>{message}</div>}

        <label style={styles.label}>Pilih Kelas</label>
        <select value={classId} onChange={e => { setClassId(e.target.value); setStudentId(""); setStudentPage(0); setError(""); }} style={styles.select}>
          <option value="">Pilih kelas…</option>
          {classes.map(c => (
            <option key={c.id} value={c.id}>
              {c.name}{c.unit ? " — " + c.unit : ""}
            </option>
          ))}
        </select>

        {selectedClass && (
          <>
            <div style={styles.summary}>
              <div style={styles.summaryItem}><b>{selectedClass.name}</b><span>{selectedClass.unit || "—"}</span></div>
              <div style={styles.summaryItem}><b>{selectedClass.students.length}</b><span>Siswa</span></div>
              <div style={styles.summaryItem}><b>{selectedClass.spreadsheetId ? "✓ Terhubung" : "—"}</b><span>Spreadsheet</span></div>
            </div>

            <div style={styles.actions}>
              <button
                onClick={() => openPrint("class")}
                disabled={printing === "class" || !selectedClass.spreadsheetId}
                style={styles.primary}
              >
                {printing === "class" ? "MEMBUAT PDF…" : "🖨️ CETAK 1 KELAS"}
              </button>
              <button
                onClick={exportPdfClass}
                disabled={printing === "pdf" || !selectedClass.spreadsheetId}
                style={styles.pdf}
              >
                📄 EXPORT TO PDF
              </button>
            </div>

            <div style={styles.sectionHead}>
              <div>
                <h2 style={styles.h2}>Pilih Siswa</h2>
                <p style={styles.muted}>Pilih salah satu dari 4 siswa yang tampil, lalu cetak raportnya.</p>
              </div>
              <div style={styles.pageInfo}>
                {students.length
                  ? `Siswa ${studentPage * STUDENTS_PER_PAGE + 1}–${Math.min((studentPage + 1) * STUDENTS_PER_PAGE, students.length)} dari ${students.length}`
                  : "Belum ada siswa"}
              </div>
            </div>

            <div style={styles.studentGrid}>
              {visibleStudents.map((s, localIndex) => {
                const number = studentPage * STUDENTS_PER_PAGE + localIndex + 1;
                const isPrinting = printing === "student-" + s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => printStudent(s.id)}
                    disabled={!selectedClass.spreadsheetId || isPrinting}
                    style={styles.studentBtn}
                  >
                    <span style={styles.studentNumber}>SISWA {number}</span>
                    <strong style={styles.studentName}>{s.name || "Nama siswa"}</strong>
                    <span style={styles.studentNisn}>NISN: {s.nisn || "-"}</span>
                    <span style={styles.studentAction}>
                      {isPrinting ? "MEMBUKA PDF…" : "🖨️ CETAK RAPORT"}
                    </span>
                  </button>
                );
              })}
              {!students.length && <div style={styles.emptyStudent}>Belum ada siswa pada kelas ini.</div>}
            </div>

            {students.length > STUDENTS_PER_PAGE && (
              <div style={styles.pagination}>
                <button
                  type="button"
                  onClick={() => setStudentPage(p => Math.max(0, p - 1))}
                  disabled={studentPage === 0}
                  style={{ ...styles.navBtn, ...(studentPage === 0 ? styles.navBtnDisabled : {}) }}
                >
                  ← SEBELUMNYA
                </button>
                <div style={styles.pageCounter}>HALAMAN {studentPage + 1} / {totalStudentPages}</div>
                <button
                  type="button"
                  onClick={() => setStudentPage(p => Math.min(totalStudentPages - 1, p + 1))}
                  disabled={studentPage >= totalStudentPages - 1}
                  style={{ ...styles.navBtn, ...(studentPage >= totalStudentPages - 1 ? styles.navBtnDisabled : {}) }}
                >
                  SESUDAHNYA →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f7f4", padding: 28, boxSizing: "border-box" },
  card: { maxWidth: 1180, margin: "0 auto", background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 12px 40px rgba(0,0,0,.08)" },
  header: { display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #eee", paddingBottom: 20 },
  logo: { width: 62, height: 62, objectFit: "contain" },
  title: { margin: 0, fontSize: 25 },
  school: { margin: "5px 0", color: "#777" },
  role: { display: "inline-block", marginTop: 4, padding: "4px 9px", borderRadius: 999, background: "#eff6ff", color: "#1d4ed8", fontSize: 11, fontWeight: 800 },
  back: { marginLeft: "auto", border: 0, borderRadius: 9, padding: "10px 14px", background: "#eee", cursor: "pointer", fontWeight: 700 },
  info: { marginTop: 20, padding: 15, borderRadius: 12, background: "#f0f7f2", color: "#176b3a", display: "flex", flexDirection: "column", gap: 5, fontSize: 13, lineHeight: 1.5 },
  label: { display: "block", fontWeight: 700, fontSize: 14, margin: "20px 0 7px" },
  select: { width: "100%", boxSizing: "border-box", padding: "12px 13px", border: "1px solid #d5d5d5", borderRadius: 10, background: "#fff", fontSize: 15 },
  summary: { marginTop: 16, display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 },
  summaryItem: { padding: 12, borderRadius: 10, background: "#f8faf9", border: "1px solid #e2e8e4", display: "flex", flexDirection: "column", gap: 3 },
  actions: { marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" },
  primary: { border: 0, borderRadius: 10, padding: "12px 18px", background: "#176b3a", color: "#fff", fontWeight: 800, cursor: "pointer" },
  pdf: { border: "1px solid #176b3a", borderRadius: 10, padding: "12px 18px", background: "#f0fdf4", color: "#176b3a", fontWeight: 800, cursor: "pointer" },
  sectionHead: { marginTop: 28, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15 },
  h2: { margin: 0, color: "#176b3a", fontSize: 18 },
  muted: { margin: "5px 0 0", color: "#777", fontSize: 13 },
  pageInfo: { padding: "8px 12px", borderRadius: 999, background: "#f1f5f2", color: "#176b3a", fontSize: 12, fontWeight: 800 },
  studentGrid: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  studentBtn: { minHeight: 175, textAlign: "left", border: "1px solid #d9e5dc", borderRadius: 14, padding: 16, background: "#fff", color: "#176b3a", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 4px 14px rgba(23,107,58,.06)" },
  studentNumber: { fontSize: 11, fontWeight: 900, letterSpacing: ".05em", color: "#fff", background: "#176b3a", borderRadius: 999, padding: "5px 8px", alignSelf: "flex-start" },
  studentName: { fontSize: 15, lineHeight: 1.35, color: "#17231b", minHeight: 42 },
  studentNisn: { fontSize: 12, color: "#777" },
  studentAction: { marginTop: "auto", fontSize: 12, fontWeight: 900, color: "#176b3a" },
  emptyStudent: { gridColumn: "1 / -1", padding: 24, textAlign: "center", border: "1px dashed #cbd5ce", borderRadius: 12, color: "#777" },
  pagination: { marginTop: 16, display: "flex", justifyContent: "center", alignItems: "center", gap: 12, flexWrap: "wrap" },
  navBtn: { border: "1px solid #176b3a", borderRadius: 10, padding: "10px 16px", background: "#fff", color: "#176b3a", fontWeight: 900, cursor: "pointer" },
  navBtnDisabled: { opacity: .45, cursor: "not-allowed" },
  pageCounter: { minWidth: 110, textAlign: "center", fontSize: 12, fontWeight: 900, color: "#555" },
  studentSearch: { display: "none" },
  tableWrap: { overflowX: "auto", marginTop: 12 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: 11, background: "#f1f5f2", borderBottom: "1px solid #ddd" },
  td: { padding: 10, borderBottom: "1px solid #eee" },
  smallBtn: { border: "1px solid #176b3a", borderRadius: 8, padding: "8px 12px", background: "#fff", color: "#176b3a", fontWeight: 800, cursor: "pointer" },
  error: { marginTop: 15, padding: 12, borderRadius: 9, background: "#fff0f0", color: "#a21d1d", fontSize: 14 },
  success: { marginTop: 15, padding: 12, borderRadius: 9, background: "#edf9f0", color: "#176b3a", fontSize: 14 }
};
