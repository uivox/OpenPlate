import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { endOfDay, startOfDay } from './dates';

/* ---------- Photos ---------- */

export interface PreparedPhoto {
  uri: string;
  base64: string;
}

/** Opens camera or library and returns a JPEG (max 1024 px wide) as base64. Null when cancelled. */
export async function pickMealPhoto(source: 'camera' | 'library'): Promise<PreparedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('CAMERA_DENIED');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.width > 1024) ctx.resize({ width: 1024 });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Could not read the photo.');
  return { uri: out.uri, base64: out.base64 };
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
