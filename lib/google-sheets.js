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

export function spreadsheetIdFromUrl(url){
  const value=String(url||'').trim();
  if(/^[a-zA-Z0-9-_]{20,}$/.test(value)) return value;
  const m=value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if(!m) throw new Error('Spreadsheet ID/URL Google Spreadsheet tidak valid.');
  return m[1];
}

export async function sheetsClient(){
  const {email,key}=credentials();
  const auth=new google.auth.JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']});
  return google.sheets({version:'v4',auth});
}

export async function readSheet(spreadsheetIdOrUrl,sheet='Rekap',range='A:ZZ'){
  const sheets=await sheetsClient();
  const id=spreadsheetIdFromUrl(spreadsheetIdOrUrl);
  const res=await sheets.spreadsheets.values.get({spreadsheetId:id,range:`'${sheet}'!${range}`,valueRenderOption:'UNFORMATTED_VALUE'});
  return {spreadsheetId:id,values:res.data.values||[]};
}

export async function readRekap(spreadsheetIdOrUrl,sheet='Rekap'){
  return readSheet(spreadsheetIdOrUrl,sheet,'A:ZZ');
}

export async function writeRekapCells(spreadsheetIdOrUrl,sheet,cells){
  if(!cells.length) return {updatedCells:0};
  const sheets=await sheetsClient(); const id=spreadsheetIdFromUrl(spreadsheetIdOrUrl);
  const data=cells.map(c=>({range:`'${sheet}'!${c.a1}`,values:[[c.value]]}));
  const res=await sheets.spreadsheets.values.batchUpdate({spreadsheetId:id,requestBody:{valueInputOption:'USER_ENTERED',data}});
  return {updatedCells:res.data.totalUpdatedCells||cells.length};
}
