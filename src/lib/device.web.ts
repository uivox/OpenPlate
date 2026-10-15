/* Browser versions of the device helpers in device.ts. */

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
  return file ? file.text() : null;
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

/* ---------- Steps ---------- */

/** Browsers can't read the step counter, so the step UI shows its "not available" state. */
export async function stepsForDay(_dateKey: string): Promise<number | null> {
  return null;
}
