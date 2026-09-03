# Import / Deteksi Rekap Kelas

Setelah master guru/mapel/kelas diimpor, admin dapat mendaftarkan Google Spreadsheet kelas melalui API:

`POST /api/admin/classes/import-rekap`

Body JSON:

```json
{
  "class_id": "UUID_KELAS",
  "spreadsheet_url": "https://docs.google.com/spreadsheets/d/ID/edit",
  "sheet_name": "Rekap",
  "school_year": "2026-2027"
}
```

Endpoint akan:
1. membaca sheet `Rekap` menggunakan service account;
2. mendeteksi header/mapel/NIS/NISN/Nama tanpa posisi kolom hard-code;
3. memasukkan atau memperbarui siswa di Supabase;
4. menyimpan layout hasil deteksi di `rekap_layouts`;
5. menyimpan URL spreadsheet pada `classes.spreadsheet_url`.

Pastikan spreadsheet dibagikan ke email `GOOGLE_CLIENT_EMAIL` sebagai Editor.
