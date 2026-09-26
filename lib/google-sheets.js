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


export async function spreadsheetMeta(spreadsheetIdOrUrl) {
  const { email, key } = credentials();
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const id = spreadsheetIdFromUrl(spreadsheetIdOrUrl);
  const res = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: 'spreadsheetId,properties(title),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))'
  });
  return {
    spreadsheetId: id,
    title: res.data.properties?.title || '',
    sheets: (res.data.sheets || []).map(s => s.properties)
  };
}

export async function readSheetCell(spreadsheetIdOrUrl, sheet = 'Rapot', a1 = 'I18') {
  const result = await readSheet(spreadsheetIdOrUrl, sheet, a1);
  return result.values?.[0]?.[0] ?? '';
}

export async function writeSheetCell(spreadsheetIdOrUrl, sheet, a1, value) {
  const sheets = await sheetsClient();
  const id = spreadsheetIdFromUrl(spreadsheetIdOrUrl);
  const res = await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `'${sheet}'!${a1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] }
  });
  return {
    updatedRange: res.data.updatedRange || `'${sheet}'!${a1}`,
    updatedCells: res.data.updatedCells || 1
  };
}

export async function exportSheetPdf(spreadsheetIdOrUrl, {
  sheetName = 'Rekap',
  rowStart = 0,
  rowEnd = null,
  colStart = 0,
  colEnd = null,
  portrait = true
} = {}) {
  const { email, key } = credentials();
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const id = spreadsheetIdFromUrl(spreadsheetIdOrUrl);

  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: id,
    fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
  });

  const target = (meta.data.sheets || []).find(
    s => String(s.properties?.title || '').trim() === String(sheetName || '').trim()
  ) || meta.data.sheets?.[0];

  if (!target?.properties) throw new Error('Sheet raport tidak ditemukan.');
  const props = target.properties;
  const gid = props.sheetId;
  const maxRows = Number(props.gridProperties?.rowCount || 1000);
  const maxCols = Number(props.gridProperties?.columnCount || 26);

  const r1 = Math.max(0, Number(rowStart) || 0);
  const r2 = Math.min(maxRows, rowEnd == null ? maxRows : Number(rowEnd));
  const c1 = Math.max(0, Number(colStart) || 0);
  const c2 = Math.min(maxCols, colEnd == null ? maxCols : Number(colEnd));

  const token = await auth.authorize();
  const params = new URLSearchParams({
    format: 'pdf',
    size: '5',
    fzr: 'true',
    portrait: portrait ? 'true' : 'false',
    scale: '4',
    horizontal_alignment: 'CENTER',
    vertical_alignment: 'MIDDLE',
    gridlines: 'false',
    printtitle: 'false',
    top_margin: '0.25',
    bottom_margin: '0.25',
    left_margin: '0.25',
    right_margin: '0.25',
    sheetnames: 'false',
    pagenum: 'UNDEFINED',
    attachment: 'true',
    gid: String(gid),
    r1: String(r1),
    c1: String(c1),
    r2: String(r2),
    c2: String(c2)
  });

  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${id}/export?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Sheets gagal mengekspor PDF (${response.status}). ${text.slice(0, 300)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    spreadsheetId: id,
    sheetName: props.title,
    gid,
    rowStart: r1,
    rowEnd: r2,
    colStart: c1,
    colEnd: c2
  };
}
