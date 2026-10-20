/**
 * Colours for the app icon on the home screen (Settings → Appearance → App icon), separate from the
 * in-app theme. The images are made by scripts/make-app-icons.py and listed in app.json for the
 * expo-alternate-app-icons plugin; ids here are the native icon names in lower case. Pure, so tested.
 */

/** i18n key of the platform's note under the icon choice. */
export type AppIconNote = 'app_icon_note_ios' | 'app_icon_note_android' | 'app_icon_note_web';

export type AppIconId = 'default' | 'ocean' | 'plum' | 'sunset' | 'mono' | 'night';

/** plate and background as drawn in the icon (shown as small previews in the settings). */
export const APP_ICONS: { id: AppIconId; plate: string; bg: string }[] = [
  { id: 'default', plate: '#9C2F62', bg: '#EEF2E5' },
  { id: 'ocean', plate: '#0E7C86', bg: '#E8F2F4' },
  { id: 'plum', plate: '#7B3FC4', bg: '#F4EEF7' },
  { id: 'sunset', plate: '#C9481A', bg: '#FAF0E6' },
  { id: 'mono', plate: '#161616', bg: '#F1F1EF' },
  { id: 'night', plate: '#E26A9E', bg: '#1B1220' },
];

/** Name the native module expects (`null` = the normal icon). */
export function nativeIconName(id: AppIconId): string | null {
  return id === 'default' ? null : id[0].toUpperCase() + id.slice(1);
}

/** Our id for what the native module reports; anything unknown counts as the normal icon. */
export function iconIdFromNative(name: string | null | undefined): AppIconId {
  const id = (name ?? '').toLowerCase();
  return APP_ICONS.some((i) => i.id === id) ? (id as AppIconId) : 'default';
}
