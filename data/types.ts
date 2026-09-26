export interface StudentRecord {
  id: string;
  no: number;
  classId: string;
  nisn?: string;
  nis?: string;
  name: string;
  fullName?: string;
  schoolType?: string;
  scores?: Record<string, number>;
  keterangan?: string;
  [key: string]: any;
}

export interface Subject {
  id: string;
  name: string;
  [key: string]: any;
}

export interface SchoolConfig {
  [key: string]: any;
}

export interface ClassItem {
  id: string;
  nameLatin?: string;
  nameAr?: string;
  [key: string]: any;
}