"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState([]);
  const [teacherId, setTeacherId] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [setup, setSetup] = useState(false);

  useEffect(() => {
    fetch('/api/auth/teachers')
      .then(r => r.json())
      .then(d => setTeachers(d.teachers || []))
      .catch(() => {
        setIsSuccess(false);
        setMessage('Master guru belum dapat dimuat.');
      });
  }, []);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setIsSuccess(false);

    try {
      if (setup) {
        // Mode Pembuatan PIN Baru
        const r = await fetch('/api/auth/register-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            teacherId,
            pin,
            confirmPin: pin2,
            pinConfirm: pin2
          })
        });

        const d = await r.json();

        if (!r.ok) {
          setIsSuccess(false);
          setMessage(d.message || 'Gagal menyimpan PIN.');
          return;
        }

        // Setelah sukses menyimpan PIN, kembalikan ke tampilan login biasa (Nama Guru dan PIN saja)
        setSetup(false);
        setPin('');
        setPin2('');
        setIsSuccess(true);
        setMessage('✅ PIN berhasil disimpan! Silakan masukkan PIN Anda untuk masuk.');
        return;
      }

      // Mode Login Biasa (Nama Guru + PIN)
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ teacherId, pin })
      });

      const d = await r.json();

      if (d.needsPinSetup) {
        setSetup(true);
        setPin('');
        setPin2('');
        setIsSuccess(false);
        setMessage('Guru ini belum memiliki PIN. Silakan buat PIN baru (minimal 6 digit angka).');
        return;
      }

      if (!r.ok) {
        setIsSuccess(false);
        setMessage(d.message || 'Proses login gagal.');
        return;
      }

      window.location.href = '/dashboard';
    } catch (err) {
      setIsSuccess(false);
      setMessage('Terjadi kesalahan jaringan atau server: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleTeacherChange(e) {
    setTeacherId(e.target.value);
    setSetup(false);
    setPin('');
    setPin2('');
    setMessage('');
    setIsSuccess(false);
  }

  return (
    <main className={styles.page}>
      <div className={styles.pattern} />
      <section className={styles.content}>
        <header className={styles.brand}>
          <img src="/assets/logo-ypi-al-ghozali.png" alt="Logo YPI Al-Ghozali" className={styles.logo} />
          <h1>RAPORT INTEGRASI</h1>
          <p>Pondok Modern Al-Ghozali</p>
          <div className={styles.divider}><span>✦</span></div>
        </header>

        <div className={styles.heading}>
          <h2>LOGIN GURU</h2>
          <p>{setup ? 'Buat PIN pertama Anda' : 'Silakan masuk dengan nama guru dan PIN'}</p>
        </div>

        <form className={styles.card} onSubmit={submit}>
          <label htmlFor="teacher">Nama Guru</label>
          <div className={styles.inputWrap}>
            <span>👤</span>
            <select id="teacher" value={teacherId} onChange={handleTeacherChange} required>
              <option value="">Pilih nama guru</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <label htmlFor="pin">{setup ? 'PIN Baru' : 'PIN'}</label>
          <div className={styles.inputWrap}>
            <span>▣</span>
            <input
              id="pin"
              inputMode="numeric"
              pattern="[0-9]{6,}"
              minLength={6}
              maxLength={12}
              type="password"
              autoComplete={setup ? 'new-password' : 'current-password'}
              placeholder="Minimal 6 digit"
              value={pin}
              onChange={e => {
                setPin(e.target.value.replace(/\D/g, ''));
                if (!isSuccess) setMessage('');
              }}
              required
            />
          </div>

          {setup && (
            <>
              <label htmlFor="pin2">Konfirmasi PIN</label>
              <div className={styles.inputWrap}>
                <span>✓</span>
                <input
                  id="pin2"
                  inputMode="numeric"
                  pattern="[0-9]{6,}"
                  minLength={6}
                  maxLength={12}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ulangi PIN"
                  value={pin2}
                  onChange={e => {
                    setPin2(e.target.value.replace(/\D/g, ''));
                    setMessage('');
                  }}
                  required
                />
              </div>
            </>
          )}

          <button className={styles.button} disabled={loading} type="submit">
            {loading ? 'MEMPROSES...' : setup ? 'SIMPAN PIN' : '↪  MASUK'}
          </button>

          {message && (
            <div className={isSuccess ? styles.success : styles.error} role="alert">
              {message}
            </div>
          )}

          <div className={styles.help}>ⓘ &nbsp; Butuh bantuan? Hubungi Admin IT</div>
        </form>

        <footer>
          <strong>© 2026 Pondok Modern Al-Ghozali</strong>
          <span>Sistem Raport Integrasi</span>
        </footer>
      </section>
    </main>
  );
}
