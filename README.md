# OpenPlate

A free, open-source calorie tracker for iPhone, Android and the browser, built with Expo (React Native).
German and English, light and dark mode, all data stays on your device.

**Features**

- **Food diary** with breakfast, lunch, dinner and snacks, calorie ring, macro bars and per-meal targets
- **Food search**: ~100 built-in basics (German and English names) plus millions of packaged products from [Open Food Facts](https://world.openfoodfacts.org)
- **Barcode scanner** (EAN-13/8, UPC) with Open Food Facts lookup; unknown products can be created on the spot
- **AI photo logging** with *your own* AI: Claude, OpenAI, Google Gemini (free tier), or a model running on your own PC via Ollama / LM Studio. Primary + fallback provider; the fallback is asked when the first fails or is unsure, and the more confident answer wins. Every item and portion can be corrected before saving.
- **Quick add**, **custom foods**, **recent foods**, **copy a meal from yesterday**
- **Personal plan** from a short onboarding (Mifflin-St Jeor + activity level + weekly pace), four macro presets
- **Intermittent fasting**: 12:12, 14:10, 16:8, 18:6, 20:4, 23:1 timers with phases, adjustable start time and a notification when you reach the goal; 5:2 and 6:1 with chosen fasting days that lower the calorie goal automatically
- **Water tracker** with tappable glasses
- **Weight log** with chart (30/90/365 days), BMI, progress towards the target
- **Steps** from the iPhone motion sensor, optionally added to the calorie budget (iPhone only; Android doesn't offer daily step history to apps without Health Connect)
- **Export** all data as JSON (the web version can also import it)
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
5. In the app, set *Server address* to `http://192.168.178.20:11434/v1` and tap **Test connection**.

A local 7B model on a normal PC takes roughly 10–60 seconds per photo and is less accurate than the cloud models; using it as primary with Gemini as fallback works well.

API keys are stored in the iOS Keychain (expo-secure-store) and only ever sent to the provider they belong to.

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
  custom-food.tsx       create food / quick add
  ai-settings.tsx       bring-your-own-AI setup
src/lib/
  ai.ts                 providers, prompt, JSON parsing, fallback logic
  nutrition.ts          BMR/TDEE, goals, macros
  openFoodFacts.ts      barcode lookup and search
  genericFoods.ts       built-in basic foods
  fasting.ts            plans and phases
  i18n.ts               German and English texts
  store.ts              persisted state (zustand + AsyncStorage; IndexedDB on the web)
  backup.ts             export / import format
  *.web.ts(x)           browser versions of device, storage, secure, BarcodeScanner
public/icons/           home-screen icons for the web version
scripts/web-pwa.mjs     turns the web export into an installable, offline web app
tests/logic.test.ts     tests for the logic modules (npm test)
```

Checks: `npm run check` (TypeScript) and `npm test` (logic tests).

## Not included yet

On the list for later:

- **Apple Health / Health Connect sync.** Steps already come from the phone's motion sensor.
- **Recipes**, meal plans, watch apps, cloud sync / accounts.
- App Store / Play Store listings.

## Credits and licence

- Code: MIT, see `LICENSE`.
- Product data: © Open Food Facts contributors, [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The app shows this attribution wherever their data appears.
- Built-in basic foods: approximate averages compiled from public references such as USDA FoodData Central.

OpenPlate is an independent project and is not affiliated with any commercial nutrition app. It is not medical advice.
