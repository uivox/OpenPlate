# Working on OpenPlate

This page is for people who want to change the code, add recipes or run their own copy. To use the app, see the [README](../README.md).

- **Recipes:** community recipes are added through pull requests, see [RECIPES.md](RECIPES.md).
- **Design:** palette, type, the plate and the sprout, see [DESIGN.md](DESIGN.md).
- **Security problems:** please report them privately, see [SECURITY.md](../.github/SECURITY.md).
- **Working with an AI coding assistant:** [CLAUDE.md](../CLAUDE.md) holds the project rules (texts in English and German, colours from the theme, pure logic with tests, the same features on every platform).

## Develop on your PC

Live-reload while changing the code, using the Expo Go app:

```powershell
npm install
npx expo install --fix
npx expo start
```

Scan the QR code with the phone camera. `npm run web` opens the web version on the PC; `npm run build:web` writes the installable build to `dist/`, for the root of a site (set `WEB_BASE_URL=/folder` only when it is served from a sub-folder). The project uses Expo **SDK 58** (React Native 0.88); Expo Go on the phone must support the same SDK (shown in Expo Go → Settings). If the Expo Go in the store doesn't support SDK 58 yet, work in the web version or install the apps that CI builds.

Dependencies are locked in `package-lock.json` (CI installs with `npm ci`). Add packages with `npx expo install <package>` so the version fits the SDK, and commit the updated lockfile. `overrides` in `package.json` forces a fixed version of one build-time package with a security advisory (uuid, used by the iOS project generator); keep it until an Expo upgrade makes it unnecessary.

## Checks

`npm run check` (TypeScript) and `npm test` (logic tests). Pull requests and branches also run `.github/workflows/check.yml`: type check, tests, an Android prebuild, a web build and `scripts/web-smoke.mjs`, which clicks through the web app in a headless browser (light and dark), including an export, a hostile backup import and the Content Security Policy. It never publishes anything. `main` is protected: changes go through a pull request, and this check must pass before it can be merged.

## Releases

Every push to `main` is a release:

- `build.yml` builds both apps (about 30 minutes) and publishes them under [Releases](https://github.com/uivox/OpenPlate/releases/latest), with the SideStore source for the iPhone app. Android APKs are signed with the project key.
- `web.yml` rebuilds the web version (a few minutes) and publishes it to its own site, see *Web version hosting* below.

## Project layout

```
app/                    screens (expo-router, file-based)
  (tabs)/index.tsx      diary
  (tabs)/fasting.tsx    fasting timer and plans
  (tabs)/progress.tsx   weight and weekly charts
  (tabs)/profile.tsx    settings, export
  onboarding.tsx        first-run plan setup
  add-food.tsx          search, recent, my foods
  food.tsx              portion picker / edit entry
  scan.tsx              barcode scanner (camera or typed number) and what a barcode leads to
  photo.tsx             AI photo flow
  custom-food.tsx       create food / quick add / check values from a label or Open Food Facts
  label.tsx             read a nutrition table from a photo
  meal.tsx, meal-edit.tsx  saved meals: log / build
  (tabs)/recipes.tsx, recipe.tsx, recipe-edit.tsx  recipes: list / view / edit
  streak.tsx            streak and calendar
  appearance.tsx        themes, colours, animations
  layout-settings.tsx   tab and diary order
  ai-settings.tsx       bring-your-own-AI setup
  offline-data.tsx      download, update and delete the offline product pack
src/lib/
  ai.ts                 providers, prompt, JSON parsing, fallback logic
  nutrition.ts          BMR/TDEE, goals, macros
  goals.ts              the goal for a given day (weight on that day, fasting days)
  streaks.ts            streaks, goal-hit days, calendar grid
  meals.ts              saved meals
  recipes.ts            recipes (nutrition, scaling, community format and checks)
  communityRecipes.ts   community recipes (see RECIPES.md)
  themes.ts, layout.ts  colour themes and tab/diary layout
  openFoodFacts.ts      barcode lookup and search, Robotoff suggestions, fair-use limits, link to add products
  barcode.ts            barcode check (EAN-8, UPC-E, UPC-A, EAN-13, GTIN-14, check digit)
  barcodeFlow.ts        what a barcode leads to, shared by the scanner and the food search
  labelScan.ts          nutrition label prompt and parser, plausibility checks for outside nutrition data
  genericFoods.ts       built-in basic foods
  bls.ts, blsData.ts    German nutrient database (BLS 4.0) search and data
  offlinePack.ts        offline product pack: row format, signature and manifest checks, barcode index and search
  ed25519.ts            Ed25519 signature check and SHA-512 (for the offline pack)
  packStore(.web).ts    where the offline pack is kept (app documents folder / its own IndexedDB)
  packRuntime.ts        the loaded pack shared by scanner, search and settings
  fasting.ts            plans and phases
  i18n.ts               German and English texts
  store.ts              persisted state (zustand + AsyncStorage; IndexedDB on the web)
  backup.ts             export / import format
  backupReminder.ts     when the diary reminds you to save a copy
  *.web.ts(x)           browser versions of device, storage, secure, BarcodeScanner
src/components/         shared UI (ui.tsx primitives, plate ring, charts, tab bar, export/import flows, ScannerParts.tsx for both scanners)
public/icons/           home-screen icons for the web version
plugins/                Expo config plugins: release signing, storage size on Android
scripts/web-pwa.mjs     turns the web export into an installable, offline web app (with a Content Security Policy)
scripts/web-smoke.mjs   clicks through the built web app in a headless browser
scripts/build-offline-pack.mjs, pack-key.mjs  build and sign the offline product pack; create its key
tests/logic.test.ts     tests for the logic modules (npm test)
docs/                   this page, design notes, recipe format
```

## German nutrient database (BLS 4.0)

`src/lib/blsData.ts` is generated, don't edit it by hand. Download the data from <https://blsdb.de> and run `python3 scripts/import_bls.py BLS_4_0_Daten_2025_DE.xlsx` (needs `openpyxl`).

## Offline product pack

Products sold in Germany from Open Food Facts, which the app downloads on request so barcodes and product search work without a connection. `.github/workflows/offline-pack.yml` builds it every Monday (and on *Run workflow*): it streams Open Food Facts' export (about 1 GB), keeps products whose barcode and nutrition pass the app's own checks (`packRow` in `src/lib/offlinePack.ts`), most scanned first and at most about 32 MB, signs a manifest with an Ed25519 key and force-pushes the result as one commit to the `offline-pack` branch. The app reads it from `raw.githubusercontent.com` and uses it only if the signature matches the public key built into the app and the file's size and SHA-512 match the manifest; it also refuses a pack older than the one it has. The pack is never part of backups and is deleted with *Delete all data*. Data licence: ODbL, like Open Food Facts; the branch carries a README with the attribution.

One-time setup (until it's done, the app shows *Not available yet* and the workflow stops at its first step):

1. Create the key on your computer, in Git Bash (or any shell with OpenSSL 3):
   `openssl genpkey -algorithm ed25519 -out pack-key.pem`
   and print the public half: `openssl pkey -in pack-key.pem -pubout -outform DER | tail -c 32 | base64`
   (or, with Node installed: `node scripts/pack-key.mjs`, which prints both).
2. *Settings → Environments → New environment* `offline-pack`; *Deployment branches and tags*: *Selected branches*, add `main`. Add the environment secret `OFFLINE_PACK_PRIVATE_KEY` with the whole content of `pack-key.pem` (including the `BEGIN`/`END` lines).
3. Put the public key (44 characters ending in `=`) into `PACK_PUBLIC_KEY` in `src/lib/offlinePack.ts` through a pull request. It is public; the workflow refuses to sign with a key that doesn't match it.
4. Delete `pack-key.pem` from your computer once the secret is saved (a new key only means a new app release with the new public key).
5. *Actions → Offline product pack → Run workflow* (takes about 20–40 minutes). If a branch ruleset covers all branches, allow GitHub Actions to create and force-push `offline-pack`.

Never merge or base work on `offline-pack`; it holds only generated data. Check ignores it.

## Web version hosting

The web app keeps everything in its site's browser storage, and every GitHub Pages site of one account or organisation shares that storage (one origin). So the web version is published to the Pages site of a separate organisation that hosts nothing else, not to this repository's own Pages.

1. Create a GitHub organisation used only for this, e.g. `openplate-app`. **Never host another Pages site in it**: any site there could read the app's data.
2. In it, create the public repository `openplate-app.github.io` (it is served at `https://openplate-app.github.io/`).
3. Create a deploy key on your computer: `ssh-keygen -t ed25519 -N "" -C "OpenPlate web deploy" -f openplate-web`. In the site repository: *Settings → Deploy keys → Add deploy key*, paste `openplate-web.pub`, tick *Allow write access*.
4. In this repository:
   - *Settings → Environments → New environment* `web`; *Deployment branches and tags*: *Selected branches*, add `main`. Add the environment secret `WEB_DEPLOY_KEY` with the content of the private key file `openplate-web`. Then delete both key files.
   - *Settings → Secrets and variables → Actions → Variables*: `WEB_SITE_REPO` = `openplate-app/openplate-app.github.io`, `WEB_SITE_URL` = `https://openplate-app.github.io/`.
5. *Actions → Web app → Run workflow*. When it's done, in the site repository: *Settings → Pages → Deploy from a branch → main / (root)*, and tick *Enforce HTTPS*.

Each run replaces the site repository's content with one fresh commit. The key can only write to that one repository, and only workflows on `main` can use it.

Keep GitHub Pages turned off in this repository. The web version used to live at the Pages site of the account that first hosted this repository, which shares its storage with every other Pages site of that account; that site is unpublished. A browser that opened it may still show the old copy from its offline cache until the site's data is cleared in the browser settings.
