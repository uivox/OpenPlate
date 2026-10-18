/**
 * Browser twin of packStore.ts: the offline product pack in its own IndexedDB database (not the
 * diary's), so it never ends up in backups and can be deleted on its own. The service worker does
 * not cache it; it is fetched only when the user asks for it.
 */
import { PackError, type DownloadFn } from './offlinePack';

const DB_NAME = 'openplate-pack';
const STORE = 'pack';
const KEY = 'de';

function openDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new PackError('storage'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new PackError('storage'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(new PackError('storage'));
      tx.onabort = () => reject(new PackError('storage'));
    });
  } finally {
    db.close();
  }
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Downloads the product file into memory (nothing is stored until `commit`). */
export const downloadPack: DownloadFn = async (url, onProgress, signal) => {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: 'no-store' });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e;
    throw new PackError('offline');
  }
  if (!res.ok) throw new PackError('server', String(res.status));
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      // Stop early instead of filling memory when the server sends far more than any pack can be.
      if (received > 64 * 1024 * 1024) {
        await reader.cancel().catch(() => {});
        throw new PackError('too_large');
      }
      onProgress(received);
    }
  } else {
    const all = new Uint8Array(await res.arrayBuffer());
    chunks.push(all);
    received = all.length;
    onProgress(received);
  }
  const bytes = new Uint8Array(received);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.length;
  }
  const sha512 = hex(await crypto.subtle.digest('SHA-512', bytes));
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new PackError('corrupt', 'not UTF-8');
  }
  return {
    text,
    sha512,
    bytes: received,
    commit: async (envelopeJson: string) => {
      await run('readwrite', (s) => s.put({ envelopeJson, text }, KEY));
    },
    discard: async () => {},
  };
};

export async function loadInstalledPack(): Promise<{ envelopeJson: string; text: string } | null> {
  try {
    const v = (await run<unknown>('readonly', (s) => s.get(KEY))) as { envelopeJson?: unknown; text?: unknown } | undefined;
    return v && typeof v.envelopeJson === 'string' && typeof v.text === 'string' ? { envelopeJson: v.envelopeJson, text: v.text } : null;
  } catch {
    return null;
  }
}

export async function deleteInstalledPack(): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(KEY));
  } catch {
    // nothing stored
  }
}
