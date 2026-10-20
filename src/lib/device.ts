import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import * as Sharing from 'expo-sharing';
import { Linking, Platform, Share } from 'react-native';
import * as HealthConnect from 'react-native-health-connect';
import { iconIdFromNative, nativeIconName, type AppIconId, type AppIconNote } from './appIcon';
import { MAX_BACKUP_BYTES } from './backup';
import { endOfDay, startOfDay } from './dates';
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

/** Writes the export to a JSON file and opens the share sheet (Files, AirDrop, mail, …). */
/**
 * Hands the export file to the share sheet. Resolves false when the person visibly cancelled;
 * the iOS/Android share sheet for files doesn't report that, so it counts as done.
 */
export async function shareExport(json: string, filename: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    const res = await Share.share({ message: json, title: filename });
    return res.action !== Share.dismissedAction;
  }
  const file = new File(Paths.cache, filename);
  try {
    if (file.exists) file.delete();
    file.create();
    await file.write(json);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: filename });
    return true;
  } finally {
    try {
      file.delete();
    } catch {
      /* already gone */
    }
  }
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
