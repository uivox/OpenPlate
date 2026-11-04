/**
 * The app's name and where it lives, in one place.
 *
 * The app was called OpenPlate until the rename to Tellerwerk (with a new app id and a new web
 * address). For the move, the same code is also built once more under OpenPlate's old app id
 * (`APP_VARIANT=openplate`, see app.config.js) and published at the old web address; there it
 * shows the move notice instead of being a second copy of the app (`isOldApp`).
 *
 * Pure: no React Native imports, tested in tests/logic.test.ts.
 */

export const APP_NAME = 'Tellerwerk';
export const OLD_APP_NAME = 'OpenPlate';

export const REPO_URL = 'https://github.com/uivox/Tellerwerk';
export const RELEASES_URL = `${REPO_URL}/releases/latest`;
export const SIDESTORE_SOURCE_URL = `${REPO_URL}/releases/latest/download/source.json`;
export const WEB_URL = 'https://tellerwerk-app.github.io/';

export const APP_ID = 'io.github.uivox.tellerwerk';
export const OLD_APP_ID = 'io.github.uivox.openplate';
export const OLD_WEB_HOST = 'openplate-app.github.io';

/**
 * The `app` field of backups and AI log exports. A historic id, never shown to anyone: it stays
 * 'OpenPlate' for good, so OpenPlate backups import into Tellerwerk and Tellerwerk backups still
 * open in an older OpenPlate. Never change it.
 */
export const BACKUP_FORMAT_ID = 'OpenPlate' as const;

/**
 * Whether this copy is the old OpenPlate (the last build under the old app id, or the web app at
 * the old address), which only helps people move to Tellerwerk.
 */
export function isOldApp(where: { appId?: string | null; host?: string | null }): boolean {
  return where.appId === OLD_APP_ID || where.host === OLD_WEB_HOST;
}
