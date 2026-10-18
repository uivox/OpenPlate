/**
 * Where the offline product pack lives on the phone: its own folder in the app's documents, never in
 * the diary store and never in backups. The web twin (packStore.web.ts) uses its own IndexedDB.
 * Checking happens in offlinePack.ts; this file only downloads, hashes and keeps files.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { PackError, type DownloadFn } from './offlinePack';

const folder = () => new Directory(Paths.document, 'offline-pack');
const textFile = () => new File(folder(), 'de.txt');
const envelopeFile = () => new File(folder(), 'de.json');
const downloadFile = () => new File(Paths.cache, 'offline-pack-download.txt');

function remove(f: File) {
  try {
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

/** Downloads the product file to the cache folder (not kept until `commit`). */
export const downloadPack: DownloadFn = async (url, onProgress, signal) => {
  const tmp = downloadFile();
  remove(tmp);
  let file: File;
  try {
    file = await File.downloadFileAsync(url, tmp, { idempotent: true, signal, onProgress: (p) => onProgress(p.bytesWritten) });
  } catch (e) {
    remove(tmp);
    if (e instanceof Error && e.name === 'AbortError') throw e;
    // A non-2xx answer names its status code; anything else is the connection.
    throw new PackError(/\b[45]\d\d\b/.test(String(e)) ? 'server' : 'offline');
  }
  try {
    const sha512 = await file.digest('SHA-512');
    const bytes = file.size ?? 0;
    const text = await file.text();
    return {
      text,
      sha512,
      bytes,
      commit: async (envelopeJson: string) => {
        try {
          folder().create({ intermediates: true, idempotent: true });
          // The envelope goes last: a half-finished update then reads as "no pack" rather than a wrong one.
          remove(envelopeFile());
          remove(textFile());
          await file.move(textFile());
          await envelopeFile().write(envelopeJson);
        } catch {
          throw new PackError('storage');
        }
      },
      discard: async () => remove(file),
    };
  } catch (e) {
    remove(file);
    throw e instanceof PackError ? e : new PackError('storage');
  }
};

/** The installed pack's envelope and text, or null. */
export async function loadInstalledPack(): Promise<{ envelopeJson: string; text: string } | null> {
  const env = envelopeFile();
  const txt = textFile();
  if (!env.exists || !txt.exists) return null;
  try {
    return { envelopeJson: await env.text(), text: await txt.text() };
  } catch {
    return null;
  }
}

export async function deleteInstalledPack(): Promise<void> {
  remove(envelopeFile());
  remove(textFile());
  remove(downloadFile());
}
