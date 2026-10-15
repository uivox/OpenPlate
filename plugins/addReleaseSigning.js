// Pure part of withReleaseSigning.js (no Expo imports), so it can be tested on its own.
//
// The generated android/app/build.gradle signs release builds with debug.keystore, which is
// identical for every Expo/React Native project. Anyone could then sign a modified APK that
// installs over OpenPlate as an "update" and reads all its data. This adds a `release` signing
// config that reads the project's own keystore from environment variables:
//
//   OPENPLATE_KEYSTORE_PATH      absolute path to the .jks / .keystore file
//   OPENPLATE_KEYSTORE_PASSWORD  store password
//   OPENPLATE_KEY_ALIAS          key alias
//   OPENPLATE_KEY_PASSWORD       key password (defaults to the store password)
//
// Without them (local development) release builds keep using the debug key, and CI refuses to
// publish such a build (see .github/workflows/build.yml).

const MARKER = '// openplate-release-signing';

const RELEASE_SIGNING = `
        ${MARKER}
        release {
            if (System.getenv('OPENPLATE_KEYSTORE_PATH')) {
                storeFile file(System.getenv('OPENPLATE_KEYSTORE_PATH'))
                storePassword System.getenv('OPENPLATE_KEYSTORE_PASSWORD')
                keyAlias System.getenv('OPENPLATE_KEY_ALIAS')
                keyPassword System.getenv('OPENPLATE_KEY_PASSWORD') ?: System.getenv('OPENPLATE_KEYSTORE_PASSWORD')
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  // 1. Add a `release` entry inside signingConfigs { ... } right after the debug entry.
  const signingStart = gradle.indexOf('signingConfigs {');
  if (signingStart < 0) throw new Error('withReleaseSigning: signingConfigs block not found in build.gradle');
  const debugStart = gradle.indexOf('debug {', signingStart);
  const debugEnd = gradle.indexOf('}', debugStart);
  if (debugStart < 0 || debugEnd < 0) throw new Error('withReleaseSigning: debug signing config not found');
  gradle = gradle.slice(0, debugEnd + 1) + RELEASE_SIGNING + gradle.slice(debugEnd + 1);

  // 2. Point the release build type at it when a keystore is configured.
  const buildTypes = gradle.indexOf('buildTypes {');
  const releaseType = gradle.indexOf('release {', buildTypes);
  if (buildTypes < 0 || releaseType < 0) throw new Error('withReleaseSigning: release build type not found');
  const line = 'signingConfig signingConfigs.debug';
  const lineStart = gradle.indexOf(line, releaseType);
  const nextBlockEnd = gradle.indexOf('}', releaseType);
  if (lineStart < 0 || lineStart > nextBlockEnd) throw new Error('withReleaseSigning: release signingConfig line not found');
  const replacement = "signingConfig System.getenv('OPENPLATE_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug";
  return gradle.slice(0, lineStart) + replacement + gradle.slice(lineStart + line.length);
}

module.exports = { addReleaseSigning, MARKER };
