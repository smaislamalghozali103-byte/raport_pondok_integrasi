import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import fs from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function formatPrivateKey(key) {
  if (!key) return '';
  let str = String(key).trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1);
  }
  str = str.replace(/\\n/g, '\n').replace(/\r/g, '');
  return str.trim() + '\n';
}

function getFirebaseDb() {
  if (!getApps().length) {
    const saPath = path.join(process.cwd(), 'service-account.json');
    if (fs.existsSync(saPath)) {
      try {
        const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
        if (sa.project_id && sa.private_key && sa.client_email) {
          initializeApp({ credential: cert(sa) });
          return getFirestore();
        }
      } catch (e) {
        console.warn('Gagal membaca service-account.json, fallback ke environment:', e.message);
      }
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY);

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        `Firebase Admin credential belum lengkap: projectId=${Boolean(projectId)}, clientEmail=${Boolean(clientEmail)}, privateKey=${Boolean(privateKey)}`
      );
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return getFirestore();
}

export const db = new Proxy({}, {
  get(_target, prop) {
    const firestore = getFirebaseDb();
    const value = firestore[prop];
    return typeof value === 'function' ? value.bind(firestore) : value;
  }
});
