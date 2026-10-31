#!/usr/bin/env node
/**
 * Renders every app icon image from the SVGs in src/lib/appIcon.ts and writes the list of alternate
 * icons for the expo-alternate-app-icons plugin into app.json, so pictures, settings previews and
 * config can't drift apart.
 *
 *     npm i --no-save playwright@1 && npx playwright install chromium   (once)
 *     node scripts/make-app-icons.mjs
 *
 * Needs Node 22.18+ (loads the .ts file with type stripping) and Playwright's Chromium.
 * Writes: assets/icon.png, adaptive-icon.png, adaptive-monochrome.png, splash.png,
 * assets/app-icons/<colour>-<face>(.png|-foreground.png), public/icons/*.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DEFAULT_ICON, alternateIcons, iconFileName, iconGround, iconSvg, nativeIconName } from '../src/lib/appIcon.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  const out = join(root, file);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', file);
}

const main = DEFAULT_ICON;
await render(iconSvg(main, 'ios', 1024), 1024, 'assets/icon.png');
await render(iconSvg(main, 'foreground', 1024), 1024, 'assets/adaptive-icon.png');
await render(iconSvg(main, 'monochrome', 1024), 1024, 'assets/adaptive-monochrome.png');
await render(iconSvg(main, 'splash', 600), 600, 'assets/splash.png');
await render(iconSvg(main, 'rounded', 192), 192, 'public/icons/icon-192.png');
await render(iconSvg(main, 'rounded', 512), 512, 'public/icons/icon-512.png');
await render(iconSvg(main, 'maskable', 512), 512, 'public/icons/maskable-512.png');
await render(iconSvg(main, 'ios', 180), 180, 'public/icons/apple-touch-icon.png');
await render(iconSvg(main, 'rounded', 32), 32, 'public/icons/favicon-32.png');

const list = [];
for (const icon of alternateIcons()) {
  const base = `./assets/app-icons/${iconFileName(icon)}`;
  await render(iconSvg(icon, 'ios', 1024), 1024, `${base}.png`);
  await render(iconSvg(icon, 'foreground', 432), 432, `${base}-foreground.png`);
  list.push({ name: nativeIconName(icon), ios: `${base}.png`, android: { foregroundImage: `${base}-foreground.png`, backgroundColor: iconGround(icon) } });
}
await browser.close();

// app.json: the alternate icons, and the normal icon's Android background and themed icon
const appFile = join(root, 'app.json');
const app = JSON.parse(readFileSync(appFile, 'utf8'));
const plugin = app.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-alternate-app-icons');
plugin[1] = list;
app.expo.android.adaptiveIcon = {
  foregroundImage: './assets/adaptive-icon.png',
  monochromeImage: './assets/adaptive-monochrome.png',
  backgroundColor: iconGround(main),
};
// keep short string lists on one line, as they were written
writeFileSync(appFile, JSON.stringify(app, null, 2).replace(/\[\n\s+("[^"\n]*")\n\s+\]/g, '[$1]') + '\n');
console.log(`app.json: ${list.length} alternate icons`);
