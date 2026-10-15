// Expo config plugin: signs Android release builds with the project's own keystore instead of the
// public debug key. See addReleaseSigning.js for the details.
const { withAppBuildGradle } = require('expo/config-plugins');
const { addReleaseSigning } = require('./addReleaseSigning');

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withReleaseSigning: only Groovy build.gradle is supported');
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });

module.exports = withReleaseSigning;
