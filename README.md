# OpenPlate

A free, open-source calorie tracker for iPhone, built with Expo (React Native).
German and English, light and dark mode, all data stays on the phone.

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
- **Steps** from the iPhone motion sensor, optionally added to the calorie budget
- **Export** all data as JSON

---

## Run it on your iPhone from a Windows PC

You need: a Windows PC, an iPhone, both on the same Wi-Fi. No Mac and no Apple developer account.

1. **Install Node.js** (LTS) from <https://nodejs.org>.
2. **Install Expo Go** on the iPhone from the App Store.
3. **Check the Expo SDK.** This project targets **SDK 54**, the newest Expo Go version confirmed on the App Store when it was written (newer ones were stuck in review). Open Expo Go → Settings to see which SDK your copy supports. If it's newer, run in the project folder:
   ```powershell
   npx expo install expo@^<SDK>.0.0
   npx expo install --fix
   ```
4. **Install and start** (PowerShell in the project folder):
   ```powershell
   npm install
   npx expo install --fix
   npx expo start
   ```
5. Scan the QR code with the iPhone **Camera** app → it opens in Expo Go.
   - Windows Firewall asks about Node.js: allow it on **private networks**.
   - Not on the same network (or the QR code won't connect)? Use `npm run tunnel`.

> Expo Go loads the app from your PC, so `npx expo start` must be running when you open it. Your diary data is stored on the phone (inside Expo Go) and survives restarts. Deleting Expo Go deletes it, so use *Profile → Export data* now and then.

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

## Put it on GitHub

```powershell
git remote add origin https://github.com/<you>/openplate.git
git push -u origin main
```

Then replace the placeholder URL in `USER_AGENT` in `src/lib/openFoodFacts.ts` with your repository URL. Open Food Facts asks apps to identify themselves.

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
  store.ts              persisted state (zustand + AsyncStorage)
tests/logic.test.ts     tests for the logic modules (npm test)
```

Checks: `npm run check` (TypeScript) and `npm test` (logic tests).

## Not included yet

These need more work or a native build that Expo Go can't run:

- **Apple Health sync** needs a custom native build, which requires a Mac or a paid Apple developer account. Steps work without it via the motion sensor.
- **Recipes**, meal plans, Apple Watch app, cloud sync / accounts.
- A standalone App Store install (same reason as Apple Health).

## Credits and licence

- Code: MIT, see `LICENSE`.
- Product data: © Open Food Facts contributors, [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). The app shows this attribution wherever their data appears.
- Built-in basic foods: approximate averages compiled from public references such as USDA FoodData Central.

OpenPlate is an independent project and is not affiliated with any commercial nutrition app. It is not medical advice.
