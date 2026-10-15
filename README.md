# OpenPlate

A free, open-source calorie tracker for iPhone, Android and the browser, built with Expo (React Native).
German and English, light and dark mode, all data stays on your device.

**Features**

- **Food diary** with breakfast, lunch, dinner and snacks, calorie ring, macro bars and per-meal targets
- **Food search**: ~100 built-in basics, the complete **German nutrient database BLS 4.0** (7,140 foods and dishes in German and English, works offline) and millions of packaged products from [Open Food Facts](https://world.openfoodfacts.org). Products sold in Germany come first; start with a supermarket ("Lidl Skyr", "Aldi Joghurt") to see its products and house brands first.
- **Barcode scanner** (EAN-13/8, UPC) with Open Food Facts lookup. When a product is missing or has no nutrition there:
  - values that Open Food Facts' photo AI ([Robotoff](https://github.com/openfoodfacts/robotoff)) already read off a package photo are offered as a suggestion, no account or key needed;
  - **photograph the nutrition table** and your own AI copies the printed values (it doesn't estimate);
  - or type the values in. Every value is checked for plausibility and shown next to the photo before you save it, and a link takes you to Open Food Facts to add the product there for everyone.
- **AI photo logging** with *your own* AI: Claude, OpenAI, Google Gemini (free tier), or a model running on your own PC via Ollama / LM Studio. Primary + fallback provider; the fallback is asked when the first fails or is unsure, and the more confident answer wins. Every item and portion can be corrected before saving.
- **Quick add**, **custom foods**, **recent foods**, **copy a meal from yesterday**
- **My meals**: save the foods you always eat together (e.g. your breakfast) and log them with one tap, at any portion size. Build them from search, recent foods and the barcode scanner, or save a meal straight from the diary.
- **Personal plan** from a short onboarding (Mifflin-St Jeor + activity level + weekly pace). Or set it exactly: your own daily kcal, any weekly pace (e.g. +0.4 kg), your own activity factor or maintenance calories, macros as presets, custom percentages or grams.
- **Recipes tab**: your own recipes (photo, servings, steps, ingredients from the food search; nutrition calculated from the ingredients) and community recipes added through pull requests and marked as tested once someone else has cooked them ([RECIPES.md](RECIPES.md)). Scale the ingredients to any number of servings and log a serving with one tap.
- **Streak and calendar**: a streak counter on the diary and a month calendar showing which days you logged and whether you hit your goal (±5 %, with 10 % room in the goal's direction; eating far less than the goal never counts as a hit)
- **Make it yours**: seven themes in light and dark (including a glowing Neon one), your own button and macro colours, three animation levels, tab order and visibility, add button left/centre/right, diary section order
- **Intermittent fasting**: 12:12, 14:10, 16:8, 18:6, 20:4, 23:1 timers with phases, adjustable start time and a notification when you reach the goal; 5:2 and 6:1 with chosen fasting days that lower the calorie goal automatically
- **Water tracker** with tappable glasses
- **Weight log** with chart (30/90/365 days), BMI, progress towards the target
- **Steps** from the iPhone motion sensor, optionally added to the calorie budget (iPhone only; Android doesn't offer daily step history to apps without Health Connect)
- **Export and import** all data as a JSON file, on the phone and in the web version (moving between them works too)
- **Web version** that installs on the iPhone home screen, works offline and keeps everything in the browser on your device

Design notes (palette, type, the plate and the sprout): see [DESIGN.md](DESIGN.md).

---

## Install on your phone

Every push to `main` builds both apps on GitHub for free (Actions tab → *Build apps*, about 30 minutes) and publishes them under **[Releases](../../releases/latest)**.

### iPhone or any phone, in the browser (no install tools needed)

The web version runs in Safari and can be added to the home screen, where it opens full-screen like an app and works offline.

1. On the iPhone, open **<https://uivox.github.io/OpenPlate/>** in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open OpenPlate from the home screen icon.

Your data is stored only in that home-screen app on this phone (IndexedDB). It does not sync and is separate from Safari tabs and from the SideStore app. Use *Profile → Export data* now and then as a backup; *Import data* restores an export, including one from the native app.

Differences to the native app: no step counter (browsers can't read it); the fasting notification only fires while the app is open; a local AI server (Ollama / LM Studio) must be reachable over https, because browsers block plain http from an https page. Claude, OpenAI and Gemini work as in the app. API keys are kept in this browser instead of the Keychain.

Every push to `main` also rebuilds the web version (Actions tab → *Web app*, a few minutes). One-time setup in the repository: *Settings → Pages → Build and deployment → Source: GitHub Actions*.

### Android

1. On the phone, open the latest release and download **OpenPlate.apk**.
2. Open it and allow *Install unknown apps* for your browser when asked.
3. Updates: download the newer APK and install it over the old one. Your data stays.


### iPhone (free, with SideStore)

Apple only lets apps signed with a free Apple ID run for 7 days. **SideStore** renews the signature on the phone itself, so after a one-time setup with your PC you don't need to do anything.

**One-time setup on Windows**

1. Install **iTunes** from apple.com (the download from apple.com, not the Microsoft Store version) so Windows can talk to the iPhone.
2. Install **iloader** (the `.msi` from <https://github.com/nab138/iloader/releases>).
3. On the iPhone, install **LocalDevVPN** from the App Store, open it and tap *Connect*.
4. Plug the iPhone into the PC, tap *Trust*. In iloader, sign in with your normal Apple ID and click **SideStore (Stable)**.
5. On the iPhone: *Settings → General → VPN & Device Management* → trust your Apple ID. Then *Settings → Privacy & Security → Developer Mode* → on (the phone restarts).
6. Open SideStore and sign in with the same Apple ID.

**Add OpenPlate**

1. In SideStore → *Sources* → **+**, add:
   `https://github.com/uivox/OpenPlate/releases/latest/download/source.json`
2. Tap **Get** next to OpenPlate.
3. New versions show up in SideStore with an **Update** button. Your data stays.

Keep LocalDevVPN installed; SideStore uses it to renew apps in the background. If OpenPlate ever stops opening, open SideStore and tap *Refresh All*.
Limits set by Apple for free Apple IDs: 3 sideloaded apps at once (SideStore counts as one) and 10 installs per week.

## Develop on your PC (optional)

Live-reload while changing the code, using the Expo Go app:

```powershell
npm install
npx expo install --fix
npx expo start
```

Scan the QR code with the phone camera. `npm run web` opens the web version on the PC; `npm run build:web` writes the installable build to `dist/` (set `WEB_BASE_URL=/OpenPlate` when it is served from a sub-folder). The project uses Expo **SDK 54**; Expo Go on the phone must support the same SDK (shown in Expo Go → Settings).

## Set up the AI photo feature

In the app: **Profile → AI settings**. Choose a primary and (optionally) a fallback AI.

| Provider | Cost | What you need |
|---|---|---|
| Google Gemini | free tier | Key from <https://aistudio.google.com/apikey>. On the free tier Google may use requests to improve its products. |
| Ollama (your PC) | free | See below |
| LM Studio (your PC) | free | Load a vision model, Developer tab → start server, enable *Serve on Local Network*. Address `http://<PC-IP>:1234/v1` |
| Claude | pay per use | Key from <https://console.anthropic.com> |
| OpenAI | pay per use | Key from <https://platform.openai.com/api-keys> |

Model names are editable in the app; defaults are `gemini-3.8-flash`, `claude-sonnet-5-5`, `gpt-6-luna`, `qwen2.5vl:7b`. Providers rename models from time to time, so if a test fails with "model not found", check the provider's model list.

**Ollama on Windows (free, private)**

1. Install from <https://ollama.com/download>.
2. Download a vision model: `ollama pull qwen2.5vl:7b` (about 6 GB; smaller alternative: `gemma3:4b`).
3. Let the iPhone reach it: Windows Settings → *Edit environment variables for your account* → new variable `OLLAMA_HOST` = `0.0.0.0` → quit Ollama from the tray and start it again. Allow it through the firewall on private networks.
4. Find your PC's address with `ipconfig` (IPv4 address, e.g. `192.168.178.20`).
5. In the app, set *Server address* to `http://192.168.178.20:11434/v1` and tap **Test connection**. Plain `http` is only accepted for addresses in your own network (192.168.x.x, 10.x.x.x, *.local, Tailscale); anything else needs `https`, so photos and keys never travel unencrypted over the internet.

A local 7B model on a normal PC takes roughly 10–60 seconds per photo and is less accurate than the cloud models; using it as primary with Gemini as fallback works well.

The same AI also reads nutrition labels (**Scan → Read nutrition label**, or **Complete from the label** on a product with missing values). There it only copies printed numbers; the app checks them (kJ vs kcal, calories vs macros, sugar vs carbs, nothing above 100 g per 100 g) and you compare them with the photo before saving.

API keys are stored in the phone's secure storage (expo-secure-store: iOS Keychain, Android Keystore) and only ever sent to the provider they belong to. Backups never contain keys, and importing a backup never changes AI server addresses or providers.

## Safety

OpenPlate counts calories, which can do harm to people who are still growing or who struggle with eating. So:

- Weight-loss goals and fasting plans are for adults (18+). Under 18 the goal is what keeps your weight.
- No weight loss is planned at a BMI of 18.5 or below, and targets below a BMI of 18.5 can't be set.
- Automatic goals never go below 1,200 kcal (women) / 1,500 kcal (men), or below maintenance when that is lower. Adults can type a lower exact goal, down to 800 kcal, and get a clear warning.
- Streaks never reward eating far less than the goal.
- Nutrition from outside (Open Food Facts, its photo AI, your label photos, backups) goes through the same plausibility checks; values from photos are never logged without you checking them first.
- Backup files are checked row by row: implausible values, remote images (which could track who opens the app) and anything the app wouldn't create itself are left out.

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
  scan.tsx              barcode scanner
  photo.tsx             AI photo flow
  custom-food.tsx       create food / quick add / check values from a label or Open Food Facts
  label.tsx             read a nutrition table from a photo
  meal.tsx, meal-edit.tsx  saved meals: log / build
  (tabs)/recipes.tsx, recipe.tsx, recipe-edit.tsx  recipes: list / view / edit
  streak.tsx            streak and calendar
  appearance.tsx        themes, colours, animations
  layout-settings.tsx   tab and diary order
  ai-settings.tsx       bring-your-own-AI setup
src/lib/
  ai.ts                 providers, prompt, JSON parsing, fallback logic
  nutrition.ts          BMR/TDEE, goals, macros
  goals.ts              the goal for a given day (weight on that day, fasting days)
  streaks.ts            streaks, goal-hit days, calendar grid
  meals.ts              saved meals
  recipes.ts            recipes (nutrition, scaling, community format and checks)
  communityRecipes.ts   community recipes (see RECIPES.md)
  themes.ts, layout.ts  colour themes and tab/diary layout
  openFoodFacts.ts      barcode lookup and search, Robotoff suggestions, link to add products
  labelScan.ts          nutrition label prompt and parser, plausibility checks for outside nutrition data
  genericFoods.ts       built-in basic foods
  bls.ts, blsData.ts    German nutrient database (BLS 4.0) search and data
  fasting.ts            plans and phases
  i18n.ts               German and English texts
  store.ts              persisted state (zustand + AsyncStorage; IndexedDB on the web)
  backup.ts             export / import format
  *.web.ts(x)           browser versions of device, storage, secure, BarcodeScanner
public/icons/           home-screen icons for the web version
scripts/web-pwa.mjs     turns the web export into an installable, offline web app
tests/logic.test.ts     tests for the logic modules (npm test)
```

Checks: `npm run check` (TypeScript) and `npm test` (logic tests). Pull requests and branches also run `.github/workflows/check.yml`: type check, tests, a web build and `scripts/web-smoke.mjs`, which clicks through the web app in a headless browser (light and dark). It never publishes anything.

## Not included yet

On the list for later:

- **Apple Health / Health Connect sync.** Steps already come from the phone's motion sensor.
- Meal plans, watch apps, cloud sync / accounts.
- App Store / Play Store listings.


## Credits and licence

- Code: MIT, see `LICENSE`.
- Product data: © Open Food Facts contributors, [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The app shows this attribution wherever their data appears.
- Built-in basic foods: approximate averages compiled from public references such as USDA FoodData Central.
- Bundeslebensmittelschlüssel (BLS) 4.0: Max Rubner-Institut, Karlsruhe, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), <https://doi.org/10.25826/Data20251217-134202-0>. Bundled as `src/lib/blsData.ts` (energy, macros, fibre, sugar, saturated fat, salt), generated with `python3 scripts/import_bls.py BLS_4_0_Daten_2025_DE.xlsx` from the download at <https://blsdb.de>.

OpenPlate is an independent project and is not affiliated with any commercial nutrition app. It is not medical advice.
