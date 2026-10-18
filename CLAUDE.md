# OpenPlate: notes for working on the code

OpenPlate is a calorie tracker built with Expo (SDK 58, React Native 0.88) that runs as an iPhone app, an Android app and a web app (PWA). README.md is for people using the app (features, install, platform differences, safety, privacy); docs/CONTRIBUTING.md has the dev setup, project layout, releases and web hosting; docs/DESIGN.md the palette, type and motion; docs/RECIPES.md the community recipe format; .github/SECURITY.md the security policy. Keep the README about using the app: anything only people working on the code need goes into docs/CONTRIBUTING.md.

## How to work on this project

- Every change goes on its own branch and into a pull request against `main`. Never push to `main` (it is protected anyway). Start each pull request from the current `main`; no stacked pull requests.
- Before calling anything done: `npm run check && npm test`. For changes the web app can see, also build it and click through it:
  `WEB_BASE_URL='' npm run build:web`, then `npm i --no-save playwright@1 && npx playwright install chromium && node scripts/web-smoke.mjs dist`.
- Check every feature on native and web: the same flow must work in the iPhone app, the Android app and the browser. Cover it in `scripts/web-smoke.mjs` where the browser can run it, and list what to check by hand on the phones for native-only code.
- When a pull request is ready: summarise what changed and give a short checklist of what to test by hand on the iPhone (and Android, for native-only code).

## Rules for changes

- **Texts:** every text the user sees lives in `src/lib/i18n.ts`, in English and German. `de` is typed as `Record<TKey, string>`, so a missing German text fails the type check. Use typographic quotes and apostrophes as the existing texts do (’ “ ” in English, „ “ in German).
- **Colours:** screens never hard-code colours; they read `useColors()` (theme tokens, see docs/DESIGN.md). The only exception is white text and frames drawn over the camera picture.
- **Logic:** anything that can be decided without React Native goes into a module in `src/lib/` without React Native imports, with tests in `tests/logic.test.ts` (node:test, run by `npm test`). Network code takes a `fetchImpl` parameter so tests can fake the server.
- **Outside data** (Open Food Facts, Robotoff, AI answers, label photos, backups) goes through the plausibility checks in `labelScan.ts` / `openFoodFacts.ts` and is shown to the user before it is saved.
- **Open Food Facts fair use:** search only when the user submits, at most 8 searches a minute, no second search endpoint after a 4xx answer. A 429 pauses searches and barcode lookups for at least a minute (`notePause`). A 404 for an unknown product is a normal answer ("not found"), never a failure and never a reason to pause.
- **Route params:** pass on only the params a screen actually has (`meal`, `date`, `pick`, `barcode`), never empty strings; `flowParams` in `barcodeFlow.ts` does that.

### Web version

- **Same features everywhere.** iPhone, Android and the web app have the same features and behaviour. A platform may only lack a feature when the platform makes it impossible (no step counter in browsers, notifications only while the web app is open, no HealthKit with a free Apple ID). Every such gap is listed in README → *Differences between platforms* and explained in the app where the user meets it.
- A `*.web.ts(x)` file replaces its twin in the web build (`device`, `storage`, `secure`, `BarcodeScanner`). Both files must export the same names with the same signatures; a test in `tests/logic.test.ts` compares the exported names. Platform facts the screens need (`stepSource`, `notifiesWhenClosed`, `canPickFiles`) are exported from both `device` files instead of checking `Platform.OS` in screens.
- The Content Security Policy is written by `scripts/web-pwa.mjs`; a new server the app talks to has to be added there.
- `scripts/web-smoke.mjs` clicks through the built web app in CI. Extend it when a flow changes that the browser can run; fake outside servers with `page.route`.

## Expo SDK

- Upgrading: `npx expo install expo@latest`, then `npx expo install --fix` and `npx expo-doctor@latest`; read the release notes of every SDK in between (expo.dev/changelog). Besides the checks above, have CI compile the APK and the iPhone app once before merging: the type check and the web build don't cover native code.
- The iPhone app is built on the `macos-26` runner (`build.yml`): SDK 56+ needs Xcode 26.4 or newer.
- Release APKs are built without R8 (`enableMinifyInReleaseBuilds: false` in app.json). Turning it on can need keep rules for libraries that use reflection, so test every native feature on an APK built that way first.
- The custom tab bar (`TabBar.tsx`) takes expo-router's `BottomTabBarProps` (`emitter`, `navigateToTab`); keep it typed, so a router change shows up in the type check rather than as tabs that do nothing.
- expo-file-system: `File.write()` returns a promise; await it (or use `writeSync`).
- React Native's strict TypeScript API is on: no deep imports from `react-native/Libraries/*`.
- The web build is split per route (expo-router's async routes); `scripts/web-pwa.mjs` precaches every file in `dist/`, so the installed web app still works offline.

## Where things are (barcodes)

- `app/scan.tsx`: the barcode scanner screen. Every scanned or typed code goes to `resolveBarcode`, and the screen shows one outcome:
  - product found (one of the user's own foods first) → `/food`;
  - Open Food Facts' photo AI (Robotoff) has values → `/custom-food` with them filled in, to check;
  - unknown product, or known without nutrition → choice: read nutrition label / type in / scan again;
  - invalid barcode (letters, wrong length, wrong check digit; nothing is sent) → "This isn't a valid barcode" with *Correct the number* (puts it into the type-in field) / scan again;
  - no connection or a server error → type in (works offline) / try again / scan again; too many lookups → type in / scan again.
- `src/components/BarcodeScanner.tsx` (expo-camera) and `BarcodeScanner.web.tsx` (getUserMedia + ZXing): the camera picture plus the same type-in field and camera-off view from `ScannerParts.tsx`. Same props on both: `onScan`, `paused`, `manualCode`, `onManualCodeChange`, `children`. A scanned UPC-E is written out as UPC-A (`scannedBarcode`).
- `app/add-food.tsx`: text in the search box that is only digits and as long as a barcode is looked up as a barcode, with the same outcomes shown inline.
- `src/lib/barcode.ts`: the pure check (EAN-8, UPC-E, UPC-A, EAN-13, GTIN-14, check digit, spaces ignored).
- `src/lib/barcodeFlow.ts`: `resolveBarcode` (own foods → Open Food Facts → Robotoff), `flowParams`.
- `src/lib/openFoodFacts.ts`: barcode lookup, search, Robotoff, fair-use limits, and `lookupFailure`, which sorts errors into invalid / rate limited / server / offline.

## Where things are (steps)

- `src/lib/device.ts`: `stepsForDay` reads the iPhone motion sensor (expo-sensors) or Health Connect on Android (`react-native-health-connect`) and returns the steps or a status. Health Connect's permission sheet is shown once; after that the button under the steps card opens Health Connect. `device.web.ts` always answers "not available".
- `src/lib/steps.ts`: the pure part: Health Connect's SDK status, the permission check, the day's range and total, and which text and button go with each status (open the settings, open Health Connect, get it from the Play Store).
- `src/lib/hooks.ts`: `useSteps` (reloads on focus, when the app comes back to the front and every minute for today), `canReadSteps`.
- `app.json`: `android.permission.health.READ_STEPS`, the `react-native-health-connect` config plugin (adds the permission-rationale activity Health Connect requires) and `minSdkVersion` 26. `check.yml` greps the generated manifest for them.

## Where things are (offline product pack)

- `src/lib/offlinePack.ts` (pure): row format, `packRow` (used by the builder, so pack and app share one set of checks), `foodFromPackLine`, `PackIndex` (barcode lookup, search), `readEnvelope` (Ed25519 signature + manifest checks), `installPack`, `PACK_PUBLIC_KEY`. `src/lib/ed25519.ts`: verification and SHA-512, tested against Node.
- `src/lib/packStore.ts` / `packStore.web.ts`: download, hash (native `File.digest`, `crypto.subtle` on the web) and keep the files; never in the zustand store or backups. `src/lib/packRuntime.ts`: the loaded pack (`usePack`, `currentPack`), read 1.5 s after start.
- Uses: `resolveBarcode(…, offline)` asks the pack after the user's own foods and before Open Food Facts; `add-food.tsx` searches it while typing (250 ms pause); `app/offline-data.tsx` downloads, updates, deletes. *Delete all data* deletes it too.
- `.github/workflows/offline-pack.yml` + `scripts/build-offline-pack.mjs`: weekly build from the Open Food Facts export, signed, force-pushed to the `offline-pack` branch. Setup and key handling: docs/CONTRIBUTING.md → *Offline product pack*. Never put the private key anywhere but the `offline-pack` environment secret.

