import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import { db } from '../lib/firebase-admin.js';
import fs from 'node:fs/promises';
const names=['teachers','units','classes','subjects','students','teacher_assignments'];
const out={createdAt:new Date().toISOString(),collections:{}};
for(const n of names){const s=await db.collection(n).get();out.collections[n]=s.docs.map(d=>({id:d.id,...d.data()}));}
function clean(v){if(v?.toDate)return v.toDate().toISOString();if(Array.isArray(v))return v.map(clean);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clean(x)]));return v;}
const text=JSON.stringify(clean(out),null,2);await fs.mkdir('backups',{recursive:true});const file=`backups/master-config-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;await fs.writeFile(file,text);console.log(file);
