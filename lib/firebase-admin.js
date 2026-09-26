// Firebase/Firestore telah dilepas dari aplikasi.
// Semua operasi datastore aplikasi sekarang menggunakan Google Sheets.
// File ini dipertahankan sebagai compatibility layer agar route lama
// yang mengimpor "@/lib/firebase-admin" tidak perlu diubah satu per satu.

export { db, storeInfo } from './sheets-db.js';
