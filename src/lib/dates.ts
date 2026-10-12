const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function weekdayOf(key: string): number {
  return parseDayKey(key).getDay();
}

export function startOfDay(key: string): Date {
  return parseDayKey(key);
}

export function endOfDay(key: string): Date {
  const d = parseDayKey(key);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function locale(lang: 'de' | 'en'): string {
  return lang === 'de' ? 'de-DE' : 'en-US';
}

export function formatTime(ms: number, lang: 'de' | 'en'): string {
  return new Date(ms).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
}

export function formatShortDate(key: string, lang: 'de' | 'en'): string {
  return parseDayKey(key).toLocaleDateString(locale(lang), { weekday: 'short', day: 'numeric', month: 'short' });
}

/** h:mm:ss style duration. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

export function lastNDays(endKey: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}
