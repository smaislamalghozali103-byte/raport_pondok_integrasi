import json
import os
from data_part1 import PART1
from data_part2 import PART2
from data_mapel import MAPEL

os.makedirs("data", exist_ok=True)

# Combine students
all_raw_students = PART1 + PART2
print(f"Total students gathered: {len(all_raw_students)}")

siswa_list = []
for idx, item in enumerate(all_raw_students):
    s_id, nisn, name, kelas, sheet = item
    siswa_list.append({
        "id_siswa": s_id,
        "no": idx + 1,
        "nisn": nisn,
        "nama_siswa": name,
        "kelas": kelas,
        "sumber_sheet": sheet,
        "status": "AKTIF"
    })

siswa_output = {
    "version": "1.0",
    "source_file": "DATABASE UTAMA PTS GANJIL 26-27 - TERISI NISN(1).xlsx",
    "jumlah_siswa": len(siswa_list),
    "siswa": siswa_list
}

with open("data/master-siswa.json", "w", encoding="utf-8") as f:
    json.dump(siswa_output, f, ensure_ascii=False, indent=2)

# Build kelas
classes_dict = {}
for s in siswa_list:
    k = s["kelas"]
    if k not in classes_dict:
        classes_dict[k] = []
    classes_dict[k].append(s)

kelas_list = []
# Ensure stable ordering
for k_name, studs in classes_dict.items():
    kelas_list.append({
        "nama_kelas": k_name,
        "jumlah_siswa": len(studs),
        "siswa": studs
    })

kelas_output = {
    "version": "1.0",
    "jumlah_kelas": len(kelas_list),
    "kelas": kelas_list
}

with open("data/master-kelas.json", "w", encoding="utf-8") as f:
    json.dump(kelas_output, f, ensure_ascii=False, indent=2)

# Build mapel
mapel_list = []
for item in MAPEL:
    kode, nama, kelompok, status, unit = item
    mapel_list.append({
        "kode_mapel": kode,
        "nama_mapel": nama,
        "kelompok_kelas": kelompok,
        "status": status,
        "unit": unit
    })

mapel_output = {
    "version": "1.0",
    "source_file": "DATABASE UTAMA PTS GANJIL 26-27 - TERISI NISN(1).xlsx",
    "jumlah_mapel": len(mapel_list),
    "mapel": mapel_list
}

with open("data/master-mapel.json", "w", encoding="utf-8") as f:
    json.dump(mapel_output, f, ensure_ascii=False, indent=2)

print(f"Generated successfully: {len(siswa_list)} students, {len(kelas_list)} classes, {len(mapel_list)} subjects.")
