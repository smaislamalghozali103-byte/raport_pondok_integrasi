"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const SUBJECTS = [
  ["Tamrin Lughoh", "تمرين اللغة"],
  ["Mutholaah", "المطالعة"],
  ["Aqidah", "العقيدة"],
  ["Hadist", "الحديث"],
  ["Fiqih", "الفقه"],
  ["Tarikh Islam", "التاريخ الإسلامي"],
  ["Tajwid", "التجويد"],
  ["Imla", "الإملاء"],
  ["Khot", "الخطّ"],
  ["Mahfudzot", "المحفوظات"],
  ["Pendidikan Agama Islam", "التربية الدينية الإسلامية"],
  ["Bahasa Indonesia", "اللغة الإندونيسية"],
  ["Bahasa Inggris", "اللغة الإنجليزية"],
  ["Matematika", "الرياضيات"],
  ["Ilmu Pengetahuan Alam", "علم الطبيعة"],
  ["Ilmu Pengetahuan Sosial", "علم الإجتماع"],
  ["Pendidikan Kewarganegaraan", "التربية الوطنية"],
  ["Informatika", "علم الحاسوب الأليكتروني"],
  ["Pendidikan Jasmani dan Kesehatan", "الرياضة الجسمية"],
  ["Seni Budaya", "الفنون الجميلة"],
  ["Bahasa Sunda", "اللغة السوندية"],
];

const LOGO = "/assets/logo-ypi-al-ghozali.png";

function clean(v) {
  return String(v ?? "").trim();
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits).replace(/\.00$/, "");
}

function numberToArabicWords(n) {
  const units = ["nol","satu","dua","tiga","empat","lima","enam","tujuh","delapan","sembilan","sepuluh","sebelas"];
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return "";
  if (n < 12) return units[n];
  if (n < 20) return units[n-10] + " belas";
  if (n < 100) return units[Math.floor(n/10)] + " puluh" + (n%10 ? " " + units[n%10] : "");
  if (n < 200) return "seratus" + (n%100 ? " " + numberToArabicWords(n%100) : "");
  if (n < 1000) return units[Math.floor(n/100)] + " ratus" + (n%100 ? " " + numberToArabicWords(n%100) : "");
  if (n < 2000) return "seribu" + (n%1000 ? " " + numberToArabicWords(n%1000) : "");
  if (n < 1000000) return numberToArabicWords(Math.floor(n/1000)) + " ribu" + (n%1000 ? " " + numberToArabicWords(n%1000) : "");
  return String(n);
}

function scoreMeta(item) {
  return {
    name: item.name || item.fullName || "",
    nisn: item.nisn || item.nis || "",
    className: item.className || item.kelas || item.class?.name || "",
    unit: item.unit || item.jenjang || item.class?.unit || "",
    schoolYear: item.schoolYear || "2026/2027",
    waliKelas: item.waliKelas || item.homeroomTeacher || "",
    director: item.director || "M. Ya'qub Unang, S.Ag",
  };
}

function rowsSubjectIsConfigured(subjectName) {
  return SUBJECTS.some(([en]) => en === subjectName);
}

export default function ReportPrintPage() {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [grades, setGrades] = useState({});
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedClass = useMemo(() => classes.find(c => c.id === classId), [classes, classId]);
  const students = selectedClass?.students || [];
  const student = useMemo(() => students.find(s => s.id === studentId) || students[0] || null, [students, studentId]);
  const meta = scoreMeta({
    ...student,
    className: selectedClass?.name,
    unit: selectedClass?.unit,
    waliKelas: selectedClass?.waliKelas || selectedClass?.homeroomTeacher,
    schoolYear: selectedClass?.schoolYear || "2026/2027",
  });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!studentId && students[0]) setStudentId(students[0].id);
  }, [students, studentId]);

  useEffect(() => {
    if (classId && studentId) loadGrades(classId, studentId);
  }, [classId, studentId]);

  async function load() {
    try {
      setLoading(true);
      const r = await fetch("/api/report/print/classes", { cache: "no-store", credentials: "include" });
      const d = await r.json();
      if (!r.ok || !d.success) {
        if (r.status === 401) { window.location.href = "/login"; return; }
        throw new Error(d.message || "Gagal memuat kelas.");
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

  async function loadGrades(cid, sid) {
    try {
      setError("");
      const r = await fetch(`/api/report/preview?classId=${encodeURIComponent(cid)}&studentId=${encodeURIComponent(sid)}`, {
        cache: "no-store", credentials: "include"
      });
      if (!r.ok) return;
      const d = await r.json();
      if (!d.success) return;
      const map = {};
      (d.grades || []).forEach(g => { map[clean(g.subjectName || g.subjectId)] = g.value; });
      setGrades(map);
      setRanking(d.ranking || null);
    } catch {}
  }

  function printReport() {
    window.print();
  }

  function downloadPdfViaBrowser() {
    window.print();
  }

  const dynamicRows = Object.keys(grades).length
    ? SUBJECTS.map(([en, ar]) => ({ en, ar, score: grades[en] ?? "" })).filter(r => r.score !== "" || rowsSubjectIsConfigured(r.en))
    : SUBJECTS.map(([en, ar]) => ({ en, ar, score: "" }));
  const rows = dynamicRows;
  const filled = rows.map(r => Number(r.score)).filter(Number.isFinite);
  const total = filled.reduce((a,b) => a+b, 0);
  const average = filled.length ? total / filled.length : 0;
  const rank = ranking?.rank ?? ranking?.position ?? "";

  if (loading) return <main className="web-report-shell"><div className="loading-card">Memuat raport…</div></main>;

  return (
    <main className="web-report-shell">
      <style jsx global>{`
        * { box-sizing: border-box; }
        body { margin:0; background:#edf2ed; color:#111; font-family:Arial, Helvetica, sans-serif; }
        button, select { font: inherit; }
        .web-report-shell { min-height:100vh; padding:18px; }
        .topbar { max-width:1200px; margin:0 auto 14px; background:#ffffff; border:1px solid #d8dfd9; border-radius:14px; padding:10px 14px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; box-shadow:0 8px 30px rgba(0,0,0,.06); }
        .topbar .grow { flex:1; }
        .topbar select { min-width:240px; padding:9px 11px; border:1px solid #cbd5cf; border-radius:9px; background:#fff; }
        .btn { border:0; border-radius:9px; padding:9px 14px; cursor:pointer; font-weight:800; }
        .btn-green { background:#176b3a; color:#fff; }
        .btn-light { background:#f3f6f4; border:1px solid #d1dbd4; }
        .report-page { width:210mm; min-height:297mm; margin:0 auto; background:#fff; position:relative; padding:12mm 11mm 11mm; border:2px solid #d71920; box-shadow:0 10px 35px rgba(0,0,0,.16); overflow:hidden; }
        .ornament { position:absolute; inset:2mm; border:8px solid transparent; pointer-events:none; background:repeating-linear-gradient(45deg,#0b5a35 0 5px,#136d41 5px 10px,#0b5a35 10px 15px) border-box; -webkit-mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; }
        .inner { position:relative; z-index:1; }
        .head { display:grid; grid-template-columns:28mm 1fr 28mm; align-items:center; gap:5mm; }
        .logo { width:24mm; height:24mm; object-fit:contain; justify-self:center; }
        .arabic-title { font-family:"Times New Roman",serif; font-size:30px; font-weight:700; text-align:center; direction:rtl; margin:0 0 2mm; }
        .sub-title { text-align:center; font-size:13px; font-weight:800; margin:0; }
        .identity { display:grid; grid-template-columns:1fr 1fr; gap:2mm 10mm; margin:6mm 4mm 3mm; font-size:12px; }
        .id-row { display:grid; grid-template-columns:30mm 1fr; gap:2mm; }
        .id-row .label { font-weight:700; direction:rtl; text-align:right; }
        .id-row .value { font-weight:700; border-bottom:1px dotted #777; padding-bottom:1mm; }
        table.report-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:10px; }
        .report-table th,.report-table td { border:1px solid #111; padding:1.5mm 1mm; vertical-align:middle; }
        .report-table th { background:#f5e9c5; font-weight:800; }
        .c-no { width:8mm; text-align:center; }
        .c-ar { width:44mm; direction:rtl; text-align:right; }
        .c-en { width:50mm; }
        .c-score { width:20mm; text-align:center; }
        .c-pred { width:18mm; text-align:center; }
        .c-word { width:48mm; direction:rtl; text-align:center; font-family:"Times New Roman",serif; }
        .summary td { font-weight:800; background:#fafafa; }
        .summary-label { direction:rtl; text-align:right; }
        .footer-note { margin-top:4mm; text-align:center; font-family:"Times New Roman",serif; direction:rtl; font-size:11px; }
        .sign-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:5mm; margin-top:7mm; align-items:end; }
        .sign { text-align:center; font-size:11px; }
        .sign .role { font-weight:800; margin-bottom:18mm; }
        .sign .line { border-bottom:1px solid #333; height:1px; margin:0 10mm 2mm; }
        .seal-space { min-height:34mm; display:flex; align-items:center; justify-content:center; }
        .seal-space img { width:28mm; height:28mm; object-fit:contain; }
        .muted { color:#666; font-size:11px; }
        @media print {
          body { background:#fff; }
          .web-report-shell { padding:0; }
          .topbar { display:none !important; }
          .report-page { width:210mm; min-height:297mm; margin:0; box-shadow:none; }
          @page { size:A4 portrait; margin:0; }
        }
      `}</style>

      <div className="topbar">
        <strong>RAPORT PONDOK MODERN AL-GHOZALI</strong>
        <div className="grow" />
        <select value={classId} onChange={e => { setClassId(e.target.value); setStudentId(""); setGrades({}); }}>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.unit ? ` — ${c.unit}` : ""}</option>)}
        </select>
        <select value={student?.id || ""} onChange={e => setStudentId(e.target.value)}>
          {students.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.name}</option>)}
        </select>
        <button className="btn btn-light" onClick={() => router.push(role === "admin" ? "/admin" : "/dashboard")}>← Kembali</button>
        <button className="btn btn-green" onClick={printReport}>🖨️ Cetak A4 / PDF</button>
      </div>

      {error && <div className="topbar" style={{color:"#a21d1d"}}>{error}</div>}

      <section className="report-page">
        <div className="ornament" />
        <div className="inner">
          <header className="head">
            <img src={LOGO} className="logo" alt="Logo kiri" />
            <div>
              <h1 className="arabic-title">كشف الدرجات</h1>
              <p className="sub-title">للامتحان التّحريري لمنتصف الفصل الدّراسي الأوّل</p>
            </div>
            <img src={LOGO} className="logo" alt="Logo kanan" />
          </header>

          <div className="identity">
            <div className="id-row"><div className="label">الاسم كامل :</div><div className="value">{meta.name || "—"}</div></div>
            <div className="id-row"><div className="label">الصّفّ :</div><div className="value">{meta.className || "—"}</div></div>
            <div className="id-row"><div className="label">الرقم :</div><div className="value">{meta.nisn || "—"}</div></div>
            <div className="id-row"><div className="label">العام الدّراسي :</div><div className="value">{meta.schoolYear || "2026/2027"}</div></div>
          </div>

          <table className="report-table">
            <thead>
              <tr>
                <th className="c-no">الرقم</th>
                <th className="c-ar">المواد الدّراسيّة</th>
                <th className="c-en">Mata Pelajaran</th>
                <th className="c-score">أرقام</th>
                <th className="c-pred">حروف</th>
                <th className="c-word">الدرجة الّتي حصلت عليها</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const s = Number(r.score);
                const pred = Number.isFinite(s) ? (s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : "D") : "";
                const words = Number.isFinite(s) ? numberToArabicWords(s) : "";
                return (
                  <tr key={r.en}>
                    <td className="c-no">{i + 1}</td>
                    <td className="c-ar">{r.ar}</td>
                    <td className="c-en">{r.en}</td>
                    <td className="c-score">{Number.isFinite(s) ? formatNumber(s, 0) : ""}</td>
                    <td className="c-pred">{pred}</td>
                    <td className="c-word">{words}</td>
                  </tr>
                );
              })}
              <tr className="summary">
                <td colSpan={3} className="summary-label">المجـموع / Jumlah</td>
                <td className="c-score">{filled.length ? formatNumber(total, 0) : ""}</td>
                <td colSpan={2}></td>
              </tr>
              <tr className="summary">
                <td colSpan={3} className="summary-label">النّتيجـة المـعدّلة / Nilai Rata Rata</td>
                <td className="c-score">{filled.length ? formatNumber(average, 2) : ""}</td>
                <td colSpan={2}></td>
              </tr>
              <tr className="summary">
                <td colSpan={3} className="summary-label">المقـام / Peringkat</td>
                <td className="c-score">{rank}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>

          <div className="footer-note">
            تحريراً بغونونج سندور، 10 اكتوبر 2026 / 27 ربيع الآخر 1448
          </div>

          <div className="sign-grid">
            <div className="sign">
              <div className="role">ولي الأمر</div>
              <div className="seal-space" />
              <div className="line" />
            </div>

            <div className="sign">
              <div className="role">ولي الفصل</div>
              <div className="seal-space">
                <img src={LOGO} alt="Stempel" />
              </div>
              <div className="line" />
              <strong>{meta.waliKelas || "Amalia Nur Fariha, S.Pd"}</strong>
            </div>

            <div className="sign">
              <div className="role">مـدير المـعهد</div>
              <div className="seal-space" />
              <div className="line" />
              <strong>{meta.director}</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
