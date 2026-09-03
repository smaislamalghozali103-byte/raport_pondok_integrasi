import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
const required = ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','SESSION_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) { console.error('Missing environment:', missing.join(', ')); process.exit(1); }
if (process.env.SESSION_SECRET.length < 32) { console.error('SESSION_SECRET minimal 32 karakter'); process.exit(1); }
console.log('Environment configuration: OK');
