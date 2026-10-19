import { aiLogFileName, buildAILogExport, recordsToPrune, type AILogRecord } from '../lib/aiLog';
import { clearLog, deleteLogRecords, logSizes, readLogPhotos, readLogRecords, saveLogPhotos, saveLogRecord } from '../lib/aiLogStore';
import { dayKey } from '../lib/dates';
import { shareExport } from '../lib/device';
import { useStore } from '../lib/store';

/*
 * Glue between the screens and the AI answer log (aiLog.ts, aiLogStore.ts). Writing the log must
 * never get in the way of logging food, so every write here swallows its errors.
 */

export const logEnabled = () => useStore.getState().ai.logAnswers === true;

let queue: Promise<void> = Promise.resolve();

/** Saves a record (and, the first time, its photos), then trims the log to its size limit. Writes run in order. */
export function writeLog(record: AILogRecord, photos?: string[]): Promise<void> {
  queue = queue
    .then(async () => {
      await saveLogRecord(record);
      if (photos?.length) await saveLogPhotos(record.id, photos);
      const drop = recordsToPrune(await logSizes());
      if (drop.length) await deleteLogRecords(drop);
    })
    .catch((e) => console.warn('AI log: could not save', e));
  return queue;
}

export async function aiLogStats(): Promise<{ count: number; bytes: number }> {
  await queue;
  const sizes = await logSizes();
  return { count: sizes.length, bytes: sizes.reduce((s, x) => s + x.bytes, 0) };
}

export interface PreparedAILogExport {
  json: string;
  filename: string;
  count: number;
}

/**
 * Builds the export: records, their photos and what the diary says now about entries made from
 * them. Sharing is a second tap (shareAILog): Safari only opens the share sheet straight from a
 * tap, not after reading the photos from storage.
 */
export async function prepareAILogExport(): Promise<PreparedAILogExport> {
  await queue;
  const records = await readLogRecords();
  const photos = new Map<string, string[]>();
  for (const r of records) photos.set(r.id, await readLogPhotos(r.id));
  const data = buildAILogExport(records, (id) => photos.get(id) ?? [], useStore.getState().entries);
  return { json: JSON.stringify(data), filename: aiLogFileName(dayKey()), count: records.length };
}

/** Opens the share sheet / download for a prepared export. Nothing may be awaited before this in the tap handler. */
export const shareAILog = (p: PreparedAILogExport) => shareExport(p.json, p.filename);

export async function deleteAILog(): Promise<void> {
  await queue;
  await clearLog();
}
