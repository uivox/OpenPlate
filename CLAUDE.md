# OpenPlate: notes for working on the code

OpenPlate is a calorie tracker built with Expo (React Native, SDK 54) that runs as an iPhone app, an Android app and a web app (PWA). README.md describes the features and the project layout; DESIGN.md the palette, type and motion.

## How to work on this project

- Every change goes on its own branch and into a pull request against `main`. Never push to `main` (it is protected anyway). Start each pull request from the current `main`; no stacked pull requests.
- Before calling anything done: `npm run check && npm test`. For changes the web app can see, also build it and click through it:
  `WEB_BASE_URL='' npm run build:web`, then `npm i --no-save playwright@1 && npx playwright install chromium && node scripts/web-smoke.mjs dist`.
- When a pull request is ready: summarise what changed and give a short checklist of what to test by hand on the iPhone (and Android, for native-only code).

## Rules for changes

- **Texts:** every text the user sees lives in `src/lib/i18n.ts`, in English and German. `de` is typed as `Record<TKey, string>`, so a missing German text fails the type check. Use typographic quotes and apostrophes as the existing texts do (’ “ ” in English, „ “ in German).
- **Colours:** screens never hard-code colours; they read `useColors()` (theme tokens, see DESIGN.md). The only exception is white text and frames drawn over the camera picture.
- **Logic:** anything that can be decided without React Native goes into a module in `src/lib/` without React Native imports, with tests in `tests/logic.test.ts` (node:test, run by `npm test`). Network code takes a `fetchImpl` parameter so tests can fake the server.
- **Outside data** (Open Food Facts, Robotoff, AI answers, label photos, backups) goes through the plausibility checks in `labelScan.ts` / `openFoodFacts.ts` and is shown to the user before it is saved.
- **Open Food Facts fair use:** search only when the user submits, at most 8 searches a minute, no second search endpoint after a 4xx answer. A 429 pauses searches and barcode lookups for at least a minute (`notePause`). A 404 for an unknown product is a normal answer ("not found"), never a failure and never a reason to pause.
- **Route params:** pass on only the params a screen actually has (`meal`, `date`, `pick`, `barcode`), never empty strings; `flowParams` in `barcodeFlow.ts` does that.

### Web version

- A `*.web.ts(x)` file replaces its twin in the web build (`device`, `storage`, `secure`, `BarcodeScanner`). Both files must export the same names with the same signatures.
- The Content Security Policy is written by `scripts/web-pwa.mjs`; a new server the app talks to has to be added there.
- `scripts/web-smoke.mjs` clicks through the built web app in CI. Extend it when a flow changes that the browser can run; fake outside servers with `page.route`.

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
