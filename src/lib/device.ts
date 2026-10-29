import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Share } from 'react-native';
import * as HealthConnect from 'react-native-health-connect';
import { iconIdFromNative, nativeIconName, type AppIconId, type AppIconNote } from './appIcon';
import { MAX_BACKUP_BYTES } from './backup';
import { endOfDay, startOfDay } from './dates';
import { FAST_NOTICE_PREFIX } from './fasting';
import { REMINDER_ID_PREFIX, reminderDiff, reminderTarget, type NotificationAccess, type ReminderNotice, type ScheduledReminder } from './reminders';
import type { MealType } from './types';
import { HEALTH_CONNECT_STORE_URLS, hasStepsPermission, healthConnectProblem, stepRange, stepsFromAggregate, type StepReading, type StepSource, type StepStatus } from './steps';

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
    if ((asset.size ?? file.size ?? 0) > MAX_BACKUP_BYTES) throw new Error('FILE_TOO_LARGE');
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

/**
 * Hands an export file (a backup's JSON, the CSV zip) to the share sheet: Files, AirDrop, mail, ….
 * Resolves false when the person visibly cancelled; the iOS/Android share sheet for files doesn't
 * report that, so it counts as done. The file is removed from the cache afterwards.
 */
export async function shareExport(content: string | Uint8Array, filename: string, mime = 'application/json'): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    if (typeof content !== 'string') return false;
    const res = await Share.share({ message: content, title: filename });
    return res.action !== Share.dismissedAction;
  }
  const file = new File(Paths.cache, filename);
  try {
    if (file.exists) file.delete();
    file.create();
    await file.write(content);
    await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: mime === 'application/zip' ? 'public.zip-archive' : 'public.json', dialogTitle: filename });
    return true;
  } finally {
    try {
      file.delete();
    } catch {
      /* already gone */
    }
  }
}

/** Random bytes from the system's secure generator (salts and nonces for encrypted backups). */
export function randomBytes(n: number): Uint8Array {
  return getRandomBytes(n);
}

/* ---------- Notifications ---------- */

/** Scheduled notifications arrive even when the app is closed (not so in the browser, see device.web.ts). */
export const notifiesWhenClosed = true;

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

/* ---------- Meal reminders (local notifications, no server; see reminders.ts) ---------- */

const REMINDER_CATEGORY = 'meal-reminder';
const LOG_NOW_ACTION = 'log-now';

/** Whether reminders can be shown: the phone's notification permission for OpenPlate. */
export async function notificationAccess(): Promise<NotificationAccess> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted || perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return 'granted';
    return perm.canAskAgain ? 'ask' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** Shows the system's permission prompt (only when the user switches reminders on). */
export async function askNotifications(): Promise<boolean> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) return true;
    if (!perm.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** OpenPlate's page in the phone's settings, where notifications can be allowed again. */
export async function openNotificationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    /* nothing to open */
  }
}

let categoryTitle = '';

/**
 * Makes the phone's pending reminders match `wanted`: changed ones are replaced, ones no longer
 * wanted cancelled, unchanged ones left alone. Never asks for permission; without it, OpenPlate's
 * pending reminders are removed and come back on the next sync once notifications are allowed.
 */
export async function syncReminders(wanted: ReminderNotice[], logNowTitle: string): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const ours = all.filter((n) => n.identifier.startsWith(REMINDER_ID_PREFIX));
    const granted = (await Notifications.getPermissionsAsync()).granted;
    const current: ScheduledReminder[] = ours.map((n) => ({
      id: n.identifier,
      at: typeof n.content.data?.at === 'number' ? n.content.data.at : 0,
      title: n.content.title ?? '',
      body: n.content.body ?? '',
    }));
    const { cancel, add } = reminderDiff(current, granted ? wanted : []);
    for (const id of cancel) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    if (!add.length) return;
    if (categoryTitle !== logNowTitle) {
      // The *Log now* button (a plain tap does the same); its title follows the app's language.
      await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
        { identifier: LOG_NOW_ACTION, buttonTitle: logNowTitle, options: { opensAppToForeground: true } },
      ]).catch(() => {});
      categoryTitle = logNowTitle;
    }
    const byId = new Map(wanted.map((w) => [w.id, w]));
    for (const r of add) {
      const w = byId.get(r.id)!;
      if (w.at <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: w.id,
        content: { title: w.title, body: w.body, data: { meal: w.meal, date: w.date, at: w.at }, categoryIdentifier: REMINDER_CATEGORY },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(w.at) },
      }).catch(() => {});
    }
  } catch {
    /* notifications unavailable: nothing to keep in step */
  }
}

/**
 * Calls `open` with the meal and day when the user taps a reminder or its *Log now* button,
 * also when the tap started the app. Returns the unsubscribe function.
 */
export function onReminderOpened(open: (target: { meal: MealType; date: string }) => void): () => void {
  const handle = (r: Notifications.NotificationResponse | null) => {
    const target = r ? reminderTarget(r.notification.request.content.data) : null;
    if (!target) return;
    Notifications.clearLastNotificationResponse();
    open(target);
  };
  try {
    handle(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

/* ---------- Eating-window notices (fasting.ts planFastNotices) ---------- */

/**
 * Keeps the phone's pending "window closes soon" and "fast done" notices for the fixed eating
 * window in step with `wanted` (ids `fast-notice:…`), the same way as meal reminders. Never asks
 * for permission; without it, the pending notices are removed.
 */
export async function syncFastNotices(wanted: ScheduledReminder[]): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const granted = (await Notifications.getPermissionsAsync()).granted;
    const current: ScheduledReminder[] = all
      .filter((n) => n.identifier.startsWith(FAST_NOTICE_PREFIX))
      .map((n) => ({
        id: n.identifier,
        at: typeof n.content.data?.at === 'number' ? n.content.data.at : 0,
        title: n.content.title ?? '',
        body: n.content.body ?? '',
      }));
    const { cancel, add } = reminderDiff(current, granted ? wanted : []);
    for (const id of cancel) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    for (const w of add) {
      if (w.at <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: w.id,
        content: { title: w.title, body: w.body, data: { at: w.at } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(w.at) },
      }).catch(() => {});
    }
  } catch {
    /* notifications unavailable */
  }
}

/* ---------- Steps (iPhone motion coprocessor, keeps about 7 days; Health Connect on Android) ---------- */

/**
 * Where daily steps come from. The iPhone's motion sensor keeps a history apps can read; Android
 * shares it through Health Connect (built in from Android 14, an app from the Play Store before).
 */
export const stepSource: StepSource = Platform.OS === 'ios' ? 'motion' : 'health_connect';

/** One day's steps, or null plus the reason (see steps.ts). */
export async function stepsForDay(dateKey: string): Promise<StepReading> {
  return stepSource === 'motion' ? motionSteps(dateKey) : healthConnectSteps(dateKey);
}

/** Where the person can fix what `status` says: the iPhone settings, Health Connect or its Play Store page. */
export async function openStepSettings(status: StepStatus): Promise<void> {
  try {
    if (stepSource === 'motion') return await Linking.openSettings();
    if (status === 'not_installed') {
      for (const url of HEALTH_CONNECT_STORE_URLS) {
        try {
          return await Linking.openURL(url);
        } catch {
          /* no Play Store app: try the web page */
        }
      }
      return;
    }
    HealthConnect.openHealthConnectSettings();
  } catch {
    /* nothing to open */
  }
}

async function motionSteps(dateKey: string): Promise<StepReading> {
  try {
    if (!(await Pedometer.isAvailableAsync())) return { steps: null, status: 'unsupported' };
    const perm = await Pedometer.getPermissionsAsync();
    if (!perm.granted) {
      const req = await Pedometer.requestPermissionsAsync();
      if (!req.granted) return { steps: null, status: 'denied' };
    }
    const end = endOfDay(dateKey);
    const now = new Date();
    const res = await Pedometer.getStepCountAsync(startOfDay(dateKey), end > now ? now : end);
    return { steps: res.steps, status: 'ok' };
  } catch {
    return { steps: null, status: 'error' };
  }
}

const STEPS_PERMISSION = [{ accessType: 'read', recordType: 'Steps' }] as const;
/** Set once the Health Connect permission sheet was shown, so it isn't shown again on every visit. */
const HC_ASKED_KEY = 'openplate-health-connect-asked';
let hcReady: Promise<boolean> | null = null;
let hcAsking: Promise<boolean> | null = null;

async function healthConnectAllowed(): Promise<boolean> {
  if (hasStepsPermission(await HealthConnect.getGrantedPermissions())) return true;
  if (hcAsking) return hcAsking; // the sheet is open (diary focus and the minute timer can meet)
  // Ask once. Afterwards the person allows it in Health Connect (the button under the steps card).
  if ((await AsyncStorage.getItem(HC_ASKED_KEY)) === '1') return false;
  hcAsking ??= (async () => {
    try {
      await AsyncStorage.setItem(HC_ASKED_KEY, '1');
      return hasStepsPermission(await HealthConnect.requestPermission([...STEPS_PERMISSION]));
    } finally {
      hcAsking = null;
    }
  })();
  return hcAsking;
}

async function healthConnectSteps(dateKey: string): Promise<StepReading> {
  try {
    const problem = healthConnectProblem(await HealthConnect.getSdkStatus());
    if (problem) {
      hcReady = null; // installed later: initialize then
      return { steps: null, status: problem };
    }
    hcReady ??= HealthConnect.initialize();
    if (!(await hcReady)) {
      hcReady = null;
      return { steps: null, status: 'error' };
    }
    if (!(await healthConnectAllowed())) return { steps: null, status: 'denied' };
    const range = stepRange(startOfDay(dateKey), endOfDay(dateKey), new Date());
    if (!range) return { steps: 0, status: 'ok' };
    const result = await HealthConnect.aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', ...range } });
    const steps = stepsFromAggregate(result);
    return steps === null ? { steps: null, status: 'error' } : { steps, status: 'ok' };
  } catch {
    hcReady = null;
    return { steps: null, status: 'error' };
  }
}

/* ---------- App icon ---------- */

type IconModule = typeof import('expo-alternate-app-icons');
let iconModule: IconModule | null | undefined;
/** Loaded on first use: an older build without the native module just can't change the icon. */
function icons(): IconModule | null {
  if (iconModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      iconModule = require('expo-alternate-app-icons') as IconModule;
    } catch {
      iconModule = null;
    }
  }
  return iconModule;
}

/** The home-screen icon can be changed (both phones; not in browsers, see device.web.ts). */
export const canChangeAppIcon = true;
/** Text shown under the icon choice: what happens when it changes on this platform. */
export const appIconNote: AppIconNote = Platform.OS === 'android' ? 'app_icon_note_android' : 'app_icon_note_ios';

export function getAppIcon(): AppIconId {
  try {
    return iconIdFromNative(icons()?.getAppIconName());
  } catch {
    return 'default';
  }
}

/** Switches the home-screen icon; false when this device can't (or the switch failed). */
export async function setAppIcon(id: AppIconId): Promise<boolean> {
  const m = icons();
  if (!m || !m.supportsAlternateIcons) return false;
  try {
    await m.setAlternateAppIcon(nativeIconName(id));
    return true;
  } catch {
    return false;
  }
}

/* ---------- Open Food Facts photo upload ---------- */

/** Adds a photo from pickMealPhoto to a form upload (React Native sends files by their uri). */
export function appendPhoto(form: FormData, field: string, photo: PreparedPhoto): void {
  form.append(field, { uri: photo.uri, name: 'nutrition.jpg', type: 'image/jpeg' } as unknown as Blob);
}

/* ---------- App lock ---------- */

export type LockAvailability = 'ok' | 'not_set_up' | 'unsupported';

/** Whether this device can lock the app: it needs Face ID, a fingerprint or at least a device PIN. */
export async function lockAvailability(): Promise<LockAvailability> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level === LocalAuthentication.SecurityLevel.NONE ? 'not_set_up' : 'ok';
  } catch {
    return 'unsupported';
  }
}

/** The phone's own unlock (Face ID / fingerprint, falling back to the device PIN). */
export async function unlockApp(prompt: string, _credentialId?: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
    return res.success;
  } catch {
    return false;
  }
}

/** Turning the lock on: one successful unlock first, so nobody locks themselves out by mistake. No passkey on phones. */
export async function enableLock(prompt: string): Promise<{ ok: boolean; credentialId?: string }> {
  return { ok: await unlockApp(prompt) };
}

/** Phones ask for Face ID / fingerprint by themselves when the lock screen shows; browsers wait for a tap (passkeys need one). */
export const lockAutoPrompt = true;

/* ---------- Start screen ---------- */

/** Colours for the browser's start screen; phones use the native splash screen, so nothing to do here. */
export interface StartColors {
  bg: string;
  accent: string;
  leaf: string;
  face: string;
  text: string;
  track: string;
  /** Motion is set to Off: the start screen doesn't move either. */
  still: boolean;
}

/** The app is ready (data read, fonts loaded): phones hide their splash screen themselves. */
export function startScreenDone(_colors: StartColors): void {}

/** Whether the app may render before its fonts are loaded (only the browser, behind its start screen). */
export const rendersBehindStartScreen = false;
