import { base64Bytes, parseStoredRecord, safeLogId, type AILogRecord, type StoredSize } from './aiLog';

/*
 * Browser version of aiLogStore.ts: the AI answer log in its own IndexedDB database
 * (`openplate-ai-log`), records and photos in separate object stores. Kept apart from the app's
 * main database so it can never end up in the store or a backup. Nothing leaves the device until
 * the user exports the log.
 */

const DB_NAME = 'openplate-ai-log';
const RECORDS = 'records';
const PHOTOS = 'photos';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not allow storing the AI log.'));
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(RECORDS);
        req.result.createObjectStore(PHOTOS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => () => T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const result = fn(t);
    t.oncomplete = () => resolve(result());
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Storage transaction aborted'));
  });
}

export async function saveLogRecord(record: AILogRecord): Promise<void> {
  if (!safeLogId(record.id)) throw new Error('Invalid log id');
  await tx([RECORDS], 'readwrite', (t) => {
    t.objectStore(RECORDS).put(JSON.stringify(record), record.id);
    return () => undefined;
  });
}

export async function saveLogPhotos(id: string, photos: string[]): Promise<void> {
  if (!safeLogId(id)) throw new Error('Invalid log id');
  await tx([PHOTOS], 'readwrite', (t) => {
    t.objectStore(PHOTOS).put(photos, id);
    return () => undefined;
  });
}

export async function readLogRecords(): Promise<AILogRecord[]> {
  const values = await tx([RECORDS], 'readonly', (t) => {
    const req = t.objectStore(RECORDS).getAll();
    return () => req.result as unknown[];
  });
  return values.map((v) => (typeof v === 'string' ? parseStoredRecord(v) : null)).filter((r): r is AILogRecord => !!r);
}

export async function readLogPhotos(id: string): Promise<string[]> {
  const v = await tx([PHOTOS], 'readonly', (t) => {
    const req = t.objectStore(PHOTOS).get(id);
    return () => req.result as unknown;
  });
  return Array.isArray(v) ? v.filter((p): p is string => typeof p === 'string') : [];
}

export async function logSizes(): Promise<StoredSize[]> {
  const [keys, records, photos] = await tx([RECORDS, PHOTOS], 'readonly', (t) => {
    const k = t.objectStore(RECORDS).getAllKeys();
    const r = t.objectStore(RECORDS).getAll();
    const pk = t.objectStore(PHOTOS).getAllKeys();
    const p = t.objectStore(PHOTOS).getAll();
    return () => {
      const photoBytesById = new Map<string, number>();
      pk.result.forEach((key, i) => {
        const list = p.result[i];
        photoBytesById.set(String(key), Array.isArray(list) ? list.reduce((s: number, x: unknown) => s + (typeof x === 'string' ? base64Bytes(x) : 0), 0) : 0);
      });
      return [k.result.map(String), r.result as unknown[], photoBytesById] as const;
    };
  });
  const out: StoredSize[] = keys.map((id, i) => {
    const text = typeof records[i] === 'string' ? (records[i] as string) : '';
    const rec = text ? parseStoredRecord(text) : null;
    return { id, createdAt: rec?.createdAt ?? 0, bytes: text.length + (photos.get(id) ?? 0) };
  });
  // Photos whose record is gone count as oldest, so the limit removes them first.
  for (const id of photos.keys()) if (!keys.includes(id)) out.push({ id, createdAt: 0, bytes: photos.get(id) ?? 0 });
  return out;
}

export async function deleteLogRecords(ids: string[]): Promise<void> {
  await tx([RECORDS, PHOTOS], 'readwrite', (t) => {
    for (const id of ids) {
      t.objectStore(RECORDS).delete(id);
      t.objectStore(PHOTOS).delete(id);
    }
    return () => undefined;
  });
}

export async function clearLog(): Promise<void> {
  await tx([RECORDS, PHOTOS], 'readwrite', (t) => {
    t.objectStore(RECORDS).clear();
    t.objectStore(PHOTOS).clear();
    return () => undefined;
  });
}
