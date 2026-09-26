import { google } from 'googleapis';

const CACHE_TTL_MS = 5000;
const DEFAULT_SHEET = process.env.APP_DATA_SHEET || 'APP_DB';

let cachedRows = null;
let cachedAt = 0;
let spreadsheetIdCache = null;
let sheetReadyPromise = null;
let writeQueue = Promise.resolve();

function clean(value) {
  return String(value ?? '').trim();
}

function getSpreadsheetId() {
  const id = clean(
    process.env.APP_DATA_SPREADSHEET_ID ||
    process.env.GOOGLE_SHEETS_APP_DATA_ID ||
    process.env.MASTER_APP_SPREADSHEET_ID
  );
  if (!id) {
    throw new Error(
      'APP_DATA_SPREADSHEET_ID belum dikonfigurasi. Buat satu Google Spreadsheet khusus untuk data aplikasi dan masukkan ID-nya ke Environment Variables Vercel.'
    );
  }
  spreadsheetIdCache = id;
  return id;
}

function credentials() {
  const email = clean(process.env.GOOGLE_CLIENT_EMAIL);
  let key = clean(process.env.GOOGLE_PRIVATE_KEY);

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, '\n').replace(/\r/g, '').trim();

  if (!email || !key) {
    throw new Error('GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY belum diatur.');
  }

  return { email, key };
}

function sheets() {
  const { email, key } = credentials();
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function ensureSheet() {
  if (sheetReadyPromise) return sheetReadyPromise;

  sheetReadyPromise = (async () => {
    const api = sheets();
    const spreadsheetId = getSpreadsheetId();
    const meta = await api.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title))'
    });

    const exists = (meta.data.sheets || []).some(
      item => clean(item.properties?.title) === DEFAULT_SHEET
    );

    if (!exists) {
      await api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: DEFAULT_SHEET } } }]
        }
      });
    }

    const header = await api.spreadsheets.values.get({
      spreadsheetId,
      range: `'${DEFAULT_SHEET}'!A1:D1`
    });

    const values = header.data.values || [];
    if (!values.length || values[0].join('|') !== 'collection|id|data_json|updated_at') {
      await api.spreadsheets.values.update({
        spreadsheetId,
        range: `'${DEFAULT_SHEET}'!A1:D1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['collection', 'id', 'data_json', 'updated_at']]
        }
      });
    }

    return true;
  })().catch(error => {
    sheetReadyPromise = null;
    throw error;
  });

  return sheetReadyPromise;
}

function parseRows(values) {
  return (values || []).slice(1).map((row, index) => {
    let data = {};
    try {
      data = row[2] ? JSON.parse(row[2]) : {};
    } catch {
      data = {};
    }

    return {
      rowNumber: index + 2,
      collection: clean(row[0]),
      id: clean(row[1]),
      data: data && typeof data === 'object' ? data : {}
    };
  }).filter(row => row.collection && row.id);
}

async function loadRows(force = false) {
  await ensureSheet();

  if (!force && cachedRows && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedRows;
  }

  const api = sheets();
  const spreadsheetId = getSpreadsheetId();
  const result = await api.spreadsheets.values.get({
    spreadsheetId,
    range: `'${DEFAULT_SHEET}'!A:D`
  });

  cachedRows = parseRows(result.data.values || []);
  cachedAt = Date.now();
  return cachedRows;
}

function clone(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function serializeData(data) {
  return JSON.stringify(clone(data));
}

function matchesFilter(data, filter) {
  const actual = data?.[filter.field];
  const wanted = filter.value;

  switch (filter.op) {
    case '==':
    case '===':
      return actual === wanted || String(actual ?? '') === String(wanted ?? '');
    case '!=':
      return !(actual === wanted || String(actual ?? '') === String(wanted ?? ''));
    case '<':
      return actual < wanted;
    case '<=':
      return actual <= wanted;
    case '>':
      return actual > wanted;
    case '>=':
      return actual >= wanted;
    default:
      return true;
  }
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;

  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
    return na - nb;
  }

  return String(a).localeCompare(String(b), 'id');
}

class SheetsDocRef {
  constructor(store, collectionName, id) {
    this.store = store;
    this.collectionName = collectionName;
    this.id = clean(id) || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async get() {
    const rows = await loadRows();
    const found = rows.find(
      row => row.collection === this.collectionName && row.id === this.id
    );

    return {
      id: this.id,
      exists: Boolean(found),
      data: () => found ? clone(found.data) : undefined
    };
  }

  async set(data, options = {}) {
    return this.store.writeOne(this.collectionName, this.id, data, options);
  }

  async update(data) {
    const snap = await this.get();
    if (!snap.exists) {
      throw new Error(`Dokumen ${this.collectionName}/${this.id} tidak ditemukan.`);
    }
    return this.store.writeOne(this.collectionName, this.id, data, { merge: true });
  }

  async delete() {
    return this.store.deleteOne(this.collectionName, this.id);
  }
}

class SheetsQuery {
  constructor(store, collectionName, filters = [], orders = [], limitCount = null) {
    this.store = store;
    this.collectionName = collectionName;
    this.filters = filters;
    this.orders = orders;
    this.limitCount = limitCount;
  }

  where(field, op, value) {
    return new SheetsQuery(
      this.store,
      this.collectionName,
      [...this.filters, { field, op, value }],
      this.orders,
      this.limitCount
    );
  }

  orderBy(field, direction = 'asc') {
    return new SheetsQuery(
      this.store,
      this.collectionName,
      this.filters,
      [...this.orders, { field, direction }],
      this.limitCount
    );
  }

  limit(count) {
    return new SheetsQuery(
      this.store,
      this.collectionName,
      this.filters,
      this.orders,
      Number(count)
    );
  }

  async get() {
    let rows = (await loadRows())
      .filter(row => row.collection === this.collectionName)
      .filter(row => this.filters.every(filter => matchesFilter(row.data, filter)));

    for (const order of this.orders) {
      rows.sort((a, b) => {
        const result = compareValues(a.data?.[order.field], b.data?.[order.field]);
        return String(order.direction).toLowerCase() === 'desc' ? -result : result;
      });
    }

    if (this.limitCount != null) {
      rows = rows.slice(0, Math.max(0, this.limitCount));
    }

    const docs = rows.map(row => ({
      id: row.id,
      exists: true,
      data: () => clone(row.data)
    }));

    return {
      empty: docs.length === 0,
      size: docs.length,
      docs
    };
  }

  count() {
    return {
      get: async () => {
        const snap = await this.get();
        return { data: () => ({ count: snap.size }) };
      }
    };
  }

  doc(id) {
    return new SheetsDocRef(this.store, this.collectionName, id);
  }
}

class SheetsBatch {
  constructor(store) {
    this.store = store;
    this.operations = [];
  }

  set(ref, data, options = {}) {
    this.operations.push({ type: 'set', ref, data, options });
    return this;
  }

  update(ref, data) {
    this.operations.push({ type: 'set', ref, data, options: { merge: true } });
    return this;
  }

  delete(ref) {
    this.operations.push({ type: 'delete', ref });
    return this;
  }

  async commit() {
    return this.store.commitBatch(this.operations);
  }
}

class SheetsStore {
  collection(name) {
    return new SheetsQuery(this, clean(name));
  }

  batch() {
    return new SheetsBatch(this);
  }

  async writeOne(collection, id, data, options = {}) {
    return enqueueWrite(async () => {
      const rows = await loadRows(true);
      const index = rows.findIndex(
        row => row.collection === collection && row.id === id
      );

      const current = index >= 0 ? rows[index].data : {};
      const next = options.merge ? { ...current, ...clone(data) } : clone(data);
      const now = new Date().toISOString();

      const api = sheets();
      const spreadsheetId = getSpreadsheetId();

      if (index >= 0) {
        const rowNumber = rows[index].rowNumber;
        await api.spreadsheets.values.update({
          spreadsheetId,
          range: `'${DEFAULT_SHEET}'!A${rowNumber}:D${rowNumber}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[collection, id, serializeData(next), now]]
          }
        });
      } else {
        await api.spreadsheets.values.append({
          spreadsheetId,
          range: `'${DEFAULT_SHEET}'!A:D`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [[collection, id, serializeData(next), now]]
          }
        });
      }

      cachedRows = null;
      cachedAt = 0;

      return { writeTime: new Date() };
    });
  }

  async deleteOne(collection, id) {
    return enqueueWrite(async () => {
      const rows = await loadRows(true);
      const index = rows.findIndex(
        row => row.collection === collection && row.id === id
      );

      if (index < 0) return { writeTime: new Date() };

      const api = sheets();
      const spreadsheetId = getSpreadsheetId();
      const rowNumber = rows[index].rowNumber;

      const meta = await api.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title))'
      });
      const sheet = (meta.data.sheets || []).find(
        item => clean(item.properties?.title) === DEFAULT_SHEET
      );
      if (!sheet?.properties?.sheetId) {
        throw new Error(`Sheet ${DEFAULT_SHEET} tidak ditemukan.`);
      }

      await api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1,
                endIndex: rowNumber
              }
            }
          }]
        }
      });

      cachedRows = null;
      cachedAt = 0;
      return { writeTime: new Date() };
    });
  }

  async commitBatch(operations) {
    if (!operations.length) return [];

    return enqueueWrite(async () => {
      const rows = await loadRows(true);
      const rowMap = new Map(
        rows.map((row, index) => [
          `${row.collection}::${row.id}`,
          { ...row, arrayIndex: index }
        ])
      );

      const valuesUpdates = [];
      const appends = [];
      const now = new Date().toISOString();

      for (const operation of operations) {
        const collection = operation.ref.collectionName;
        const id = operation.ref.id;
        const key = `${collection}::${id}`;
        const current = rowMap.get(key);
        const next = operation.type === 'delete'
          ? null
          : (operation.options?.merge
            ? { ...(current?.data || {}), ...clone(operation.data) }
            : clone(operation.data));

        if (operation.type === 'delete') {
          if (current) {
            valuesUpdates.push({
              range: `'${DEFAULT_SHEET}'!A${current.rowNumber}:D${current.rowNumber}`,
              values: [['', '', '', '']]
            });
          }
          continue;
        }

        if (current) {
          valuesUpdates.push({
            range: `'${DEFAULT_SHEET}'!A${current.rowNumber}:D${current.rowNumber}`,
            values: [[collection, id, serializeData(next), now]]
          });
          current.data = next;
        } else {
          appends.push([collection, id, serializeData(next), now]);
          rowMap.set(key, {
            collection,
            id,
            data: next,
            rowNumber: rows.length + appends.length
          });
        }
      }

      const api = sheets();
      const spreadsheetId = getSpreadsheetId();

      if (valuesUpdates.length) {
        await api.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: valuesUpdates
          }
        });
      }

      if (appends.length) {
        await api.spreadsheets.values.append({
          spreadsheetId,
          range: `'${DEFAULT_SHEET}'!A:D`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: appends }
        });
      }

      cachedRows = null;
      cachedAt = 0;

      return operations.map(() => ({ writeTime: new Date() }));
    });
  }
}

function enqueueWrite(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => undefined);
  return next;
}

export const db = new SheetsStore();
export const storeInfo = {
  provider: 'google-sheets',
  spreadsheetId: () => getSpreadsheetId(),
  sheet: DEFAULT_SHEET
};
