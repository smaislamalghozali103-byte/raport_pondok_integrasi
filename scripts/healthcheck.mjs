import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const required = [
  'APP_DATA_SPREADSHEET_ID',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'SESSION_SECRET'
];
const missing = required.filter(k => !process.env[k]?.trim());

if (missing.length) {
  console.error('Missing environment:', missing.join(', '));
  process.exit(1);
}
if (process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET minimal 32 karakter');
  process.exit(1);
}
console.log('Environment configuration: OK — datastore: Google Sheets');
