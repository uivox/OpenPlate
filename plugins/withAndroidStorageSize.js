// Expo config plugin: lets the app's storage on Android grow like it does on iPhone and in the browser.
//
// AsyncStorage keeps everything in one SQLite database on Android, capped at 6 MB unless the Gradle
// property below says otherwise. Above the cap, writes fail: a long diary or a backup with recipe
// photos would stop being saved. The cap is only an upper bound; the database still grows as needed.
const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'AsyncStorage_db_size_in_MB';
const SIZE_MB = '1024';

const withAndroidStorageSize = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === KEY));
    cfg.modResults.push({ type: 'property', key: KEY, value: SIZE_MB });
    return cfg;
  });

module.exports = withAndroidStorageSize;
