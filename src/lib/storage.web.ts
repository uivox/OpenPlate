import type { KeyValueStore } from './persistStorage';

/**
 * Browser storage for the zustand store. IndexedDB instead of localStorage because localStorage
 * is capped at about 5 MB, which a few years of diary entries (each embeds its food) can reach.
 * Falls back to localStorage when IndexedDB is unavailable. Nothing leaves the device.
 */
const DB_NAME = 'openplate';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

const local = {
  get(name: string): string | null {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  remove(name: string) {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

const hasIndexedDb = typeof indexedDB !== 'undefined';

/** localStorage keys that belong to the app (older versions or the fallback). */
const localKeys = (): string[] => {
  try {
    return Object.keys(window.localStorage).filter((k) => k.startsWith('openplate'));
  } catch {
    return [];
  }
};

/** The database, or null when the browser doesn't allow IndexedDB at all (then localStorage is used). */
async function database(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb) return null;
  try {
    return await openDb();
  } catch {
    return null;
  }
}

function transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result());
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}

/**
 * Key-value store for persistStorage.ts. IndexedDB first; values only found in localStorage (older
 * versions or the fallback) are still read. Several values are written in one transaction, so a
 * month of diary entries and the main value are saved together or not at all. Read errors are
 * passed on, never treated as "no data": the app then shows an error instead of starting empty.
 */
export const kvStore: KeyValueStore = {
  async getAllKeys() {
    const keys = new Set(localKeys());
    const db = await database();
    if (db) {
      const idb = await transaction(db, 'readonly', (s) => {
        const req = s.getAllKeys();
        return () => req.result;
      });
      for (const k of idb) if (typeof k === 'string') keys.add(k);
    }
    return [...keys];
  },
  async multiGet(keys) {
    const db = await database();
    const values: unknown[] = db
      ? await transaction(db, 'readonly', (s) => {
          const reqs = keys.map((k) => s.get(k));
          return () => reqs.map((r) => r.result);
        })
      : [];
    return keys.map((k, i) => [k, typeof values[i] === 'string' ? (values[i] as string) : local.get(k)] as const);
  },
  async multiSet(pairs) {
    const db = await database();
    if (db) {
      await transaction(db, 'readwrite', (s) => {
        for (const [k, v] of pairs) s.put(v, k);
        return () => undefined;
      });
      // An older copy in localStorage must not be read later instead of the new value.
      for (const [k] of pairs) local.remove(k);
      return;
    }
    for (const [k, v] of pairs) window.localStorage.setItem(k, v); // throws when full, so the caller knows
  },
  async multiRemove(keys) {
    const db = await database();
    if (db) {
      await transaction(db, 'readwrite', (s) => {
        for (const k of keys) s.delete(k);
        return () => undefined;
      });
    }
    for (const k of keys) local.remove(k);
  },
};

/** Asks the browser not to evict our data under storage pressure. Home-screen apps on iOS are exempt anyway. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
