import type { StateStorage } from 'zustand/middleware';

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

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const local = {
  get(name: string): string | null {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  set(name: string, value: string) {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* storage full or blocked */
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

export const appStorage: StateStorage = {
  async getItem(name) {
    if (!hasIndexedDb) return local.get(name);
    try {
      const v = await run<unknown>('readonly', (s) => s.get(name));
      return typeof v === 'string' ? v : local.get(name);
    } catch {
      return local.get(name);
    }
  },
  async setItem(name, value) {
    if (!hasIndexedDb) return local.set(name, value);
    try {
      await run('readwrite', (s) => s.put(value, name));
    } catch {
      local.set(name, value);
    }
  },
  async removeItem(name) {
    if (hasIndexedDb) {
      try {
        await run('readwrite', (s) => s.delete(name));
      } catch {
        /* ignore */
      }
    }
    local.remove(name);
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
