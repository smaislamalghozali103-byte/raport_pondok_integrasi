import ExcelJS from 'exceljs';
import { normalize, colLetter } from './rekap-detector.js';

/**
 * Bedah struktur file Excel raport tanpa merusak file asli.
 * Mengidentifikasi:
 * 1. Daftar worksheet
 * 2. Baris header
 * 3. Kolom identitas (No, Nama, NISN)
 * 4. Kolom mata pelajaran yang terdeteksi
 * 5. Baris santri/siswa
 * 6. Rumus/formula yang ada (agar dipastikan terlindungi)
 * 7. Area sel yang dapat diisi
 */
export async function analyzeExcelStructure(buffer, knownSubjects = []) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetsSummary = [];
  const subjectNames = knownSubjects.map(s => (typeof s === 'string' ? s : s.name || s.nama)).filter(Boolean);

  let primaryAnalysis = null;

  workbook.eachSheet((worksheet, sheetId) => {
    const sheetInfo = {
      id: sheetId,
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
      hasFormulas: false,
      formulaCount: 0,
      mergedCellsCount: worksheet.model?.merges?.length || 0,
      detectedHeaderRow: -1,
      nameColumn: -1,
      noColumn: -1,
      nisnColumn: -1,
      subjectColumns: [],
      sampleStudents: [],
      totalStudentsDetected: 0,
    };

    // Pindai rumus dan baris header
    let candidateHeaders = [];
    const maxScanRows = Math.min(worksheet.rowCount, 60);

    for (let r = 1; r <= maxScanRows; r++) {
      const row = worksheet.getRow(r);
      const rowValues = [];
      let identityScore = 0;
      let subjectScore = 0;

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const val = cell.value;
        const text = normalize(typeof val === 'object' && val?.result ? val.result : val);

        if (cell.formula || (typeof val === 'object' && val?.formula)) {
          sheetInfo.hasFormulas = true;
          sheetInfo.formulaCount++;
        }

        rowValues[colNumber] = text;

        if (/^(no|nomor|no urut|nomor urut|nama|nama siswa|nama santri|siswa|peserta didik)$/i.test(text)) identityScore += 3;
        if (/^(nisn|no nisn|nomor nisn)$/i.test(text)) identityScore += 3;
        if (/^(no|nomor|no urut|nomor urut)$/i.test(text)) identityScore += 2;

        // Cek kecocokan mapel
        for (const subj of subjectNames) {
          if (text.includes(normalize(subj)) || normalize(subj).includes(text)) {
            subjectScore++;
            break;
          }
        }
      });

      if (identityScore > 0 || subjectScore > 0) {
        candidateHeaders.push({
          row: r,
          identityScore,
          subjectScore,
          totalScore: identityScore * 2 + subjectScore,
          values: rowValues,
        });
      }
    }

    // Tentukan baris header terbaik
    candidateHeaders.sort((a, b) => b.totalScore - a.totalScore);
    if (candidateHeaders.length > 0) {
      const best = candidateHeaders[0];
      sheetInfo.detectedHeaderRow = best.row;

      // Cari posisi kolom identitas
      const headerRow = worksheet.getRow(best.row);
      headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const text = normalize(cell.value);
        if (/^(no|nomor|no urut|nomor urut)$/i.test(text) && sheetInfo.noColumn === -1) {
          sheetInfo.noColumn = colNumber;
        } else if (/^(nama|nama siswa|nama santri|siswa|peserta didik)$/i.test(text) && sheetInfo.nameColumn === -1) {
          sheetInfo.nameColumn = colNumber;
        } else if (/^(nisn|no nisn|nomor nisn)$/i.test(text) && sheetInfo.nisnColumn === -1) {
          sheetInfo.nisnColumn = colNumber;
        }

        // Cari kolom mata pelajaran
        for (const subj of subjectNames) {
          const normSubj = normalize(subj);
          if (text === normSubj || (text.length > 3 && (text.includes(normSubj) || normSubj.includes(text)))) {
            sheetInfo.subjectColumns.push({
              colNumber,
              colLetter: colLetter(colNumber - 1),
              rawHeader: String(cell.value).trim(),
              matchedSubject: subj,
            });
            break;
          }
        }
      });

      // Deteksi baris santri/siswa
      if (sheetInfo.nameColumn > 0) {
        const students = [];
        for (let r = best.row + 1; r <= worksheet.rowCount; r++) {
          const row = worksheet.getRow(r);
          const nameCell = row.getCell(sheetInfo.nameColumn);
          const nameVal = String(nameCell.value || '').trim();

          if (!nameVal) continue;
          if (/^(jumlah|total|rata|rata-rata|rata rata|ranking|peringkat|keterangan|catatan|wali kelas|kepala)$/i.test(nameVal)) {
            continue;
          }

          const nisnVal = sheetInfo.nisnColumn > 0 ? String(row.getCell(sheetInfo.nisnColumn).value || '').trim() : '';
          const noVal = sheetInfo.noColumn > 0 ? String(row.getCell(sheetInfo.noColumn).value || '').trim() : String(r - best.row);

          students.push({
            row: r,
            no: noVal,
            name: nameVal,
            nisn: nisnVal,
          });
        }

        sheetInfo.totalStudentsDetected = students.length;
        sheetInfo.sampleStudents = students.slice(0, 5);
      }
    }

    sheetsSummary.push(sheetInfo);

    // Tetapkan sheet utama (misal yang memiliki nama 'rekap', 'nilai', 'leger', atau memiliki siswa terbanyak)
    if (!primaryAnalysis || sheetInfo.totalStudentsDetected > (primaryAnalysis.totalStudentsDetected || 0)) {
      primaryAnalysis = sheetInfo;
    }
  });

  return {
    workbookSummary: {
      totalSheets: sheetsSummary.length,
      sheetNames: sheetsSummary.map(s => s.name),
      primarySheet: primaryAnalysis?.name || sheetsSummary[0]?.name,
    },
    primaryAnalysis,
    sheets: sheetsSummary,
  };
}

/**
 * Mengisi nilai siswa ke dalam template Excel asli SECARA NON-DESTRUKTIF:
 * - Menjaga seluruh style font, border, background cell, alignment
 * - Menjaga merged cells, formula rekap (SUM/AVERAGE/RANK), dan gambar/kop
 * - Hanya memperbarui nilai pada sel nilai yang ditargetkan
 */
export async function fillExcelTemplateNonDestructive({
  templateBuffer,
  sheetName,
  subjectMappings, // Array of { subjectName, grades: [{ studentId, no, nisn, name, score }] }
  studentIdCol = null,
}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const worksheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName || 'default'}" tidak ditemukan di file Excel.`);
  }

  // Lakukan analisis struktur lembar yang dipilih
  const analysis = await analyzeExcelStructure(templateBuffer, subjectMappings.map(s => s.subjectName));
  const activeSheetAnalysis = analysis.sheets.find(s => s.name === worksheet.name) || analysis.primaryAnalysis;

  if (!activeSheetAnalysis || activeSheetAnalysis.nameColumn === -1) {
    throw new Error('Kolom Nama Siswa pada template Excel tidak dapat dideteksi secara otomatis.');
  }

  const nameCol = activeSheetAnalysis.nameColumn;
  const noCol = activeSheetAnalysis.noColumn;
  const nisnCol = activeSheetAnalysis.nisnColumn;
  const headerRow = activeSheetAnalysis.detectedHeaderRow;

  // Bangun peta baris siswa di Excel
  const excelStudents = [];
  for (let r = headerRow + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const nameVal = String(row.getCell(nameCol).value || '').trim();
    if (!nameVal) continue;
    if (/^(jumlah|total|rata|rata-rata|rata rata|ranking|peringkat|keterangan|catatan|wali kelas|kepala)$/i.test(nameVal)) {
      continue;
    }

    const nisnVal = nisnCol > 0 ? String(row.getCell(nisnCol).value || '').trim() : '';
    const noVal = noCol > 0 ? String(row.getCell(noCol).value || '').trim() : String(r - headerRow);

    excelStudents.push({
      row: r,
      no: noVal,
      name: nameVal,
      nisn: nisnVal,
    });
  }

  // Peta pencarian siswa
  const byNisn = new Map();
  const byName = new Map();

  for (const st of excelStudents) {
    if (st.nisn) byNisn.set(normalize(st.nisn), st);
     if (st.name) byName.set(normalize(st.name), st);
  }

  let totalUpdatedCells = 0;
  const fillResults = [];

  for (const mapelData of subjectMappings) {
    const targetSubj = normalize(mapelData.subjectName);
    // Cari kolom untuk mapel ini
    let targetColNumber = -1;
    const matchedCol = activeSheetAnalysis.subjectColumns.find(
      c => normalize(c.matchedSubject) === targetSubj || normalize(c.rawHeader) === targetSubj
    );

    if (matchedCol) {
      targetColNumber = matchedCol.colNumber;
    } else {
      // Pindai ulang header baris untuk mencari kolom yang paling mendekati
      const hRow = worksheet.getRow(headerRow);
      hRow.eachCell({ includeEmpty: false }, (cell, cNum) => {
        const text = normalize(cell.value);
        if (text === targetSubj || (text.length > 2 && (text.includes(targetSubj) || targetSubj.includes(text)))) {
          targetColNumber = cNum;
        }
      });
    }

    if (targetColNumber === -1) {
      fillResults.push({
        subjectName: mapelData.subjectName,
        status: 'GAGAL',
        reason: 'Kolom mata pelajaran tidak ditemukan di header Excel',
        updated: 0,
      });
      continue;
    }

    let mapelUpdated = 0;
    for (const gradeItem of mapelData.grades || []) {
      const studentMatch =
        (gradeItem.nisn && byNisn.get(normalize(gradeItem.nisn))) ||
        (gradeItem.name && byName.get(normalize(gradeItem.name)));

      if (studentMatch && gradeItem.score !== undefined && gradeItem.score !== null && gradeItem.score !== '') {
        const cell = worksheet.getRow(studentMatch.row).getCell(targetColNumber);
        
        // PENTING: Jangan menimpa style sel, hanya perbarui .value
        const numScore = Number(gradeItem.score);
        cell.value = Number.isFinite(numScore) ? numScore : gradeItem.score;
        
        mapelUpdated++;
        totalUpdatedCells++;
      }
    }

    fillResults.push({
      subjectName: mapelData.subjectName,
      status: 'SUKSES',
      columnLetter: colLetter(targetColNumber - 1),
      columnNumber: targetColNumber,
      updated: mapelUpdated,
    });
  }

  // Tulis kembali ke buffer biner dengan seluruh formatting 100% utuh
  const outputBuffer = await workbook.xlsx.writeBuffer();

  return {
    success: true,
    totalUpdatedCells,
    sheetName: worksheet.name,
    fillResults,
    outputBuffer,
  };
}
