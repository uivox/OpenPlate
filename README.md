# OpenPlate

A free, open-source calorie tracker for iPhone, Android and the browser, built with Expo (React Native).
German and English, light and dark mode, all data stays on your device.

**Features**

- **Food diary** with breakfast, lunch, dinner and snacks, calorie ring, macro bars and per-meal targets
- **Food search**: ~100 built-in basics, the complete **German nutrient database BLS 4.0** (7,140 foods and dishes in German and English, works offline) and millions of packaged products from [Open Food Facts](https://world.openfoodfacts.org). Products sold in Germany come first; start with a supermarket ("Lidl Skyr", "Aldi Joghurt") to see its products and house brands first.
- **Barcode scanner** (EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14) with Open Food Facts lookup, on the phone and in the browser. You can also type the number in, in the scanner (also without camera access) or straight into the food search. The check digit is checked first, so a mistyped or misread number is reported as *not a valid barcode* and can be corrected, instead of being looked up. Without a connection the scanner says so and offers to type the values in, which works offline. When a product is missing or has no nutrition there:
  - values that Open Food Facts' photo AI ([Robotoff](https://github.com/openfoodfacts/robotoff)) already read off a package photo are offered as a suggestion, no account or key needed;
  - **photograph the nutrition table** and your own AI copies the printed values (it doesn't estimate);
  - or type the values in. Every value is checked for plausibility and shown next to the photo before you save it, and a link takes you to Open Food Facts to add the product there for everyone.
- **AI photo logging** with *your own* AI: Claude, OpenAI, Google Gemini (free tier), or a model running on your own PC via Ollama / LM Studio. Primary + fallback provider; the fallback is asked when the first fails or is unsure, and the more confident answer wins. Every item and portion can be corrected before saving.
- **Quick add**, **custom foods**, **recent foods**, **copy a meal from yesterday**
- **My meals**: save the foods you always eat together (e.g. your breakfast) and log them with one tap, at any portion size. Build them from search, recent foods and the barcode scanner, or save a meal straight from the diary.
- **Personal plan** from a short onboarding (Mifflin-St Jeor + activity level + weekly pace). Or set it exactly: your own daily kcal, any weekly pace (e.g. +0.4 kg), your own activity factor or maintenance calories, macros as presets, custom percentages or grams.
- **Recipes tab**: your own recipes (photo, servings, steps, ingredients from the food search; nutrition calculated from the ingredients) and community recipes added through pull requests and marked as tested once someone else has cooked them ([how to add one](docs/RECIPES.md)). Scale the ingredients to any number of servings and log a serving with one tap.
- **Streak and calendar**: a streak counter on the diary and a month calendar showing which days you logged and whether you hit your goal (±5 %, with 10 % room in the goal's direction; eating far less than the goal never counts as a hit)
- **Make it yours**: seven themes in light and dark (including a glowing Neon one), your own button and macro colours, three animation levels, tab order and visibility, add button left/centre/right, diary section order
- **Intermittent fasting**: 12:12, 14:10, 16:8, 18:6, 20:4, 23:1 timers with phases, adjustable start time and a notification when you reach the goal; 5:2 and 6:1 with chosen fasting days that lower the calorie goal automatically
- **Water tracker** with tappable glasses
- **Weight log** with chart (30/90/365 days), BMI, progress towards the target
- **Steps** from the iPhone motion sensor or, on Android, from Health Connect, optionally added to the calorie budget (not in the web version, see [Differences between platforms](#differences-between-platforms))
- **Export and import** all data as a JSON file, on the phone and in the web version (moving between them works too). Your data only lives on your device, so the diary reminds you to save a copy two weeks after you start and then once a month ("Later" hides it for a week).
- **Offline product data** (Profile → *Offline product data*): download the products sold in Germany from Open Food Facts once (the size is shown first), and barcodes and product search work without a connection. Updated weekly; the app only downloads when you tap *Download* or *Update*, and every download is checked against OpenPlate's signature before it is used.
- **Web version** that installs on the iPhone home screen, works offline and keeps everything in the browser on your device

---

## Differences between platforms

The iPhone app, the Android app and the web version have the same features. Where one lacks something, it is because the platform doesn't allow it, and the app says so where it matters:

| | iPhone | Android | Web version |
|---|---|---|---|
| Steps | from the motion sensor (*Motion & Fitness* must be allowed); the iPhone keeps about 7 days | from Health Connect (reading steps must be allowed; built into Android 14+, from the Play Store on Android 9–13). Shows the steps that apps or the phone write there (e.g. Google Fit, Samsung Health, Fitbit), the same total as the Health Connect app. Older days: back to 30 days before the permission was first given | not available: browsers can't read the step counter |
| Fasting notification | also when the app is closed | also when the app is closed | only while the app is open (browsers can't schedule notifications without a push server; on the iPhone it needs the home-screen app, iOS 16.4+) |
| API keys | iOS Keychain | Android Keystore | this browser's storage for this site |
| Local AI server (Ollama / LM Studio) | `http` in your own network | `http` in your own network | must be `https`: browsers block plain `http` from an `https` page |
| Camera permission after saying no | *Allow camera* opens the settings | *Allow camera* opens the settings | only in the browser's site settings; *Try camera again* asks once more |
| Haptic feedback | yes | yes | no (Safari has no vibration support) |
| Apple Health / Health Connect | not available: HealthKit needs a paid Apple developer account, SideStore installs with a free Apple ID | reads steps only; nothing is written back (see *Not included yet*) | not available |

Everything else works the same everywhere: barcode scanner (camera or typed number), offline product data, label and meal photos, export and import (up to 100 MB), recipes, fasting plans, themes and layout.

## Install on your phone

New versions of the apps are published under **[Releases](https://github.com/uivox/OpenPlate/releases/latest)**; the web version updates itself.

### iPhone or any phone, in the browser (no install tools needed)

The web version runs in Safari and can be added to the home screen, where it opens full-screen like an app and works offline.

1. On the iPhone, open **<https://openplate-app.github.io/>** in **Safari**.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open OpenPlate from the home screen icon.

Your data is stored only in that home-screen app on this phone (IndexedDB). It does not sync and is separate from Safari tabs and from the SideStore app. Use *Profile → Export data* now and then as a backup; *Import data* restores an export, including one from the native app.

The web version has the same features as the apps, apart from the few things browsers can't do; see [Differences between platforms](#differences-between-platforms).

### Android

1. On the phone (Android 8 or newer), open the latest release and download **OpenPlate.apk**.
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

## Privacy and security

- **No accounts, no OpenPlate server, no analytics.** Diary, weights, recipes and settings are stored only on your device (app storage; IndexedDB in the browser) and only leave it when you export them.
- **What goes over the network:** food searches and barcodes go to Open Food Facts (and its Robotoff service); product pictures are loaded from Open Food Facts' image servers when shown; meal and label photos go only to the AI provider you set up, with your own key. When you download the offline product data, GitHub (which hosts it, and the web version) sees that request; searches in that data and barcodes found in it stay on your device. These services and GitHub see your IP address. Nothing is sent to the OpenPlate project.
- **Web version:** served from a site of its own, so no other website shares its storage. A Content Security Policy only lets the app's own code run there, and no referrer is sent to other servers. API keys are stored in that site's browser storage on your device.
- **Backups are the only copy outside your device.** Deleting the app (or, for the web version, its home-screen icon) deletes the data, so the diary reminds you to save a copy now and then. On the iPhone, the home-screen web app has its own storage, separate from Safari.
- Anyone who can unlock your phone can open the app; there is no separate app lock.
- **The project itself:** `main` only changes through pull requests that pass the checks; GitHub scans the code (CodeQL), secrets and dependencies (Dependabot). Any dependency alerts still open are in build tools that never reach your device and have no fixed version yet.
- Found a security problem? Please report it privately, see [SECURITY.md](.github/SECURITY.md).

## Not included yet

On the list for later:

- **Apple Health / Health Connect sync.** Steps already come from the iPhone's motion sensor and from Health Connect on Android. Writing meals, water and weight to Health Connect is not done yet.
- Meal plans, watch apps, cloud sync / accounts.
- App Store / Play Store listings.
- **Uploading products to Open Food Facts from the app.** Today the app links to their website; direct uploads need a login (OAuth) that Open Food Facts first has to set up for OpenPlate.

## Contributing

Recipes, fixes and ideas are welcome. Setting up the code, the project layout and how releases are built: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Credits and licence

- Code: MIT, see `LICENSE`.
- Product data: © Open Food Facts contributors, [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The app shows this attribution wherever their data appears.
- Built-in basic foods: approximate averages compiled from public references such as USDA FoodData Central.
- Bundeslebensmittelschlüssel (BLS) 4.0: Max Rubner-Institut, Karlsruhe, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), <https://doi.org/10.25826/Data20251217-134202-0>. Bundled with the app (energy, macros, fibre, sugar, saturated fat, salt), from the download at <https://blsdb.de>.

OpenPlate is an independent project and is not affiliated with any commercial nutrition app. It is not medical advice.
