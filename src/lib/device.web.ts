/* Browser versions of the device helpers in device.ts. */

import type { AppIconId, AppIconNote } from './appIcon';
import { MAX_BACKUP_BYTES } from './backup';
import { reminderDiff, reminderTarget, type NotificationAccess, type ReminderNotice, type ScheduledReminder } from './reminders';
import type { StepReading, StepSource, StepStatus } from './steps';
import type { MealType } from './types';

/* ---------- Photos ---------- */

export interface PreparedPhoto {
  uri: string;
  base64: string;
}

/** Opens a file input. Must run synchronously inside the tap handler, or Safari blocks it. */
function chooseFile(accept: string, capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the photo.'));
    img.src = src;
  });
}

/** Same contract as the native version: a JPEG, max `maxWidth` px wide, as base64. Null when cancelled. */
export async function pickMealPhoto(source: 'camera' | 'library', maxWidth = 1024, quality = 0.7): Promise<PreparedPhoto | null> {
  const file = await chooseFile('image/*', source === 'camera');
  if (!file) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read the photo.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return { uri: dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- Data files ---------- */

export const canPickFiles = true;

/** Reads a text file the user picks (used for importing a backup). Null when cancelled. */
export async function pickTextFile(): Promise<string | null> {
  const file = await chooseFile('application/json,text/plain,.json,.txt', false);
  if (!file) return null;
  if (file.size > MAX_BACKUP_BYTES) throw new Error('FILE_TOO_LARGE');
  return file.text();
}

/** Share sheet with the file where supported (iPhone: "Save to Files"), otherwise a download. */
/** Shares or downloads the export file. Resolves false when the person cancelled the share sheet. */
export async function shareExport(json: string, filename: string): Promise<boolean> {
  const blob = new Blob([json], { type: 'application/json' });
  try {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return true;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/* ---------- Notifications ---------- */
/*
 * Browsers have no scheduled local notifications. While the app is open, a timer shows one
 * through the service worker (works in iPhone home-screen apps from iOS 16.4). If the app is
 * closed when the time comes, no notification appears.
 */

/** Same export as device.ts: in the browser a notification only comes while the app is open. */
export const notifiesWhenClosed = false;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_DELAY = 2 ** 31 - 1;

export function setupNotifications() {}

async function show(title: string, body: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, { body });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, { body });
  } catch {
    /* not supported */
  }
}

export async function scheduleAt(date: Date, title: string, body: string): Promise<string | undefined> {
  const delay = date.getTime() - Date.now();
  if (delay <= 0 || delay > MAX_DELAY || typeof Notification === 'undefined') return undefined;
  try {
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return undefined;
  } catch {
    return undefined;
  }
  const id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      void show(title, body);
    }, delay),
  );
  return id;
}

export async function cancelNotification(id?: string) {
  if (!id) return;
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
}

/* ---------- Meal reminders ---------- */
/*
 * The same reminders as on the phone, held as timers while the web app is open (browsers have no
 * scheduled notifications). Shown through the service worker; a tap focuses the app and opens the
 * add screen, or opens it in a new window when OpenPlate was closed meanwhile.
 */

function isIPhoneBrowser(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isHomeScreenApp(): boolean {
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** Same export as device.ts. Safari on iPhone only offers notifications in the home-screen app. */
export async function notificationAccess(): Promise<NotificationAccess> {
  if (typeof Notification === 'undefined') return isIPhoneBrowser() && !isHomeScreenApp() ? 'needs_home_screen' : 'unsupported';
  return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'ask';
}

/** Same export as device.ts: the browser's permission prompt. */
export async function askNotifications(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
    return Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/** Same export as device.ts; a web page can't open the browser's site settings. */
export async function openNotificationSettings(): Promise<void> {}

const reminderTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; shown: ScheduledReminder }>();
let openReminder: ((target: { meal: MealType; date: string }) => void) | null = null;

async function showReminder(r: ReminderNotice, logNowTitle: string) {
  const target = { meal: r.meal, date: r.date };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      const url = new URL(`add-food?meal=${r.meal}&date=${r.date}`, reg.scope).href;
      // `actions` (the *Log now* button) shows where the browser supports it; a plain tap does the same.
      const options = { body: r.body, tag: r.id, data: { reminder: target, url }, actions: [{ action: 'log-now', title: logNowTitle }] };
      await reg.showNotification(r.title, options as NotificationOptions);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(r.title, { body: r.body, tag: r.id });
    n.onclick = () => {
      window.focus();
      n.close();
      openReminder?.(target);
    };
  } catch {
    /* not supported */
  }
}

/** Same export as device.ts: keeps the timers in step with `wanted` while the app is open. */
export async function syncReminders(wanted: ReminderNotice[], logNowTitle: string): Promise<void> {
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const current = [...reminderTimers.values()].map((t) => t.shown);
  const { cancel, add } = reminderDiff(current, granted ? wanted : []);
  for (const id of cancel) {
    const t = reminderTimers.get(id);
    if (t) clearTimeout(t.timer);
    reminderTimers.delete(id);
  }
  const byId = new Map(wanted.map((w) => [w.id, w]));
  for (const a of add) {
    const r = byId.get(a.id)!;
    const delay = r.at - Date.now();
    if (delay <= 0 || delay > MAX_DELAY) continue;
    const timer = setTimeout(() => {
      reminderTimers.delete(r.id);
      void showReminder(r, logNowTitle);
    }, delay);
    reminderTimers.set(r.id, { timer, shown: { id: r.id, at: r.at, title: r.title, body: r.body } });
  }
}

/** Same export as device.ts: a tap on a reminder while the app is open (the service worker passes it on). */
export function onReminderOpened(open: (target: { meal: MealType; date: string }) => void): () => void {
  openReminder = open;
  const onMessage = (e: MessageEvent) => {
    const msg = e.data as { type?: string; reminder?: unknown } | null;
    if (msg?.type !== 'openplate-reminder') return;
    const target = reminderTarget(msg.reminder);
    if (target) open(target);
  };
  navigator.serviceWorker?.addEventListener('message', onMessage);
  return () => {
    if (openReminder === open) openReminder = null;
    navigator.serviceWorker?.removeEventListener('message', onMessage);
  };
}

/* ---------- Eating-window notices ---------- */

const fastTimers = new Map<string, { timer: ReturnType<typeof setTimeout>; shown: ScheduledReminder }>();

/** Same export as device.ts: timers while the web app is open. */
export async function syncFastNotices(wanted: ScheduledReminder[]): Promise<void> {
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const { cancel, add } = reminderDiff([...fastTimers.values()].map((t) => t.shown), granted ? wanted : []);
  for (const id of cancel) {
    const t = fastTimers.get(id);
    if (t) clearTimeout(t.timer);
    fastTimers.delete(id);
  }
  for (const w of add) {
    const delay = w.at - Date.now();
    if (delay <= 0 || delay > MAX_DELAY) continue;
    const timer = setTimeout(() => {
      fastTimers.delete(w.id);
      void show(w.title, w.body);
    }, delay);
    fastTimers.set(w.id, { timer, shown: w });
  }
}

/* ---------- Steps ---------- */

/** Same export as device.ts: browsers have no step counter. */
export const stepSource: StepSource = 'browser';

/** Browsers can't read the step counter, so the step UI shows its "not available" state. */
export async function stepsForDay(_dateKey: string): Promise<StepReading> {
  return { steps: null, status: 'unsupported' };
}

/** Same export as device.ts; there is no setting a browser could open. */
export async function openStepSettings(_status: StepStatus): Promise<void> {}

/* ---------- App icon ---------- */

/** Browsers don't let a web app change its home-screen icon after it was installed. */
export const canChangeAppIcon = false;
export const appIconNote: AppIconNote = 'app_icon_note_web';

export function getAppIcon(): AppIconId {
  return 'default';
}

export async function setAppIcon(_id: AppIconId): Promise<boolean> {
  return false;
}
