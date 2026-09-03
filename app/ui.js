"use client";

import { useState } from "react";
import styles from "./ui.module.css";

export default function LoginPanel() {
  const [jenjang, setJenjang] = useState("");
  const [kelas, setKelas] = useState("");
  const [mapel, setMapel] = useState("");
  const [guru, setGuru] = useState("");
  const [message, setMessage] = useState("");

  async function masuk() {
    setMessage("Tahap 1 siap. Login Supabase akan diaktifkan pada tahap berikutnya.");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <img src="/assets/logo-ypi-al-ghozali.png" alt="Logo YPI Al-Ghozali" className={styles.logoImage} />
        <div>
          <h1>Raport Integrasi</h1>
          <p>Pondok Modern Al-Ghozali</p>
        </div>
      </header>

      <section className={styles.card}>
        <div className={styles.steps}>
          <span className={styles.active}>1. Jenjang</span>
          <span>2. Kelas</span>
          <span>3. Mapel</span>
          <span>4. Nilai</span>
        </div>

        <h2>Input Nilai Guru</h2>
        <p className={styles.muted}>
          Pilih jenjang, kelas, mata pelajaran, dan guru.
        </p>

        <label>Jenjang</label>
        <select value={jenjang} onChange={e => {setJenjang(e.target.value); setKelas("");}}>
          <option value="">Pilih Jenjang</option>
          <option value="SMP">SMP</option>
          <option value="SMA">SMA</option>
        </select>

        <label>Kelas</label>
        <select value={kelas} onChange={e => setKelas(e.target.value)} disabled={!jenjang}>
          <option value="">Pilih Kelas</option>
        </select>

        <label>Mata Pelajaran</label>
        <select value={mapel} onChange={e => setMapel(e.target.value)} disabled={!kelas}>
          <option value="">Pilih Mata Pelajaran</option>
        </select>

        <label>Nama Guru</label>
        <select value={guru} onChange={e => setGuru(e.target.value)}>
          <option value="">Pilih Nama Guru</option>
        </select>

        <button onClick={masuk} disabled={!jenjang || !kelas || !mapel || !guru}>
          Lanjut Input Nilai →
        </button>

        {message && <div className={styles.info}>{message}</div>}
      </section>

      <footer>RAPORT INTEGRASI • Pondok Modern Al-Ghozali • Tahun Pelajaran 2026–2027</footer>
    </main>
  );
}
