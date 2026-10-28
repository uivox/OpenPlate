// Clicks through the main flows of the built web app in a headless browser and fails on crashes.
// Usage (after `npm run build:web` with an empty WEB_BASE_URL):
//   npm i --no-save playwright && npx playwright install chromium && node scripts/web-smoke.mjs dist
// Screenshots land in smoke-shots/. Failures print the step and the visible page text.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = process.argv[2] ?? 'dist';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(root, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4173, r));
const url = 'http://localhost:4173/';
mkdirSync('smoke-shots', { recursive: true });

// A backup file as an attacker would craft it: redirect the OpenAI key, track who opens the app
// with remote images, and crash screens with wrong types. The import must neutralise all of it.
const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const food = { id: 'x', source: 'custom', name: 'Hostile pasta', per100: { kcal: 150, protein: 5, carbs: 30, fat: 1 }, servings: [], imageUrl: 'https://tracker.example/food.png' };
const HOSTILE_BACKUP = {
  app: 'OpenPlate',
  profile: { sex: 'female', birthYear: 1990, heightCm: 168, startWeightKg: 70, targetWeightKg: 65, activity: 'light', goal: 'lose', paceKgPerWeek: 0.5, macroSplit: { carbs: 50, protein: 20, fat: 30 }, waterGoalMl: 2000, glassMl: 250, stepGoal: 8000, addActivityCalories: false, fastingPlanId: '16:8', fastingDays: [], createdAt: 0 },
  language: 'en',
  entries: [{ id: 'e1', date: todayKey, meal: 'lunch', grams: 200, food, createdAt: 0 }],
  recipes: [{ id: 'r1', name: 'Evil stew', servings: 2, steps: [{ evil: 1 }, 'Stir.'], items: [{ food, grams: 300 }], photo: 'https://tracker.example/pixel.gif', tags: 'x' }],
  ai: { primary: 'openai', providers: { openai: { model: 'gpt-x', baseUrl: 'https://attacker.example/v1' }, local: { model: 'm', baseUrl: 'http://attacker.example/v1' } } },
  appearance: { accent: 123, macroColors: 'red' },
  layout: { hiddenTabs: 5 },
};

// 1×1 PNG, as a photo from the camera would arrive through the file input.
const PHOTO_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch();
let failed = false;

async function run(scheme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', colorScheme: scheme, deviceScaleFactor: 2 });
  // Collects Content Security Policy violations; any violation fails the step it happened in.
  await ctx.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI || '(inline)'}`));
  });
  const page = await ctx.newPage();
  const crashes = [];
  const cspViolations = () => page.evaluate(() => window.__csp ?? []).catch(() => []);
  page.on('pageerror', (e) => crashes.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${scheme} console] ${m.text().slice(0, 300)}`));
  page.setDefaultTimeout(15000);
  let stepName = 'start';
  let n = 0;
  const step = async (name, fn) => {
    stepName = name;
    await fn();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `smoke-shots/${scheme}-${String(++n).padStart(2, '0')}-${name.replace(/\W+/g, '_')}.png` });
    if (crashes.length) throw new Error(`page error: ${crashes.join(' | ')}`);
    const csp = await cspViolations();
    if (csp.length) throw new Error(`CSP violation: ${csp.join(' | ')}`);
  };
  // Buttons with an icon get the icon font's glyph in their accessible name, so match the label at the end.
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Screens further back in the stack (and other tabs) stay in the page, hidden, so only look at visible elements.
  const btn = (name) =>
    page
      .getByRole('button', { name: new RegExp(`(^|[^\\w ]\\s*)${esc(name)}$`) })
      .filter({ visible: true })
      .first();
  const text = (t, opts) => page.getByText(t, opts).filter({ visible: true }).first();
  const field = (placeholder) => page.getByPlaceholder(placeholder).filter({ visible: true }).first();
  const idbGet = (key) =>
    page.evaluate(
      (k) =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('openplate');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const req = open.result.transaction('kv', 'readonly').objectStore('kv').get(k);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
          };
        }),
      key,
    );
  const idbKeys = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('openplate');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const req = open.result.transaction('kv', 'readonly').objectStore('kv').getAllKeys();
            req.onsuccess = () => resolve(req.result.map(String));
            req.onerror = () => reject(req.error);
          };
        }),
    );
  const trackerHits = [];
  page.on('request', (r) => r.url().includes('tracker.example') && trackerHits.push(r.url()));

  try {
    await step('onboarding', async () => {
      await page.goto(url);
      await btn('English').click();
      await btn('Next').click();
      await text('Your data stays yours', { exact: true }).waitFor();
      for (let i = 0; i < 5; i++) await btn('Next').click();
      await btn("Let's go").click();
      await text('Breakfast', { exact: true }).waitFor();
    });
    await step('CSP is active and blocks injected scripts', async () => {
      const policy = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '');
      if (!policy.includes("script-src 'self'")) throw new Error(`no CSP meta tag: "${policy}"`);
      const referrer = await page.evaluate(() => document.querySelector('meta[name="referrer"]')?.getAttribute('content'));
      if (referrer !== 'no-referrer') throw new Error(`referrer policy missing: ${referrer}`);
      await page.evaluate(() => {
        const s = document.createElement('script');
        s.textContent = 'window.__pwned = true';
        document.body.appendChild(s);
      });
      await page.waitForTimeout(200);
      if (await page.evaluate(() => window.__pwned === true)) throw new Error('an injected inline script ran');
      const seen = await cspViolations();
      if (!seen.some((v) => v.startsWith('script-src'))) throw new Error(`injected script was not reported as blocked: ${seen.join(' | ')}`);
      await page.evaluate(() => (window.__csp = []));
    });
    for (const food of ['Apple', 'Banana']) {
      await step(`log ${food}`, async () => {
        await btn('Add food: Breakfast').click();
        await field('Search foods and products').fill(food.toLowerCase());
        await text(food, { exact: true }).click();
        await btn('Add').click();
        await text(food, { exact: true }).waitFor();
      });
    }
    await step('BLS search', async () => {
      await btn('Add food: Lunch').click();
      await field('Search foods and products').fill('oat flakes');
      await text('Oat flakes', { exact: true }).waitFor();
      await text(/Bundeslebensmittelschlüssel/).waitFor();
      await page.goBack();
    });
    await step('amount wheel: fractions of a serving and switching units', async () => {
      await btn('Add food: Lunch').click();
      await field('Search foods and products').fill('apple');
      await text('Apple', { exact: true }).click();
      const amount = page.getByLabel('Amount', { exact: true }).filter({ visible: true }).first();
      if ((await amount.inputValue()) !== '1') throw new Error(`default amount: ${await amount.inputValue()}`);
      await text('94', { exact: true }).waitFor(); // 1 medium apple, 180 g
      await page.getByText('½', { exact: true }).filter({ visible: true }).first().click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '1.5'));
      await text('140', { exact: true }).waitFor(); // 270 g
      await text('= 270 g', { exact: true }).waitFor();
      // The mouse wheel turns a column by one step per notch.
      await page.getByRole('slider', { name: 'Amount, whole number' }).filter({ visible: true }).first().hover();
      await page.mouse.wheel(0, 40);
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '2.5'));
      await text('234', { exact: true }).waitFor(); // 450 g
      // Grams keep the same amount of food.
      await page.getByText('Grams', { exact: true }).filter({ visible: true }).first().click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '450'));
      await text('234', { exact: true }).waitFor();
      // Typing still works and moves the wheel.
      await amount.fill('100');
      await text('52', { exact: true }).waitFor();
      await page.getByText('1 medium (180 g)', { exact: true }).filter({ visible: true }).first().click();
      await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === '0.56'));
      await page.goBack();
      await page.goBack();
      await btn('Add food: Lunch').waitFor();
    });
    await step('save as meal', async () => {
      await btn('Save as meal').click();
      await btn('Save meal').click();
      await btn('Add food: Breakfast').waitFor();
    });
    await step('log saved meal', async () => {
      await btn('Add food: Breakfast').click();
      await btn('My meals').click();
      await text('2 foods', { exact: false }).waitFor();
      await btn('Add: Breakfast').click();
      await page.waitForFunction(() => document.body.innerText.split('Apple').length - 1 >= 2);
    });
    await step('diary: fold a meal down to its header and open it again', async () => {
      const apples = () => page.getByText('Apple', { exact: true }).filter({ visible: true }).count();
      if ((await apples()) < 1) throw new Error('no Apple entry to fold');
      await page.getByTestId('meal-toggle-breakfast').filter({ visible: true }).first().click();
      await page.waitForFunction(() => ![...document.querySelectorAll('*')].some((e) => e.childElementCount === 0 && e.textContent === 'Apple' && e.offsetParent));
      await text(/kcal · \d+ foods?$/).waitFor(); // the folded header says how many foods it holds
      await btn('Add food: Breakfast').waitFor(); // adding still works while folded
      await page.reload();
      await text('Breakfast', { exact: true }).waitFor();
      if ((await apples()) !== 0) throw new Error('folded meal opened again after a reload');
      await page.getByTestId('meal-toggle-breakfast').filter({ visible: true }).first().click();
      await text('Apple', { exact: true }).waitFor();
    });
    await step('diary: drag sideways to tomorrow and back to yesterday', async () => {
      const drag = async (fromX, toX) => {
        const y = 420;
        await page.mouse.move(fromX, y);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) await page.mouse.move(fromX + ((toX - fromX) * i) / 12, y + i % 2);
        await page.mouse.up();
        await page.waitForTimeout(450);
      };
      await drag(340, 40); // to the left: next day, which can be planned now
      await text('Tomorrow', { exact: true }).waitFor();
      await drag(40, 340);
      await text('Today', { exact: true }).waitFor();
      await text('Apple', { exact: true }).waitFor();
      await drag(40, 340); // to the right: previous day
      await text('Yesterday', { exact: true }).waitFor();
      if (await page.getByText('Apple', { exact: true }).filter({ visible: true }).count()) throw new Error('today’s food shown on yesterday');
      // a short drag springs back without changing the day
      await drag(200, 240);
      await text('Yesterday', { exact: true }).waitFor();
      await btn('Next day').click();
      await text('Today', { exact: true }).waitFor();
    });
    await step('streak', async () => {
      await page.getByRole('button', { name: /^Streak:/ }).filter({ visible: true }).first().click();
      await text('current streak').waitFor();
      await page.goBack();
    });
    await step('parity: the steps card says why there are no steps', async () => {
      await text('Browsers can’t read the step counter. The iPhone and Android apps show your steps.').waitFor();
    });
    await step('parity: fasting says the notification needs the app open', async () => {
      await page.getByRole('tab', { name: 'Fasting' }).click();
      await btn('Start fasting').click();
      await text(/notification only comes while OpenPlate is open/).waitFor();
      await btn('End fast').click();
      await text('End your fast early?').waitFor();
      // the dialog's button, not the one on the timer card behind it
      await page.getByRole('button', { name: /End fast$/ }).filter({ visible: true }).last().click();
      await btn('Start fasting').waitFor();
      await page.getByRole('tab', { name: 'Diary' }).click();
    });
    await step('reminders: switching on asks for notifications and fills in the times', async () => {
      await ctx.grantPermissions(['notifications'], { origin: url.slice(0, -1) });
      // Record what would be shown instead of showing it (headless Chromium has no notification centre).
      await page.evaluate(() => {
        window.__shown = [];
        const record = (title, opts) => window.__shown.push({ title, body: opts?.body, data: opts?.data });
        if (window.ServiceWorkerRegistration)
          ServiceWorkerRegistration.prototype.showNotification = function (title, opts) {
            record(title, opts);
            return Promise.resolve();
          };
        window.Notification = class extends EventTarget {
          static permission = 'granted';
          static requestPermission = async () => 'granted';
          constructor(title, opts) {
            super();
            record(title, opts);
          }
          close() {}
        };
      });
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('Meal reminders', { exact: true }).click();
      await text(/reminders only come while OpenPlate is open/).waitFor();
      if (await page.getByTestId('reminder-time-dinner').filter({ visible: true }).count()) throw new Error('times shown while reminders are off');
      await page.getByTestId('reminders-switch').filter({ visible: true }).first().click();
      await text('Times', { exact: true }).waitFor();
      const dinner = page.getByTestId('reminder-time-dinner').filter({ visible: true }).first();
      if ((await dinner.inputValue()) !== '19:00') throw new Error(`dinner time not pre-filled: ${await dinner.inputValue()}`);
      // Snacks start off; a typed time that isn't one is refused.
      if (await page.getByTestId('reminder-time-snack').filter({ visible: true }).count()) throw new Error('snack reminder on by default');
      await dinner.fill('25:00');
      await dinner.press('Enter');
      await text('Enter a time like 12:30.').waitFor();
      await dinner.fill('19:00');
      await dinner.press('Enter');
    });
    await step('reminders: an empty dinner gets a reminder, and a tap opens its add screen', async () => {
      const now = new Date();
      // Dinner is still empty here. Set it so time + 30 min is the next full minute (light run only: it waits for the clock).
      const fireAt = new Date(now.getTime() + 60000);
      fireAt.setSeconds(0, 0);
      const wait = scheme === 'light' && fireAt.getDate() === now.getDate();
      const mins = fireAt.getHours() * 60 + fireAt.getMinutes() - 30;
      const dinner = page.getByTestId('reminder-time-dinner').filter({ visible: true }).first();
      const typed = wait && mins >= 0 ? `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` : '19:00';
      await dinner.fill(typed);
      await dinner.press('Enter');
      let reminder = { meal: 'dinner', date: todayKey };
      if (typed !== '19:00') {
        await page.waitForFunction(() => window.__shown.length > 0, null, { timeout: 150000 });
        const shown = await page.evaluate(() => window.__shown[0]);
        if (shown.title !== 'Dinner isn’t logged yet' || !/kcal left today\. Tap to log it\.$/.test(shown.body ?? ''))
          throw new Error(`unexpected reminder: ${JSON.stringify(shown)}`);
        reminder = shown.data?.reminder ?? reminder;
        console.log(`[${scheme}] reminder shown at ${new Date().toTimeString().slice(0, 8)}: ${shown.title} / ${shown.body}`);
        if (shown.data?.url && !shown.data.url.includes(`add-food?meal=dinner&date=${todayKey}`)) throw new Error(`reminder link: ${shown.data.url}`);
      }
      // What the service worker passes on when the reminder (or *Log now*) is tapped.
      await page.evaluate((r) => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'openplate-reminder', reminder: r } })), reminder);
      await field('Search foods and products').waitFor();
      await page.getByRole('heading', { name: 'Dinner' }).or(text('Dinner', { exact: true })).first().waitFor();
      await page.goBack();
    });
    await step('reminders: switching off hides the times and the profile says Off', async () => {
      await page.getByTestId('reminders-switch').filter({ visible: true }).first().click();
      await page.getByTestId('reminder-time-dinner').filter({ visible: true }).waitFor({ state: 'detached' }).catch(() => {});
      if (await page.getByTestId('reminder-time-dinner').filter({ visible: true }).count()) throw new Error('times still shown after switching off');
      await page.goBack();
      await text('Off', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Add food: Snacks').waitFor();
    });
    await step('meal split: presets, own values in percent and kcal, macros per meal', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('Meal split', { exact: true }).click();
      await text('Adds up to 100 %').waitFor();
      await btn('Three meals · 20/40/40/0').click();
      const pct = (meal) => page.getByLabel(`${meal} in Percent`).filter({ visible: true }).first();
      // Fields re-render after a tap; wait for the value instead of reading it once.
      const valueOf = async (loc, ok, what) => {
        for (let i = 0; i < 50; i++) {
          const v = await loc.inputValue();
          if (ok(v)) return v;
          await page.waitForTimeout(100);
        }
        throw new Error(`${what}: ${await loc.inputValue()}`);
      };
      await valueOf(pct('Snacks'), (v) => v === '0', 'preset not applied');
      await valueOf(pct('Lunch'), (v) => v === '40', 'preset not applied');
      await pct('Breakfast').fill('30');
      await text('10 % too much').waitFor();
      if (!(await btn('Save').isDisabled())) throw new Error('Save allowed while the split adds up to 110 %');
      await pct('Dinner').fill('30');
      await text('Adds up to 100 %').waitFor();
      // Typed in kcal, stored as percent of today's goal.
      await btn('kcal').click();
      const lunchKcal = page.getByLabel('Lunch in kcal').filter({ visible: true }).first();
      const lunchText = await valueOf(lunchKcal, (v) => Number(v.replace(/\D/g, '')) > 0, 'lunch kcal not shown');
      const goal = Math.round(Number(lunchText.replace(/\D/g, '')) / 0.4);
      await lunchKcal.fill(String(Math.round(goal * 0.3)));
      await text('10 % left to share').waitFor();
      await page.getByLabel('Snacks in kcal').filter({ visible: true }).first().fill(String(Math.round(goal * 0.1)));
      await text('Adds up to 100 %').waitFor();
      await page.getByRole('switch', { name: 'Macro targets per meal' }).filter({ visible: true }).first().click();
      await btn('Save').click();
      await text('30 / 30 / 30 / 10 %').waitFor();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await text(/^P \d+\/\d+ · C \d+\/\d+ · F \d+\/\d+ g$/).waitFor();
    });
    await step('eating window: fasts start by themselves; logging asks first, strict mode, skip', async () => {
      await page.getByRole('tab', { name: 'Fasting' }).click();
      await page.getByTestId('window-switch').filter({ visible: true }).first().click();
      // Window opens in an hour, so right now is inside the fast and it starts by itself.
      const opens = new Date(Date.now() + 3600000);
      const hhmm = `${String(opens.getHours()).padStart(2, '0')}:${String(opens.getMinutes()).padStart(2, '0')}`;
      const opensField = page.getByTestId('window-opens').filter({ visible: true }).first();
      await opensField.fill(hhmm);
      await opensField.press('Enter');
      await text('From your eating window').waitFor();
      await btn('Skip today’s fast').waitFor();
      // Strict mode: only "End fast & log".
      await page.getByTestId('window-strict-switch').filter({ visible: true }).first().click();
      await page.getByRole('tab', { name: 'Diary' }).click();
      const addApple = async () => {
        await btn('Add food: Snacks').click();
        await field('Search foods and products').fill('apple');
        await text('Apple', { exact: true }).click();
        await btn('Add').click();
        await text(/^You’re fasting until /).waitFor();
      };
      await addApple();
      await text('Strict mode is on: end your fast to log food.').waitFor();
      if (await btn('Log anyway').count()) throw new Error('“Log anyway” offered in strict mode');
      await btn('Cancel').click();
      await page.goBack();
      await page.goBack();
      // Not strict: "Log anyway" keeps the fast running.
      await page.getByRole('tab', { name: 'Fasting' }).click();
      await page.getByTestId('window-strict-switch').filter({ visible: true }).first().click();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await addApple();
      await btn('Log anyway').click();
      await btn('Add food: Snacks').waitFor();
      await text('Apple', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Fasting' }).click();
      await text('From your eating window').waitFor();
      // Skip today's fast: gone, not in the history, and it doesn't start again.
      await btn('Skip today’s fast').click();
      await text('Skip today’s fast?').waitFor();
      await page.getByRole('button', { name: /Skip$/ }).filter({ visible: true }).last().click();
      await btn('Start fasting').waitFor();
      await page.waitForTimeout(1500);
      if (await text('From your eating window').count()) throw new Error('skipped fast started again');
      // Logging food to another day never asks; switching the window off leaves manual fasting as before.
      await page.getByTestId('window-switch').filter({ visible: true }).first().click();
      await page.getByRole('tab', { name: 'Diary' }).click();
    });
    await step('exact goal', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('kcal per day').click();
      await btn('Exact number').click();
      await page.getByLabel('Daily goal').filter({ visible: true }).first().fill('2300');
      await btn('Save').click();
      await text('2300', { exact: true }).waitFor();
    });
    await step('exact goal: thousands separator in a whole-number field', async () => {
      await text('kcal per day').click();
      await page.getByLabel('Daily goal').filter({ visible: true }).first().fill('2.250');
      await btn('Save').click();
      await text('2250', { exact: true }).waitFor();
    });
    await step('progress: tiles, today so far, a past day in the average', async () => {
      await page.getByRole('tab', { name: 'Progress' }).click();
      await page.getByTestId('insight-energy').filter({ visible: true }).first().click();
      await text('In the last 30 days', { exact: true }).waitFor();
      await text(/^Today so far: .* kcal\. Averages start once a day is over\.$/).waitFor(); // only today has food yet
      await page.goBack();
      // log an apple yesterday: now there is a finished day to average
      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Previous day').click();
      await text('Yesterday', { exact: true }).waitFor();
      await btn('Add food: Breakfast').click();
      await field('Search foods and products').fill('apple');
      await text('Apple', { exact: true }).click();
      await btn('Add').click();
      await text('Yesterday', { exact: true }).waitFor();
      await text('Yesterday', { exact: true }).click(); // back to today
      await text('Today', { exact: true }).waitFor();
      await page.getByRole('tab', { name: 'Progress' }).click();
      await page.getByTestId('insight-energy').filter({ visible: true }).first().click();
      await text('Based on 1 logged day.', { exact: true }).waitFor();
      await text('94 kcal', { exact: true }).waitFor(); // yesterday's apple (180 g) is the average; today's food isn't
      await text('The lighter bar is today so far; it isn’t in the averages.').waitFor();
    });
    await step('progress: weekly, custom range, explanation, open a day', async () => {
      await btn('Weekly').click();
      await text(/logged days?$/).waitFor();
      await btn('Custom').click();
      await page.getByLabel('From').filter({ visible: true }).first().waitFor().catch(() => {});
      await text(/^Up to three years/).waitFor();
      await btn('30 days').click();
      await btn('Daily').click();
      await text('How this is calculated', { exact: true }).click();
      await text(/^Only days with entries count\./).waitFor();
      // a day in the history opens the diary on that day
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
      await page.getByRole('button', { name: new RegExp(`^${yesterday}`) }).filter({ visible: true }).first().click();
      await text('Yesterday', { exact: true }).waitFor();
      await text('Yesterday', { exact: true }).click();
      await text('Today', { exact: true }).waitFor();
    });
    await step('progress: macros as shares of the energy', async () => {
      await page.getByRole('tab', { name: 'Progress' }).click();
      await page.getByTestId('insight-macros').filter({ visible: true }).first().click();
      await text(/^Carbs: ⌀ \d+ g \(\d+ %\)$/).waitFor();
      await text('Carbs / protein / fat, as shares of the energy.').waitFor();
      await page.goBack();
    });
    await step('progress: decimal comma in the weight', async () => {
      await page.getByTestId('insight-weight').filter({ visible: true }).first().click();
      await page.locator('input:not([type="checkbox"])').filter({ visible: true }).first().fill('68,4');
      await btn('Save').click();
      await text('68.4 kg', { exact: true }).waitFor();
      await text('Update today’s weight').waitFor();
      await page.goBack();
      await text('68.4 kg', { exact: true }).waitFor(); // the weight tile shows it too
      await page.getByRole('tab', { name: 'Profile' }).click();
    });
    await step('appearance: neon theme', async () => {
      await text('Appearance', { exact: true }).click();
      await btn('Neon').click();
      await btn('Off').waitFor();
      await page.goBack();
    });
    await step('offline product data: screen opens and explains its state', async () => {
      await text('Offline product data', { exact: true }).click();
      // Without a signing key in this build it says so; with one it offers the download.
      await text(/Not available yet|Not downloaded|On this device/).waitFor();
      await text(/Open Database License/).waitFor();
      await page.goBack();
      await text('Offline product data', { exact: true }).waitFor();
    });
    await step('layout: hide fasting tab, add button right', async () => {
      await text('Layout', { exact: true }).click();
      await page.getByRole('switch', { name: 'Fasting' }).filter({ visible: true }).first().click();
      await btn('Right').click();
      await page.goBack();
      await page.getByRole('tab', { name: 'Diary' }).waitFor();
      if (await page.getByRole('tab', { name: 'Fasting' }).count()) throw new Error('Fasting tab still visible');
      await page.getByRole('tab', { name: 'Diary' }).click();
      await text('Breakfast', { exact: true }).waitFor();
    });
    await step('recipes: log a community recipe', async () => {
      await page.getByRole('tab', { name: 'Recipes' }).click();
      await text('Overnight oats with blueberries').click();
      await text('Ingredients for 1 serving').waitFor();
      await btn('Add to diary').click();
      await btn('Add').click();
      await text('Overnight oats with blueberries').waitFor();
    });
    await step('recipes: create own recipe', async () => {
      await page.getByRole('tab', { name: 'Recipes' }).click();
      await btn('New recipe').click();
      await field('e.g. Grandma’s lentil soup').fill('Test bowl');
      // "Take photo" works in the browser too: it opens the camera through the file input
      const chooser = page.waitForEvent('filechooser');
      await btn('Take photo').click();
      const picker = await chooser;
      if ((await picker.element().getAttribute('capture')) !== 'environment') throw new Error('Take photo does not ask for the camera');
      await picker.setFiles({ name: 'dish.png', mimeType: 'image/png', buffer: PHOTO_PNG });
      await btn('Remove photo').waitFor();
      await btn('Add ingredient').click();
      await field('Search foods and products').fill('banana');
      await text('Banana', { exact: true }).click();
      await btn('Add').click();
      await text('Banana', { exact: true }).waitFor();
      await btn('Save recipe').click();
      await text('Ingredients for 2 servings').waitFor();
      await text('Test bowl').waitFor();
      await page.goBack();
    });
    await step('scan: product without nutrition gets a Robotoff suggestion', async () => {
      // Open Food Facts knows the product but has no nutrition; its photo AI (Robotoff) read the label.
      // Both are faked here so the test doesn't depend on (or load) their servers.
      const json = (body) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
      await page.route('https://world.openfoodfacts.org/api/v2/product/**', (r) =>
        r.fulfill(json({ status: 1, product: { product_name: '', brands: 'Smoke Brand', quantity: '400 g', nutriments: {} } })),
      );
      await page.route('https://robotoff.openfoodfacts.org/**', (r) =>
        r.fulfill(
          json({
            insights: [
              {
                barcode: '4006446005476',
                annotation: null,
                source_image: '/400/644/600/5476/1.jpg',
                data: {
                  nutrients: {
                    'energy-kcal_100g': { value: '556', unit: 'kcal', score: 0.999 },
                    fat_100g: { value: '34', unit: 'g', score: 0.999 },
                    carbohydrates_100g: { value: '57', unit: 'g', score: 0.994 },
                    proteins_100g: { value: '4.8', unit: 'g', score: 0.999 },
                  },
                },
              },
            ],
          }),
        ),
      );
      await page.route('https://images.openfoodfacts.org/**', (r) => r.fulfill({ status: 404, body: '' }));
      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Add food: Snacks').click();
      await btn('Scan').click();
      await page.locator('input[inputmode="numeric"]').filter({ visible: true }).first().fill('4006446005476');
      await btn('Look up').click();
      await text(/Recognised automatically from a package photo/).waitFor();
      const prefilled = await page.evaluate(() => [...document.querySelectorAll('input')].some((i) => i.value === '556' && i.offsetParent));
      if (!prefilled) throw new Error('Robotoff calories not filled in');
      await page.getByRole('textbox').filter({ visible: true }).first().fill('Smoke nougat cream');
      await btn('Save and continue').click();
      await text(/recognised automatically from an Open Food Facts photo/).waitFor();
      await btn('Send to Open Food Facts').waitFor();
      await btn('Add').click();
      await text('Smoke nougat cream', { exact: true }).waitFor();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
    // Open Food Facts answers an unknown barcode with HTTP 404 and {"status":0}, with CORS headers.
    const cors = { 'access-control-allow-origin': '*' };
    const notFound = (r) => r.fulfill({ status: 404, contentType: 'application/json', headers: cors, body: JSON.stringify({ code: '0853640759131', status: 0, status_verbose: 'product not found' }) });
    const noInsights = (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ count: 0, insights: [], status: 'no_insights' }) });
    const manualField = () => page.locator('input[inputmode="numeric"]').filter({ visible: true }).first();
    const offRequests = [];
    const isOFF = (u) => {
      const host = new URL(u).hostname;
      return host === 'openfoodfacts.org' || host.endsWith('.openfoodfacts.org');
    };
    page.on('request', (r) => isOFF(r.url()) && offRequests.push(r.url()));
    await step('scan: unknown barcode leads to the choice screen', async () => {
      await page.route('https://world.openfoodfacts.org/api/v2/product/**', notFound);
      await page.route('https://robotoff.openfoodfacts.org/**', noInsights);
      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Add food: Snacks').click();
      await btn('Scan').click();
      // no camera in the headless browser: asking again keeps the type-in field working
      await btn('Try camera again').click();
      await text('Camera access needed', { exact: true }).waitFor();
      await manualField().fill('853640759131');
      await btn('Look up').click();
      await text('Product not found', { exact: true }).waitFor();
      await btn('Read nutrition label').waitFor();
      await btn('Type in').waitFor();
      if (await text('No connection', { exact: true }).count()) throw new Error('unknown barcode shown as a network error');
      await btn('Scan again').click();
    });
    await step('scan: wrong check digit is called invalid and can be corrected', async () => {
      const before = offRequests.length;
      await manualField().fill('853640759134');
      await btn('Look up').click();
      await text('This isn’t a valid barcode', { exact: true }).waitFor();
      await btn('Correct the number').click();
      if ((await manualField().inputValue()) !== '853640759134') throw new Error('the number is not in the field to correct');
      if (offRequests.length !== before) throw new Error(`an invalid barcode was sent: ${offRequests.slice(before).join(', ')}`);
    });
    await step('scan: no connection offers typing the values in', async () => {
      await page.unroute('https://world.openfoodfacts.org/api/v2/product/**');
      await page.route('https://world.openfoodfacts.org/api/v2/product/**', (r) => r.abort('internetdisconnected'));
      await manualField().fill('853640759131');
      await btn('Look up').click();
      await text('No connection', { exact: true }).waitFor();
      await btn('Try again').waitFor();
      await btn('Type in').click();
      await text('Barcode: 853640759131', { exact: true }).waitFor();
      await page.goBack();
      await page.goBack();
      await btn('Add food: Snacks').waitFor();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
    await step('own foods: edit a food from My foods & meals', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('My foods & meals', { exact: true }).click();
      await text(/^Tap an item to edit it/).waitFor(); // the list is open (the diary entry has the same name)
      await page.getByRole('button', { name: /Smoke nougat cream.*kcal \/ 100 g/ }).filter({ visible: true }).first().click();
      await text(/Your diary keeps the values it has/).waitFor();
      const kcal = page.locator('input').filter({ visible: true }).and(page.locator('input[value="556"]')).first();
      await kcal.fill('560');
      await btn('Save').click();
      await text('560 kcal / 100 g', { exact: false }).waitFor();
      await btn('My meals (1)').click();
      await text('Breakfast', { exact: true }).waitFor();
      await text(/2 foods/).waitFor();
      await page.goBack();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Add food: Snacks').waitFor();
    });
    // Open Food Facts is faked: sign-in (auth.pl), the product as it is now, the write and the photo upload.
    const offCors = { 'access-control-allow-origin': '*' };
    const offJson = (body, status = 200) => ({ status, contentType: 'application/json', headers: offCors, body: JSON.stringify(body) });
    const writes = [];
    let offProduct = {}; // code -> product the fake server knows
    const routeOff = async ({ offline = false } = {}) => {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.route('https://world.openfoodfacts.org/cgi/auth.pl', (r) => {
        const b = new URLSearchParams(r.request().postData() ?? '');
        return r.fulfill(b.get('password') === 'right' ? offJson({ status: 1, status_verbose: 'user signed-in', user_id: 'smoke-user' }) : offJson({ status: 0, status_verbose: 'user not signed-in' }, 403));
      });
      await page.route('https://world.openfoodfacts.org/api/v2/product/**', (r) => {
        if (offline) return r.abort('internetdisconnected');
        const code = new URL(r.request().url()).pathname.split('/').pop().replace('.json', '');
        return r.fulfill(offProduct[code] ? offJson({ status: 1, product: offProduct[code] }) : offJson({ status: 0, status_verbose: 'product not found' }, 404));
      });
      await page.route('https://world.openfoodfacts.org/cgi/product_jqm2.pl', (r) => {
        const b = new URLSearchParams(r.request().postData() ?? '');
        writes.push(b);
        return r.fulfill(offJson(b.get('code') === 'new' ? { status: 1, status_verbose: 'fields saved', code: '2000000000123' } : { status: 1, status_verbose: 'fields saved' }));
      });
    };
    const sent = (k) => writes[writes.length - 1]?.get(k) ?? null;
    await step('open food facts: sign in, a wrong password first', async () => {
      await routeOff();
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('Open Food Facts', { exact: true }).click();
      await text(/^Sign in with your own Open Food Facts account/).waitFor();
      await page.getByRole('textbox').filter({ visible: true }).first().fill('smoke@example.org');
      await page.locator('input[type="password"]').filter({ visible: true }).first().fill('wrong');
      await btn('Sign in').click();
      await text('Open Food Facts didn’t accept this user name and password.').waitFor();
      await page.locator('input[type="password"]').filter({ visible: true }).first().fill('right');
      await btn('Sign in').click();
      await text('Signed in as smoke-user').waitFor();
      // the password is kept apart from the app's data (and so never in a backup)
      const stored = await page.evaluate(() => localStorage.getItem('openplate_off_login'));
      if (!stored?.includes('"user":"smoke-user"')) throw new Error(`login not stored: ${stored}`);
      const keys = await idbKeys();
      for (const k of keys) if (JSON.stringify(await idbGet(k)).includes('"right"')) throw new Error(`password found in the app data (${k})`);
      await text('Waiting to send (0)').waitFor();
      await page.goBack();
    });
    await step('open food facts: a correction sends only what differs', async () => {
      // Open Food Facts has the product with another kcal value and its own name; the name stays
      offProduct['4006446005476'] = { code: '4006446005476', product_name: 'Nuss-Nougat-Creme', brands: 'Smoke Brand', nutriments: { 'energy-kcal_100g': 556 } };
      await page.getByRole('tab', { name: 'Diary' }).click();
      await text('Smoke nougat cream', { exact: true }).click();
      await btn('Send to Open Food Facts').click();
      await text('Correction for “Nuss-Nougat-Creme”').waitFor();
      await text('556 kcal → 560 kcal').waitFor();
      if (await page.getByText('Brand / shop', { exact: true }).filter({ visible: true }).count()) throw new Error('brand would be overwritten');
      await btn('Send').click();
      await text('Thank you!').waitFor();
      if (sent('code') !== '4006446005476' || sent('nutriment_energy-kcal') !== '560' || sent('user_id') !== 'smoke-user' || sent('password') !== 'right' || sent('no_log') !== '1')
        throw new Error(`wrong write: ${writes[writes.length - 1]}`);
      if (sent('product_name_en') !== null || sent('brands') !== null) throw new Error('name or brand was sent for an existing product');
      await btn('OK').click();
      await btn('Send to Open Food Facts').waitFor();
      await page.goBack();
    });
    await step('open food facts: a bakery item without barcode needs the shop, then gets its own code', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('My foods & meals', { exact: true }).click();
      await btn('Create food').click();
      const inputs = () => page.locator('input').filter({ visible: true });
      await inputs().nth(0).fill('Smoke pretzel');
      await inputs().nth(2).fill('280');
      await btn('Save and continue').click();
      await btn('Send to Open Food Facts').click();
      await text(/add the bakery, market or shop as the brand/).waitFor();
      if (!(await btn('Send').isDisabled())) throw new Error('sent without the shop');
      await btn('Edit food').click();
      await text(/Your diary keeps the values it has/).waitFor();
      await inputs().nth(1).fill('Smoke Bakery');
      await btn('Save').click();
      await text('New product without barcode').waitFor();
      await text('Smoke Bakery', { exact: true }).waitFor();
      const before = writes.length;
      await btn('Send').click();
      await text('Thank you!').waitFor();
      if (writes.length !== before + 1 || sent('code') !== 'new' || sent('brands') !== 'Smoke Bakery' || sent('lc') !== 'en' || sent('product_name_en') !== 'Smoke pretzel')
        throw new Error(`wrong write: ${writes[writes.length - 1]}`);
      await btn('OK').click();
      // the second time it is the same product, under the code Open Food Facts gave it
      offProduct['2000000000123'] = { code: '2000000000123', product_name: 'Smoke pretzel', brands: 'Smoke Bakery', nutriments: { 'energy-kcal_100g': 280, carbohydrates_100g: 0, proteins_100g: 0, fat_100g: 0 } };
      await btn('Send to Open Food Facts').click();
      await text('Open Food Facts already has these values. There is nothing to send.').waitFor();
      if (!(await btn('Send').isDisabled())) throw new Error('nothing to send, but Send is enabled');
      await page.goBack();
    });
    await step('open food facts: without a connection it is kept for later and sent from the list', async () => {
      offProduct['2000000000123'].nutriments['energy-kcal_100g'] = 270;
      await routeOff({ offline: true });
      await btn('Send to Open Food Facts').click();
      await text('No connection. Try again, or save it for later.').waitFor();
      await btn('Save for later').click();
      await text('Kept for later').waitFor();
      await page.getByRole('button', { name: /OK$/ }).filter({ visible: true }).last().click();
      await btn('Waiting to send · Open Food Facts settings').click();
      await text('Waiting to send (1)').waitFor();
      await routeOff();
      await page.getByRole('button', { name: /^Smoke pretzel/ }).filter({ visible: true }).first().click();
      await text('270 kcal → 280 kcal').waitFor(); // compared again, with the food as it is now
      await btn('Send').click();
      await text('Thank you!').waitFor();
      if (sent('code') !== '2000000000123' || sent('nutriment_energy-kcal') !== '280') throw new Error(`wrong write: ${writes[writes.length - 1]}`);
      await btn('OK').click();
      await text('Waiting to send (0)').waitFor();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      for (let i = 0; i < 6 && !(await page.getByRole('tab', { name: 'Diary' }).isVisible()); i++) await page.goBack();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Add food: Snacks').waitFor();
    });
    await step('appearance: the app icon choice explains why the browser can’t change it', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('Appearance', { exact: true }).click();
      await text(/Browsers don’t let a web app change its icon/).waitFor();
      if (!(await page.getByTestId('app-icon-ocean').filter({ visible: true }).first().isDisabled())) throw new Error('icon choice is not disabled in the browser');
      await page.goBack();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Add food: Snacks').waitFor();
    });
    await step('search: a barcode typed into the search field finds the product', async () => {
      await page.route('https://world.openfoodfacts.org/api/v2/product/**', (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: cors,
          body: JSON.stringify({ status: 1, product: { product_name: 'Smoke skyr', brands: 'Smoke Dairy', nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2 } } }),
        }),
      );
      await btn('Add food: Lunch').click();
      await field('Search foods and products').fill('3017620422003');
      await btn('Look up barcode 3017620422003').click();
      await text('Smoke skyr', { exact: true }).click();
      await btn('Add').click();
      await text('Smoke skyr', { exact: true }).waitFor();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
    await step('ai log: a rated meal photo answer is logged and exported', async () => {
      // The AI answer is faked; the browser calls the Claude API straight from the page.
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
      const answer = { items: [{ name: 'Smoke pasta', grams: 300, kcal: 450, protein: 15, carbs: 80, fat: 8, confidence: 0.9 }], confidence: 0.9 };
      await page.route('https://api.anthropic.com/**', (r) =>
        r.request().method() === 'OPTIONS'
          ? r.fulfill({ status: 204, headers: cors })
          : r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(answer) }] }) }),
      );
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('AI settings', { exact: true }).click();
      await text('Claude (Anthropic)', { exact: true }).click(); // primary
      await field('Paste key').fill('sk-ant-smoke-test');
      await btn('Save key').click();
      const logSwitch = page.getByRole('switch', { name: 'Keep a log of AI answers' }).filter({ visible: true }).first();
      if (await logSwitch.isChecked()) throw new Error('the AI log is on by default');
      await logSwitch.click();
      await text('No answers logged yet.').waitFor();
      await page.goBack();

      await page.getByRole('tab', { name: 'Diary' }).click();
      await btn('Add food: Lunch').click();
      await text('AI photo', { exact: true }).click();
      const chooser = page.waitForEvent('filechooser');
      await btn('Choose from library').click();
      await (await chooser).setFiles({ name: 'meal.png', mimeType: 'image/png', buffer: PHOTO_PNG });
      await text('1 items found').waitFor();
      await text('Rate this answer (optional)').click();
      await btn('Portion off').click();
      await field('e.g. it was two slices, not one').fill('smoke note');
      await btn('Add to diary').click();
      await text('Smoke pasta', { exact: true }).waitFor();

      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('AI settings', { exact: true }).click();
      await text(/^1 answers · /).waitFor();
      await btn('Export log').click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: /Share export \(/ }).filter({ visible: true }).first().click();
      const file = await download;
      if (!/^openplate-ai-log-\d{4}-\d\d-\d\d\.json$/.test(file.suggestedFilename())) throw new Error(`file name ${file.suggestedFilename()}`);
      const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
      const rec = data.records?.[0];
      if (data.kind !== 'ai-log' || data.records.length !== 1) throw new Error(`export has ${data.records?.length} records`);
      if (rec.status !== 'saved' || rec.kind !== 'meal') throw new Error(`record status ${rec.status}`);
      if (!rec.rating?.tags?.includes('portion_off') || rec.rating.note !== 'smoke note') throw new Error(`rating ${JSON.stringify(rec.rating)}`);
      if (rec.photos?.length !== 1 || !rec.attempts?.[0]?.raw?.includes('Smoke pasta')) throw new Error('photo or raw reply missing');
      if (rec.answeredBy?.provider !== 'anthropic' || !rec.promptVersion) throw new Error(`answeredBy ${JSON.stringify(rec.answeredBy)}`);
      if (!rec.diaryNow?.[0]?.exists || rec.diaryNow[0].grams !== 300) throw new Error(`diaryNow ${JSON.stringify(rec.diaryNow)}`);
      if (JSON.stringify(data).includes('sk-ant-smoke-test')) throw new Error('the API key is in the export');
      await page.goBack();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    });
    await step('reload keeps data (diary stored per month)', async () => {
      await page.reload();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await text('Apple', { exact: true }).waitFor();
      const keys = await idbKeys();
      if (!keys.some((k) => k.startsWith('openplate-v1:entries:'))) throw new Error(`no month values stored: ${keys.join(', ')}`);
    });
    await step('export remembers the last backup', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text(/Not exported yet/).waitFor();
      const download = page.waitForEvent('download');
      await text('Export data', { exact: true }).click();
      const file = await download;
      const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
      if (!Array.isArray(data.entries) || !data.entries.length) throw new Error('export has no entries');
      if ('lastBackupAt' in data) throw new Error('device-only reminder state leaked into the export');
      if ('records' in data || JSON.stringify(data).includes('smoke note')) throw new Error('the AI answer log leaked into the backup');
      await text(/Last export: today/).waitFor();
    });
    await step('your data: what is stored, the servers, and the connection log of the lookups above', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('Your data', { exact: true }).click();
      await text('On this device', { exact: true }).waitFor();
      await text('Where data can go', { exact: true }).waitFor();
      await text('world.openfoodfacts.org · search.openfoodfacts.org · robotoff.openfoodfacts.org').waitFor();
      await text(/^Last connection: /).waitFor();
      await text('Connection log', { exact: true }).click();
      await text('Product lookup (barcode)', { exact: true }).waitFor();
      const body = await page.innerText('body');
      if (/4006|search\?q=/.test(body)) throw new Error('the connection log shows what was looked up');
      if (body.includes('Other server') || body.includes('localhost')) throw new Error('the app’s own files ended up in the connection log');
      await page.goBack();
    });
    await step('your data: CSV export is a zip with a table per kind', async () => {
      const download = page.waitForEvent('download');
      await btn('Export CSV').click();
      const file = await download;
      const bytes = readFileSync(await file.path());
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('CSV export is not a zip file');
      for (const name of ['diary.csv', 'weights.csv', 'water.csv', 'fasting.csv', 'own-foods.csv'])
        if (!bytes.includes(Buffer.from(name))) throw new Error(`zip has no ${name}`);
    });
    let encrypted;
    await step('encrypted backup: export asks for a password and the file is unreadable without it', async () => {
      await page.getByTestId('encrypt-switch').filter({ visible: true }).first().click();
      await page.goBack();
      await text('Export data', { exact: true }).click();
      await page.getByTestId('backup-pw').filter({ visible: true }).first().fill('smoke-pass-1');
      await page.getByTestId('backup-pw-repeat').filter({ visible: true }).first().fill('smoke-pass-2');
      await text('The passwords don’t match.').waitFor();
      await page.getByTestId('backup-pw-repeat').filter({ visible: true }).first().fill('smoke-pass-1');
      await btn('Encrypt backup').click();
      await text('Backup is ready', { exact: true }).waitFor({ timeout: 60000 });
      const download = page.waitForEvent('download');
      await btn('Share backup').click();
      const file = await download;
      encrypted = readFileSync(await file.path(), 'utf8');
      const data = JSON.parse(encrypted);
      if (data.encrypted !== 1 || 'entries' in data || encrypted.includes('Apple')) throw new Error('backup is not encrypted');
    });
    await step('encrypted backup: import needs the right password', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      const chooser = page.waitForEvent('filechooser');
      await text('Import data', { exact: true }).click();
      await (await chooser).setFiles({ name: 'enc.json', mimeType: 'application/json', buffer: Buffer.from(encrypted) });
      await page.getByTestId('backup-pw').filter({ visible: true }).first().fill('wrong-password');
      await btn('Open backup').click();
      await text('Wrong password, or the file was changed.').waitFor({ timeout: 60000 });
      await page.getByTestId('backup-pw').filter({ visible: true }).first().fill('smoke-pass-1');
      await btn('Open backup').click();
      await btn('Replace').click({ timeout: 60000 });
      await btn('OK').click();
      await page.getByRole('tab', { name: 'Diary' }).click();
      await text('Breakfast', { exact: true }).waitFor();
    });
    await step('app lock: a passkey locks the web app and unlocks it again', async () => {
      // A virtual authenticator stands in for Face ID / Windows Hello.
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
      });
      await page.getByRole('tab', { name: 'Profile' }).click();
      await text('Your data', { exact: true }).click();
      await text('App lock', { exact: true }).click();
      await page.getByTestId('lock-switch').filter({ visible: true }).first().click();
      await text('Encrypt backups too?').waitFor().catch(() => {});
      if (await btn('Not now').count()) await btn('Not now').click();
      await text('Lock again after', { exact: true }).waitFor();
      await page.reload();
      await text('OpenPlate is locked', { exact: true }).waitFor();
      await btn('Unlock').click();
      await text('OpenPlate is locked', { exact: true }).waitFor({ state: 'hidden' });
      // Off again for the remaining steps.
      await page.getByTestId('lock-switch').filter({ visible: true }).first().click();
      await text('Lock again after', { exact: true }).waitFor({ state: 'hidden' });
      // Wait until "off" is saved, or the next page load would start locked again.
      for (let i = 0; i < 50; i++) {
        const main = JSON.parse((await idbGet('openplate-v1')) ?? '{}');
        if (main.state?.security?.lock === false) break;
        if (i === 49) throw new Error('turning the lock off was not saved');
        await page.waitForTimeout(100);
      }
      await cdp.send('WebAuthn.disable');
      await page.goto(url);
    });
    await step('hostile backup is neutralised', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      const chooser = page.waitForEvent('filechooser');
      await text('Import data', { exact: true }).click();
      await (await chooser).setFiles({ name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(HOSTILE_BACKUP)) });
      await btn('Replace').click();
      await btn('OK').click();
      await page.getByRole('tab', { name: 'Recipes' }).click();
      await text('Evil stew').click();
      await text('Stir.').waitFor();
      await page.waitForTimeout(800); // let the save finish
      const main = JSON.parse((await idbGet('openplate-v1')) ?? '{}');
      const openai = main.state?.ai?.providers?.openai?.baseUrl;
      if (openai !== 'https://api.openai.com/v1') throw new Error(`OpenAI address changed by the import: ${openai}`);
      if (main.state?.ai?.primary === 'openai') throw new Error('provider choice taken from the import');
      if (trackerHits.length) throw new Error(`requests to the tracker: ${trackerHits.join(', ')}`);
      await page.goBack();
    });
    console.log(`✓ ${scheme}: all steps passed`);
  } catch (e) {
    failed = true;
    // visible text first, the failing step last: CI annotations keep only the end of the log
    console.log('--- visible text ---\n' + (await page.innerText('body').catch(() => '')).slice(0, 1200));
    console.log(`--- url: ${page.url()}`);
    console.log(`✗ ${scheme}: step "${stepName}" failed: ${String(e).slice(0, 600)}`);
    await page.screenshot({ path: `smoke-shots/${scheme}-FAILED.png` }).catch(() => {});
  }
  await ctx.close();
}

await run('light');
await run('dark');
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
