# AI Master Data Sync — Groq

Tambahkan Environment Variables di Vercel:

- \`GROQ_API_KEY\` = satu API key Groq
- atau \`GROQ_API_KEYS\` = beberapa API key dipisahkan koma untuk failover
- opsional \`GROQ_MODEL\` = model prioritas
- opsional \`GROQ_MODELS\` = daftar model prioritas dipisahkan koma

Sistem memanggil endpoint model Groq untuk mengetahui model yang masih aktif. Jika model prioritas tidak aktif, sistem memilih model aktif berikutnya. Jika seluruh API key/model tidak tersedia, upload ditolak.

Contoh:
\`\`\`
GROQ_API_KEYS=gsk_xxx,gsk_yyy
GROQ_MODELS=openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile
\`\`\`

Alur:
1. Admin upload Markdown mapping.
2. Server membaca Google Sheet resmi.
3. Groq AI memetakan header secara dinamis dengan Structured Outputs.
4. Semua master divalidasi.
5. Jika ada kegagalan AI/parsing/referensi, proses berhenti sebelum sinkronisasi master.
6. Jika valid, Guru, Mapel, dan Wali Kelas ditulis ke Firestore.
7. Dashboard guru mengecek versi master backend setiap beberapa detik dan memuat ulang data terbaru tanpa localStorage.

API key jangan ditaruh di frontend atau GitHub.
