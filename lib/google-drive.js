import { google } from 'googleapis';

import fs from 'node:fs';
import path from 'node:path';

function credentials(){
  const saPath = path.join(process.cwd(), 'service-account.json');
  if (fs.existsSync(saPath)) {
    try {
      const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      if (sa.client_email && sa.private_key) {
        return { email: sa.client_email, key: sa.private_key };
      }
    } catch (_) {}
  }
  const email=process.env.GOOGLE_CLIENT_EMAIL;
  let key=(process.env.GOOGLE_PRIVATE_KEY||'').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\n/g, '\n').replace(/\r/g, '').trim() + '\n';
  if(!email || !key) throw new Error('GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY belum diatur.');
  return {email,key};
}

async function driveClient(){
  const {email,key}=credentials();
  const auth=new google.auth.JWT({
    email,
    key,
    scopes:['https://www.googleapis.com/auth/drive']
  });
  return google.drive({version:'v3',auth});
}

const clean=v=>String(v??'').trim();
const safeName=v=>clean(v).replace(/[\\/:*?"<>|#%{}~&]/g,'-').replace(/\s+/g,' ').trim().slice(0,150)||'Arsip';

async function findOrCreateFolder(drive,name,parentId){
  const q=[
    "trashed = false",
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${String(name).replace(/'/g,"\\'")}'`
  ];
  if(parentId) q.push(`'${parentId}' in parents`);
  const found=await drive.files.list({
    q:q.join(' and '),
    fields:'files(id,name)',
    pageSize:10,
    includeItemsFromAllDrives:true,
    supportsAllDrives:true
  });
  if(found.data.files?.[0]) return found.data.files[0].id;
  const created=await drive.files.create({
    requestBody:{name:safeName(name),mimeType:'application/vnd.google-apps.folder',...(parentId?{parents:[parentId]}:{})},
    fields:'id,name',supportsAllDrives:true
  });
  return created.data.id;
}

export async function archiveSpreadsheet({spreadsheetId,schoolYear,unitName,className,batchId,sourceName}){
  const root=clean(process.env.GOOGLE_DRIVE_ARCHIVE_FOLDER_ID);
  if(!root) throw new Error('GOOGLE_DRIVE_ARCHIVE_FOLDER_ID belum diatur.');
  if(!spreadsheetId) throw new Error('spreadsheetId wajib untuk arsip Google Drive.');

  const drive=await driveClient();
  const yearFolder=await findOrCreateFolder(drive,safeName(schoolYear||'Tahun Ajaran'),root);
  const unitFolder=await findOrCreateFolder(drive,safeName(unitName||'Tanpa Unit'),yearFolder);
  const classFolder=await findOrCreateFolder(drive,safeName(className||'Tanpa Kelas'),unitFolder);

  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const name=safeName(`Raport Integrasi - ${className||'Kelas'} - ${schoolYear||''} - ${stamp}`);
  const copied=await drive.files.copy({
    fileId:spreadsheetId,
    requestBody:{name,parents:[classFolder],description:`Arsip otomatis Raport Integrasi. Batch: ${batchId||'-'}. Sumber: ${sourceName||spreadsheetId}.`},
    fields:'id,name,mimeType,webViewLink,parents',
    supportsAllDrives:true
  });
  return {archiveId:copied.data.id,archiveName:copied.data.name,archiveUrl:copied.data.webViewLink||null,folderId:classFolder};
}
