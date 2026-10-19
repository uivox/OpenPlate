import { Directory, File, Paths } from 'expo-file-system';
import { parseStoredRecord, safeLogId, type AILogRecord, type StoredSize } from './aiLog';

/*
 * Where the AI answer log lives on the phone: one folder per record in the app's documents folder
 * (`ai-log/<id>/record.json` + `photo-0.jpg`, …). Not in AsyncStorage: photos would blow past
 * Android's row limit, and the log must never end up in the store or a backup.
 * The web build uses aiLogStore.web.ts (IndexedDB) with the same functions.
 */

const root = () => new Directory(Paths.document, 'ai-log');

function folder(id: string): Directory {
  if (!safeLogId(id)) throw new Error('Invalid log id');
  return new Directory(root(), id);
}

function ensure(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

export async function saveLogRecord(record: AILogRecord): Promise<void> {
  const dir = folder(record.id);
  ensure(dir);
  const file = new File(dir, 'record.json');
  if (!file.exists) file.create();
  await file.write(JSON.stringify(record));
}

export async function saveLogPhotos(id: string, photos: string[]): Promise<void> {
  const dir = folder(id);
  ensure(dir);
  for (let i = 0; i < photos.length; i++) {
    const file = new File(dir, `photo-${i}.jpg`);
    if (!file.exists) file.create();
    await file.write(photos[i], { encoding: 'base64' });
  }
}

function recordFolders(): Directory[] {
  const r = root();
  if (!r.exists) return [];
  return r.list().filter((e): e is Directory => e instanceof Directory && safeLogId(e.name));
}

export async function readLogRecords(): Promise<AILogRecord[]> {
  const out: AILogRecord[] = [];
  for (const dir of recordFolders()) {
    const file = new File(dir, 'record.json');
    if (!file.exists) continue;
    const rec = parseStoredRecord(await file.text());
    if (rec && rec.id === dir.name) out.push(rec);
  }
  return out;
}

export async function readLogPhotos(id: string): Promise<string[]> {
  const dir = folder(id);
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const file = new File(dir, `photo-${i}.jpg`);
    if (!file.exists) break;
    out.push(await file.base64());
  }
  return out;
}

/** Size of every record with its photos, for the limit and the settings screen. */
export async function logSizes(): Promise<StoredSize[]> {
  const out: StoredSize[] = [];
  for (const dir of recordFolders()) {
    const file = new File(dir, 'record.json');
    const rec = file.exists ? parseStoredRecord(await file.text()) : null;
    let bytes = 0;
    for (const f of dir.list()) if (f instanceof File) bytes += f.size ?? 0;
    // A folder without a readable record counts as oldest, so the limit removes it first.
    out.push({ id: dir.name, createdAt: rec?.createdAt ?? 0, bytes });
  }
  return out;
}

export async function deleteLogRecords(ids: string[]): Promise<void> {
  for (const id of ids) {
    const dir = folder(id);
    if (dir.exists) dir.delete();
  }
}

export async function clearLog(): Promise<void> {
  const r = root();
  if (r.exists) r.delete();
}
