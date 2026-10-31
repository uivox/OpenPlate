/* Browser versions of the device helpers in device.ts. */

import { isOldApp } from './appIdentity';
import { DEFAULT_ICON, type AppIcon, type AppIconNote } from './appIcon';
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

/** Shares or downloads an export file (share sheet where supported, iPhone: "Save to Files"). Resolves false when the person cancelled the share sheet. */
export async function shareExport(content: string | Uint8Array, filename: string, mime = 'application/json'): Promise<boolean> {
  const blob = new Blob([content as BlobPart], { type: mime });
  try {
    const file = new File([blob], filename, { type: mime });
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

/** Random bytes from the browser's secure generator (salts and nonces for encrypted backups). */
export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/* ---------- Notifications ---------- */
/*
 * Browsers have no scheduled local notifications. While the app is open, a timer shows one
 * through the service worker (works in iPhone home-screen apps from iOS 16.4). If the app is
 * closed when the time comes, no notification appears.
 */

/** Same export as device.ts: in the browser a notification only comes while the app is open. */
export const notifiesWhenClosed = false;

/**
 * Whether this is the web app at OpenPlate's old address, which only helps people move to
 * Tellerwerk's new address (browser data can't follow the address).
 */
export const oldAppCopy: boolean = typeof location !== 'undefined' && isOldApp({ host: location.hostname });

/**
 * Cancels every notification this app has scheduled. In the browser, reminders are timers that
 * the reminder sync clears once reminders are off, so there is nothing else to cancel here.
 */
export async function cancelAllNotifications(): Promise<void> {}

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
 * add screen, or opens it in a new window when Tellerwerk was closed meanwhile.
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

export function getAppIcon(): AppIcon {
  return { ...DEFAULT_ICON };
}

export async function setAppIcon(_icon: AppIcon): Promise<boolean> {
  return false;
}

/* ---------- Open Food Facts photo upload ---------- */

/** Adds a photo from pickMealPhoto to a form upload (as a JPEG file built from its base64). */
export function appendPhoto(form: FormData, field: string, photo: PreparedPhoto): void {
  const bin = atob(photo.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  form.append(field, new Blob([bytes], { type: 'image/jpeg' }), 'nutrition.jpg');
}

/* ---------- App lock ---------- */
/*
 * In the browser the lock uses a passkey on this device (WebAuthn with the device's own unlock:
 * Face ID, fingerprint, Windows Hello, the device PIN). Nothing goes to a server: the passkey only
 * proves that the person in front of the screen can unlock this device.
 */

export type LockAvailability = 'ok' | 'not_set_up' | 'unsupported';

export async function lockAvailability(): Promise<LockAvailability> {
  try {
    if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) return 'unsupported';
    return (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) ? 'ok' : 'not_set_up';
  } catch {
    return 'unsupported';
  }
}

const b64url = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));

/** Makes the passkey (the browser shows its own sheet) and returns its id. */
export async function enableLock(prompt: string): Promise<{ ok: boolean; credentialId?: string }> {
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Tellerwerk', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: prompt, displayName: 'Tellerwerk' },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;
    return cred ? { ok: true, credentialId: b64url(cred.rawId) } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function unlockApp(_prompt: string, credentialId?: string): Promise<boolean> {
  if (!credentialId) return false;
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromB64url(credentialId) }],
        userVerification: 'required',
        timeout: 60000,
        rpId: location.hostname,
      },
    });
    return !!got;
  } catch {
    return false;
  }
}

/** Browsers only show the passkey sheet after a tap, so the lock screen waits for one. */
export const lockAutoPrompt = false;

/* ---------- Start screen ---------- */
/*
 * index.html shows a start screen (the Sprout bowl and a loading bar, see scripts/web-pwa.mjs)
 * from the very first paint, while the app's code starts and the stored data is read. It fades out
 * here, and the current theme's colours are kept so the next start screen matches the app.
 */

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

export function startScreenDone(colors: StartColors): void {
  try {
    localStorage.setItem('openplate-start-colors', JSON.stringify(colors));
  } catch {
    // private mode or storage full: the next start screen uses the default colours
  }
  const el = typeof document !== 'undefined' ? document.getElementById('op-splash') : null;
  if (!el) return;
  el.classList.add('op-hide');
  setTimeout(() => el.remove(), 260);
}

/** The browser renders behind the start screen while the fonts load (see startScreen.ts). */
export const rendersBehindStartScreen = true;
