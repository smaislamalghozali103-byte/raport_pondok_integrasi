import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const required = [
  'APP_DATA_SPREADSHEET_ID',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY'
];
const missing = required.filter(k => !process.env[k]?.trim());

if (missing.length) {
  console.error('❌ ENV belum lengkap:', missing.join(', '));
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('❌ SESSION_SECRET minimal 32 karakter.');
  process.exit(1);
}
if (!process.env.ADMIN_TEACHER_IDS?.trim()) {
  console.warn('⚠️ ADMIN_TEACHER_IDS masih kosong.');
}
console.log('✅ Environment preflight OK — datastore: Google Sheets.');
