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
  const [previewKey, setPreviewKey] = useState(0);

  const students = selectedClass?.students || [];
  const activeStudent = students[studentPage] || null;

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

  function selectStudent(index) {
    if (!students[index]) return;
    setStudentPage(index);
    setStudentId(students[index].id);
    setError("");
    setMessage("");
    setPreviewKey(k => k + 1);
  }

  function printStudent(sid = activeStudent?.id) {
    if (!sid) {
      setError("Belum ada siswa yang dipilih.");
      return;
    }
    setPrinting("student-" + sid);
    setError("");
    openPrint("student", sid);
    setTimeout(() => setPrinting(""), 800);
  }

  function moveStudent(delta) {
    const next = Math.min(
      Math.max(studentPage + delta, 0),
      Math.max(students.length - 1, 0)
    );
    selectStudent(next);
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
        <select value={classId} onChange={e => { setClassId(e.target.value); setStudentId(""); setStudentPage(0); setPreviewKey(k => k + 1); setError(""); }} style={styles.select}>
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

            <div style={styles.previewLayout}>
              <div style={styles.previewPane}>
                <div style={styles.previewHeader}>
                  <div>
                    <h2 style={styles.h2}>Preview Raport Asli</h2>
                    <p style={styles.muted}>
                      Menampilkan sheet {selectedClass.spreadsheetSheet || "Rapot"} dari Spreadsheet asli.
                    </p>
                  </div>
                  {activeStudent && (
                    <div style={styles.previewStudent}>
                      <b>{activeStudent.name}</b>
                      <span>NISN: {activeStudent.nisn || "-"}</span>
                    </div>
                  )}
                </div>

                {activeStudent && selectedClass.spreadsheetId ? (
                  <iframe
                    key={`${classId}-${activeStudent.id}-${previewKey}`}
                    title={`Preview raport ${activeStudent.name}`}
                    src={`/api/report/print?classId=${encodeURIComponent(classId)}&mode=student&studentId=${encodeURIComponent(activeStudent.id)}`}
                    style={styles.pdfFrame}
                  />
                ) : (
                  <div style={styles.previewEmpty}>
                    Pilih kelas yang memiliki Spreadsheet Raport untuk melihat preview.
                  </div>
                )}
              </div>

              <aside style={styles.controlPanel}>
                <div style={styles.navButtons}>
                  <button
                    type="button"
                    onClick={() => moveStudent(-1)}
                    disabled={!activeStudent || studentPage === 0}
                    style={{ ...styles.arrowBtn, ...(studentPage === 0 ? styles.navBtnDisabled : {}) }}
                    aria-label="Siswa sebelumnya"
                    title="Siswa sebelumnya"
                  >
                    ▲
                  </button>
                  <div style={styles.studentPosition}>
                    <b>{activeStudent ? `SISWA ${studentPage + 1}` : "SISWA"}</b>
                    <span>{students.length ? `dari ${students.length}` : "—"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => moveStudent(1)}
                    disabled={!activeStudent || studentPage >= students.length - 1}
                    style={{ ...styles.arrowBtn, ...(studentPage >= students.length - 1 ? styles.navBtnDisabled : {}) }}
                    aria-label="Siswa berikutnya"
                    title="Siswa berikutnya"
                  >
                    ▼
                  </button>
                </div>

                <label style={styles.panelLabel}>SISWA</label>
                <select
                  value={activeStudent?.id || ""}
                  onChange={e => {
                    const index = students.findIndex(s => s.id === e.target.value);
                    if (index >= 0) selectStudent(index);
                  }}
                  style={styles.panelSelect}
                  disabled={!students.length}
                >
                  <option value="">Pilih siswa…</option>
                  {students.map((s, i) => (
                    <option key={s.id} value={s.id}>
                      {i + 1}. {s.name}
                    </option>
                  ))}
                </select>

                <label style={styles.panelLabel}>KELAS</label>
                <select value={classId} onChange={e => {
                  setClassId(e.target.value);
                  setStudentId("");
                  setStudentPage(0);
                  setPreviewKey(k => k + 1);
                  setError("");
                }} style={styles.panelSelect}>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.unit ? ` — ${c.unit}` : ""}
                    </option>
                  ))}
                </select>

                <label style={styles.panelLabel}>JENJANG</label>
                <select value={selectedClass?.unit || ""} readOnly style={styles.panelSelect}>
                  <option value={selectedClass?.unit || ""}>{selectedClass?.unit || "—"}</option>
                </select>

                <button
                  type="button"
                  onClick={() => printStudent()}
                  disabled={!activeStudent || !selectedClass.spreadsheetId || !!printing}
                  style={styles.printBtn}
                >
                  {printing ? "MEMBUKA…" : "PRINT"}
                </button>

                <button
                  type="button"
                  onClick={() => openPrint("class")}
                  disabled={!selectedClass.spreadsheetId}
                  style={styles.printAllBtn}
                >
                  PRINT ALL
                </button>

                <div style={styles.panelHint}>
                  <b>{activeStudent ? activeStudent.name : "Belum ada siswa"}</b>
                  <span>
                    Gunakan tombol ▲ / ▼ untuk berpindah siswa. Preview mengambil PDF dari sheet
                    raport asli sehingga layout dan tulisan Arab tetap mengikuti Spreadsheet.
                  </span>
                </div>
              </aside>
            </div>
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
  previewLayout: { marginTop: 24, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 245px", gap: 16, alignItems: "stretch" },
  previewPane: { minWidth: 0, background: "#f2f2f2", border: "1px solid #d9dedb", borderRadius: 14, overflow: "hidden" },
  previewHeader: { padding: 14, background: "#fff", borderBottom: "1px solid #e2e5e3", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  h2: { margin: 0, color: "#176b3a", fontSize: 18 },
  muted: { margin: "5px 0 0", color: "#777", fontSize: 13 },
  previewStudent: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, fontSize: 12 },
  pdfFrame: { display: "block", width: "100%", height: "760px", border: 0, background: "#fff" },
  previewEmpty: { minHeight: 760, display: "grid", placeItems: "center", padding: 30, color: "#777", background: "#fff", textAlign: "center" },
  controlPanel: { background: "#fff", border: "1px solid #d9dedb", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 8px 25px rgba(0,0,0,.05)" },
  navButtons: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingBottom: 8 },
  arrowBtn: { width: 72, height: 42, border: "1px solid #cbd5cf", borderRadius: 8, background: "#f7faf8", color: "#111", fontSize: 20, fontWeight: 900, cursor: "pointer" },
  studentPosition: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 12, color: "#176b3a" },
  panelLabel: { marginTop: 7, fontSize: 11, fontWeight: 900, color: "#555", letterSpacing: ".05em" },
  panelSelect: { width: "100%", boxSizing: "border-box", padding: "10px 11px", border: "1px solid #cfd8d2", borderRadius: 8, background: "#fff", fontSize: 13 },
  printBtn: { marginTop: 12, width: "100%", border: 0, borderRadius: 8, padding: "11px 14px", background: "#4f79c9", color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer" },
  printAllBtn: { width: "100%", border: "1px solid #bbb", borderRadius: 8, padding: "11px 14px", background: "#f5f5f5", color: "#222", fontSize: 12, fontWeight: 900, cursor: "pointer" },
  panelHint: { marginTop: "auto", padding: 10, borderRadius: 9, background: "#f5f8f6", color: "#555", display: "flex", flexDirection: "column", gap: 5, fontSize: 11, lineHeight: 1.45 },
  error: { marginTop: 15, padding: 12, borderRadius: 9, background: "#fff0f0", color: "#a21d1d", fontSize: 14 },
  success: { marginTop: 15, padding: 12, borderRadius: 9, background: "#edf9f0", color: "#176b3a", fontSize: 14 }
};
