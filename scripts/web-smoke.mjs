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

const browser = await chromium.launch();
let failed = false;

async function run(scheme) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', colorScheme: scheme, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const crashes = [];
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
  };
  const btn = (name, exact = true) => page.getByRole('button', { name, exact }).first();

  try {
    await step('onboarding', async () => {
      await page.goto(url);
      await btn('English').click();
      for (let i = 0; i < 5; i++) await btn('Next').click();
      await btn("Let's go").click();
      await page.getByText('Breakfast', { exact: true }).first().waitFor();
    });
    for (const food of ['Apple', 'Banana']) {
      await step(`log ${food}`, async () => {
        await btn('Add food: Breakfast').click();
        await page.getByPlaceholder('Search foods and products').fill(food.toLowerCase());
        await page.getByText(food, { exact: true }).first().click();
        await btn('Add').click();
        await page.getByText(food, { exact: true }).first().waitFor();
      });
    }
    await step('save as meal', async () => {
      await btn('Save as meal').click();
      await btn('Save meal').click();
      await btn('Add food: Breakfast').waitFor();
    });
    await step('log saved meal', async () => {
      await btn('Add food: Breakfast').click();
      await btn('My meals').click();
      await page.getByText('2 foods', { exact: false }).first().waitFor();
      await btn('Add: Breakfast').click();
      await page.waitForFunction(() => document.body.innerText.split('Apple').length - 1 >= 2);
    });
    await step('streak', async () => {
      await page.getByRole('button', { name: /^Streak:/ }).first().click();
      await page.getByText('current streak').waitFor();
      await page.goBack();
    });
    await step('exact goal', async () => {
      await page.getByRole('tab', { name: 'Profile' }).click();
      await page.getByText('kcal per day').first().click();
      await btn('Exact number').click();
      await page.getByLabel('Daily goal').fill('2300');
      await btn('Save').click();
      await page.getByText('2300', { exact: true }).first().waitFor();
    });
    console.log(`✓ ${scheme}: all steps passed`);
  } catch (e) {
    failed = true;
    console.log(`✗ ${scheme}: step "${stepName}" failed: ${String(e).slice(0, 800)}`);
    console.log('--- visible text ---\n' + (await page.innerText('body').catch(() => '')).slice(0, 2500));
    await page.screenshot({ path: `smoke-shots/${scheme}-FAILED.png` }).catch(() => {});
  }
  await ctx.close();
}

await run('light');
await run('dark');
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
