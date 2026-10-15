import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';
import { endOfDay, startOfDay } from './dates';

/* ---------- Photos ---------- */

export interface PreparedPhoto {
  uri: string;
  base64: string;
}

/**
 * Opens camera or library and returns a JPEG (max `maxWidth` px wide, 1024 for AI photos) as base64.
 * Null when cancelled. Recipe photos use a smaller size so they fit in the app's storage.
 */
export async function pickMealPhoto(source: 'camera' | 'library', maxWidth = 1024, quality = 0.7): Promise<PreparedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('CAMERA_DENIED');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.width > maxWidth) ctx.resize({ width: maxWidth });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: quality, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Could not read the photo.');
  return { uri: out.uri, base64: out.base64 };
}

/* ---------- Data files ---------- */

/** Backups can be imported on every platform (needed to move to a new install). */
export const canPickFiles = true;

/** Largest file accepted for import; real backups with photos stay far below this. */
const MAX_IMPORT_BYTES = 30 * 1024 * 1024;

/** Reads a text file the user picks (used for importing a backup). Null when cancelled. */
export async function pickTextFile(): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    // Some file providers report .json files as plain text or octet-stream; parseBackup validates.
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];
  const file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size ?? 0) > MAX_IMPORT_BYTES) throw new Error('FILE_TOO_LARGE');
    return await file.text();
  } finally {
    // The picked copy holds personal data; don't leave it in the cache.
    try {
      file.delete();
    } catch {
      /* already gone */
    }
  }
}

/** Writes the export to a JSON file and opens the share sheet (Files, AirDrop, mail, …). */
export async function shareExport(json: string, filename: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    await Share.share({ message: json, title: filename });
    return;
  }
  const file = new File(Paths.cache, filename);
  try {
    if (file.exists) file.delete();
    file.create();
    file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: filename });
  } finally {
    try {
      file.delete();
    } catch {
      /* already gone */
    }
  }
}

/* ---------- Notifications ---------- */

let handlerSet = false;
export function setupNotifications() {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function scheduleAt(date: Date, title: string, body: string): Promise<string | undefined> {
  if (date.getTime() <= Date.now()) return undefined;
  try {
    const perm = await Notifications.getPermissionsAsync();
    const granted = perm.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return undefined;
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  } catch {
    return undefined;
  }
}

export async function cancelNotification(id?: string) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* ignore */
  }
}

/* ---------- Steps (iPhone motion coprocessor; keeps about 7 days) ---------- */

export async function stepsForDay(dateKey: string): Promise<number | null> {
  try {
    if (!(await Pedometer.isAvailableAsync())) return null;
    const perm = await Pedometer.getPermissionsAsync();
    if (!perm.granted) {
      const req = await Pedometer.requestPermissionsAsync();
      if (!req.granted) return null;
    }
    const end = endOfDay(dateKey);
    const now = new Date();
    const res = await Pedometer.getStepCountAsync(startOfDay(dateKey), end > now ? now : end);
    return res.steps;
  } catch {
    return null;
  }
}
