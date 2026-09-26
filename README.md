# Raport Integrasi | Pondok Modern Al-Ghozali — V16.0

Firebase/Firestore **tidak digunakan lagi** sebagai datastore aplikasi.

## Arsitektur

- **Next.js / Vercel** — frontend + backend API + autentikasi.
- **Google Sheets API** — datastore aplikasi dan sumber data resmi.
- **APP_DB** — satu tab khusus untuk state aplikasi seperti guru, kelas, mapel, penugasan, monitoring, dan konfigurasi yang perlu ditulis backend.
- **Spreadsheet raport per kelas** — tetap menjadi sumber resmi Rekap/Nilai/RAPOT/RAPORT.
- **Google Drive/Sheets** — tetap digunakan hanya bila fitur terkait memang aktif.
- Browser tidak menyimpan nilai siswa di localStorage.

## Environment wajib

- `APP_DATA_SPREADSHEET_ID` — ID Google Spreadsheet khusus datastore aplikasi. Jangan campur dengan spreadsheet raport kelas.
- `APP_DATA_SHEET` — opsional, default `APP_DB`.
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `SESSION_SECRET` minimal 32 karakter.

## Format APP_DB

Sistem membuat tab `APP_DB` otomatis bila belum ada, dengan kolom:

`collection | id | data_json | updated_at`

Route lama yang masih mengimpor `lib/firebase-admin.js` tetap kompatibel melalui compatibility layer, tetapi implementasinya sekarang membaca/menulis Google Sheets.

## Flow

Login → Jenjang → Kelas → Mapel → Siswa → Input/Import → Validasi → Google Sheets → Rekap → RAPOT/RAPORT → PDF.

## Commands

- `npm install`
- `npm run preflight`
- `npm run import:master:sheets`
- `npm run build`
- `npm start`
- `npm run health`

## Production rules

- Jangan taruh service-account/private key di frontend.
- Jangan commit `.env.local`.
- Google Sheets tetap menjadi mesin formula raport.
- Struktur `Rekap` dideteksi fleksibel; jangan hardcode posisi kolom.
- Semua write nilai melalui server authorization.
- Nilai siswa tidak disimpan di localStorage.
