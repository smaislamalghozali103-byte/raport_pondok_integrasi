export function normalize(v) {
  return String(v ?? '').toLowerCase().normalize('NFKC').replace(/[\n\r]+/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function colLetter(n) { let s=''; n++; while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)} return s; }
function compact(v){return normalize(v).replace(/\b(mata|pelajaran|mapel)\b/g,'').replace(/\s+/g,' ').trim()}
function similarity(a,b){a=compact(a);b=compact(b);if(!a||!b)return 0;if(a===b)return 1;if(a.includes(b)||b.includes(a))return Math.min(a.length,b.length)/Math.max(a.length,b.length);const A=new Set(a.split(' ')),B=new Set(b.split(' '));const inter=[...A].filter(x=>B.has(x)).length;return inter/Math.max(A.size,B.size)}
function bestColumn(header, target){let best={c:-1,score:0};for(let c=0;c<header.length;c++){const score=similarity(header[c],target);if(score>best.score)best={c,score}}return best.score>=0.70?best.c:-1}
function headerScore(cell){return /^(nama|nama siswa|nama santri|siswa|nama peserta didik|nisn|nis|no nisn|no nis|nomor nisn|nomor nis)$/i.test(cell)?2:0}
export function detectRekap(values, subjects=[]) {
  const known=subjects.map(x=>typeof x==='string'?x:x.name).filter(Boolean);
  let best={row:-1,count:0,identity:0};
  for(let r=0;r<Math.min(values.length,150);r++){
    const cells=(values[r]||[]).map(normalize);let count=0;for(const s of known) if(bestColumn(cells,s)>=0) count++;
    const identity=cells.reduce((n,c)=>n+headerScore(c),0);
    if(count>best.count || (count===best.count && identity>best.identity)) best={row:r,count,identity};
  }
  if(best.row<0 || (best.count===0 && best.identity===0)) throw new Error('Header pada sheet Rekap belum dapat dideteksi.');
  const header=(values[best.row]||[]).map(normalize);
  let noCol=header.findIndex(x=>['no','nomor','no urut','nomor urut'].includes(x));
  let nameCol=header.findIndex(x=>['nama','nama siswa','nama santri','siswa','nama peserta didik'].includes(x));
  if(nameCol<0) nameCol=header.findIndex(x=>x.includes('nama'));
  let idCol=header.findIndex(x=>['nisn','no nisn','nomor nisn'].includes(x));
  if(idCol<0) idCol=header.findIndex(x=>x.includes('nisn'));
  if(nameCol<0) throw new Error('Kolom Nama pada Rekap belum dapat dideteksi.');
  const subjectColumns={};
  for(const s of known){const c=bestColumn(header,s);if(c>=0)subjectColumns[normalize(s)]={column:c,a1Column:colLetter(c),name:s};}
  const students=[];
  for(let r=best.row+1;r<values.length;r++){
    const row=values[r]||[];const no=noCol>=0?String(row[noCol]??'').trim():String(r-best.row).trim();const name=String(row[nameCol]??'').trim();const nisn=idCol>=0?String(row[idCol]??'').trim():'';
    if(!name && !nisn) continue;
    const bad=/^(jumlah|total|rata rata|rata-rata|ranking|peringkat|keterangan|catatan)$/i.test(name);
    if(bad) continue;
    students.push({row:r,name,nisn,nis});
  }
  return {headerRow:best.row,noColumn:noCol,nameColumn:nameCol,idColumn:idCol,subjectColumns,students};
}
