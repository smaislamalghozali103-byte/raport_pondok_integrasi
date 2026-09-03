# Raport Integrasi | Pondok Modern Al-Ghozali — V16.0 ULTIMATE

Versi production baseline terlengkap dari rangkaian V8.5–V15.0. Mempertahankan UI MASTER, login guru Nama+PIN, Firebase/Firestore, Google Sheets API, Google Drive Archive, authorization, validation, monitoring, audit, retry sync, backup konfigurasi, dan health/preflight checks.

## Flow
Login → Jenjang → Kelas → Mapel → Siswa → Input/Import → Validasi → Firestore → Sync Queue → Google Sheets/Rekap → Google Drive Archive.

## Commands
- `npm install`
- `npm run preflight`
- `npm run import:master:firebase`
- `npm run build`
- `npm start`
- `npm run health`

## Production rules
- Jangan taruh service-account/private key di frontend.
- Jangan commit `.env.local`.
- Google Sheets tetap menjadi mesin formula raport.
- Struktur `Rekap` dideteksi fleksibel; jangan hardcode posisi kolom.
- Semua write nilai melalui server authorization.
