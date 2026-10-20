// Expo config plugin: keeps Android's extra entry points working while another app icon is chosen.
//
// expo-alternate-app-icons switches the icon by enabling an <activity-alias> (MainActivityOcean, …)
// and disabling MainActivity. Anything that reaches the app through an intent filter on MainActivity
// would then find nothing, most importantly Health Connect's permission-rationale screen
// (androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE, required to be asked for steps on Android 13 and
// older). This copies MainActivity's filters, and always that one, onto every icon alias.
//
// Must be listed *before* expo-alternate-app-icons in app.json: manifest mods run in reverse order,
// so this one then runs after the aliases exist.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const RATIONALE = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';

const actionsOf = (filter) => (filter.action ?? []).map((a) => a.$['android:name']);
const isLauncher = (filter) => actionsOf(filter).includes('android.intent.action.MAIN');
const key = (filter) => JSON.stringify(filter);

const withAlternateIconAliases = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const main = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const copies = (main['intent-filter'] ?? []).filter((f) => !isLauncher(f));
    if (!copies.some((f) => actionsOf(f).includes(RATIONALE))) copies.push({ action: [{ $: { 'android:name': RATIONALE } }] });

    for (const alias of app['activity-alias'] ?? []) {
      const name = alias.$['android:name'] ?? '';
      if (!/^\.MainActivity[A-Z]/.test(name)) continue; // only the icon aliases, not Health Connect's own
      const filters = alias['intent-filter'] ?? [];
      const have = new Set(filters.map(key));
      for (const f of copies) if (!have.has(key(f))) filters.push(f);
      alias['intent-filter'] = filters;
    }
    return cfg;
  });

module.exports = withAlternateIconAliases;
