import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { db } from '../lib/firebase-admin.js';
const root=process.cwd();
const file=process.env.MASTER_XLSX||path.join(root,'data','MASTER_GURU_MAPEL_PER_UNIT_HASIL_REKAP(1).xlsx');
const schoolYear=process.env.SCHOOL_YEAR||'2026-2027';
if(!fs.existsSync(file)) throw new Error(`File master tidak ditemukan: ${file}`);
const wb=XLSX.readFile(file,{cellDates:false});
const rows=s=>XLSX.utils.sheet_to_json(wb.Sheets[s],{defval:null});
const pick=(o,names)=>{for(const n of names){if(o[n]!=null&&String(o[n]).trim())return String(o[n]).trim();}const w=names.map(x=>x.toLowerCase());for(const [k,v] of Object.entries(o)){if(v!=null&&w.includes(String(k).trim().toLowerCase()))return String(v).trim();}return ''};
const norm=s=>String(s??'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
async function writeCollection(name,items){
  for(let i=0;i<items.length;i+=400){
    const b=db.batch();
    for(const x of items.slice(i,i+400)) b.set(db.collection(name).doc(x.id),x.data,{merge:true});
    try {
      await b.commit();
    } catch(err) {
      if (err.code === 5 || String(err.message).includes('NOT_FOUND')) {
        console.error('\n❌ ERROR 5 NOT_FOUND: Database Cloud Firestore belum dibuat atau belum aktif!');
        console.error(`👉 Buka browser ke: https://console.firebase.google.com/project/${process.env.FIREBASE_PROJECT_ID || 'raport-integrasi-pondok'}/firestore`);
        console.error('👉 Klik tombol "Create database" (Pilih Database ID: (default) dan lokasi misal: asia-southeast2).\n');
      }
      throw err;
    }
  }
}
const unitRows=rows('MASTER UNIT'),mapelRows=rows('MASTER MAPEL'),guruRows=rows('MASTER GURU'),kelasRows=rows('MASTER KELAS'),tugasRows=rows('PENUGASAN GURU');
const units=unitRows.map(r=>({code:pick(r,['Kode Unit','Unit','Kode']),name:pick(r,['Nama Unit','Unit','Nama']),status:pick(r,['Status'])||'AKTIF'})).filter(x=>x.code||x.name);
const unitMap=new Map(); await writeCollection('units',units.map(u=>{const id=u.code||norm(u.name).replaceAll(' ','_').toUpperCase();unitMap.set(norm(u.code),id);unitMap.set(norm(u.name),id);return{id,data:{id,code:u.code||id,name:u.name||u.code,status:u.status}}}));
const subjects=mapelRows.map(r=>{const code=pick(r,['Kode Mapel','Kode','Kode Mata Pelajaran']),name=pick(r,['Mata Pelajaran','Nama Mapel','Mapel']),unit=pick(r,['Unit','Kode Unit']);if(!name)return null;const id=code||norm(name).replaceAll(' ','_').toUpperCase();return{id,data:{id,code:id,name,unit:unit||'',unitId:unitMap.get(norm(unit))||null,status:pick(r,['Status'])||'AKTIF'}}}).filter(Boolean);await writeCollection('subjects',subjects);
const teachers=guruRows.map(r=>{const code=pick(r,['ID Guru','ID','Kode Guru']),name=pick(r,['Nama Guru','Nama']),unit=pick(r,['Unit','Kode Unit']);if(!name)return null;const id=code||norm(name).replaceAll(' ','_').toUpperCase();return{id,data:{id,teacherId:id,teacherCode:code||id,name,fullName:name,unit:unit||'',unitId:unitMap.get(norm(unit))||null,status:pick(r,['Status'])||'AKTIF',pinConfigured:false}}}).filter(Boolean);await writeCollection('teachers',teachers);
const classes=kelasRows.map(r=>{const code=pick(r,['ID Kelas','ID','Kode Kelas']),name=pick(r,['Nama Kelas','Kelas']),unit=pick(r,['Unit','Kode Unit']);if(!name)return null;const id=code||norm(name).replaceAll(' ','_').toUpperCase();return{id,data:{id,code:id,name,jenjang:unit||'',unit:unit||'',unitId:unitMap.get(norm(unit))||null,schoolYear,status:pick(r,['Status'])||'AKTIF',spreadsheetId:'',spreadsheetSheet:'Rekap'}}}).filter(Boolean);await writeCollection('classes',classes);
console.log(`Unit ${units.length} | Guru ${teachers.length} | Mapel ${subjects.length} | Kelas ${classes.length}`);console.log('IMPORT FIREBASE SELESAI.');
