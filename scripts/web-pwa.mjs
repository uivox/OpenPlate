// Turns the `expo export --platform web` output into an installable web app (PWA):
// iPhone home-screen tags, web manifest, an offline service worker, a 404.html for deep links and a
// Content Security Policy (meta tag; GitHub Pages can't set headers).
// Usage: node scripts/web-pwa.mjs <dist dir> [base path]   (base path defaults to $WEB_BASE_URL, e.g. /Tellerwerk)
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = process.argv[2] || 'dist';
const base = (process.argv[3] ?? process.env.WEB_BASE_URL ?? '').replace(/\/+$/, '');
const root = `${base}/`;
const LIGHT = '#EEF2E5';
const DARK = '#17121B';

// Content Security Policy. All data lives in this origin's storage, so the main job is to make sure
// no script other than our own bundle ever runs here.
// - script-src 'self': no inline or foreign scripts (the service worker is registered from a file for that reason).
// - style-src 'unsafe-inline': react-native-web and expo-font add style elements at runtime.
// - img-src: own files, photos the user picks (data:/blob:) and Open Food Facts product images only.
// - connect-src https:: users can point the AI feature at their own server, so any https host is allowed.
// - frame-ancestors can't be set from a meta tag; a framed copy gets separate (empty) storage anyway.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://images.openfoodfacts.org https://static.openfoodfacts.org https://images.openfoodfacts.net https://static.openfoodfacts.net",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No index.html in ${dist}. Run "npx expo export --platform web" first.`);
  process.exit(1);
}

// Expo copies public/ already; copying again is harmless and covers older CLIs.
if (existsSync('public')) cpSync('public', dist, { recursive: true });

const manifest = {
  name: 'Tellerwerk',
  short_name: 'Tellerwerk',
  description: 'Free, open-source calorie tracker. All data stays on your device.',
  id: root,
  start_url: root,
  scope: root,
  display: 'standalone',
  orientation: 'portrait',
  background_color: LIGHT,
  theme_color: LIGHT,
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// The start screen's colours: the last theme the app used (saved by `startScreenDone` in
// device.web.ts), else the default theme. A file, not an inline script, for the CSP; it runs before
// the first paint, so the start screen never flashes in the wrong colours.
writeFileSync(
  join(dist, 'splash.js'),
  `try {
  var c = JSON.parse(localStorage.getItem('openplate-start-colors') || 'null');
  if (c && typeof c === 'object') {
    var r = document.documentElement.style;
    ['bg', 'accent', 'leaf', 'face', 'text', 'track'].forEach(function (k) {
      if (typeof c[k] === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c[k])) r.setProperty('--op-' + k, c[k]);
    });
    // Appearance → Motion → Off: the start screen keeps still too.
    if (c.still === true) document.documentElement.classList.add('op-still');
  }
} catch (e) {}
`,
);

// Registered from a file, not an inline script, so the CSP can forbid inline scripts.
writeFileSync(
  join(dist, 'register-sw.js'),
  `if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register(${JSON.stringify(`${root}sw.js`)}, { scope: ${JSON.stringify(root)} }).catch(function () {});
  });
}
`,
);

// First in <head> (right after the charset): a meta CSP only covers what comes after it.
// no-referrer: Open Food Facts and AI providers don't learn which page a request came from.
const security = `
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="referrer" content="no-referrer" />`;

const head = `
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Tellerwerk" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="${LIGHT}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${DARK}" media="(prefers-color-scheme: dark)" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="manifest" href="${root}manifest.webmanifest" />
    <link rel="apple-touch-icon" href="${root}icons/apple-touch-icon.png" />
    <script src="${root}splash.js"></script>
    <style>
      :root { --op-bg: ${LIGHT}; --op-accent: #9C2F62; --op-leaf: #5E9A3B; --op-face: #FFF7FB; --op-text: #2A1F2D; --op-track: rgba(156, 47, 98, 0.16); }
      @media (prefers-color-scheme: dark) { :root { --op-bg: ${DARK}; --op-accent: #E26A9E; --op-leaf: #8CC46A; --op-face: #1B1220; --op-text: #F6EEF4; --op-track: rgba(226, 106, 158, 0.2); } }
      html, body { background: var(--op-bg); overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
      body { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-text-size-adjust: 100%; }
      input, textarea { -webkit-user-select: text; user-select: text; }
      /* Start screen: shown from the first paint until the app has read its data (startScreenDone). */
      #op-splash { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: var(--op-bg); transition: opacity 220ms ease-out; }
      #op-splash.op-hide { opacity: 0; pointer-events: none; }
      #op-splash .op-name { font: 800 26px/1.1 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; letter-spacing: -0.02em; color: var(--op-text); }
      #op-splash .op-bar { width: 120px; height: 4px; border-radius: 2px; overflow: hidden; background: var(--op-track); }
      #op-splash .op-bar span { display: block; width: 40%; height: 100%; border-radius: 2px; background: var(--op-accent); animation: op-slide 1.1s ease-in-out infinite; }
      #op-splash .op-sprout { transform-origin: 60px 62px; animation: op-grow 700ms cubic-bezier(.2,.9,.3,1.3) both, op-sway 2.6s ease-in-out 700ms infinite; }
      #op-splash .op-bowl { animation: op-pop 500ms cubic-bezier(.2,.9,.3,1.2) both; transform-origin: 60px 90px; }
      @keyframes op-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      @keyframes op-grow { from { transform: scale(0.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      @keyframes op-sway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
      @keyframes op-pop { from { transform: scale(0.85); } to { transform: scale(1); } }
      @media (prefers-reduced-motion: reduce) { #op-splash * { animation: none !important; } #op-splash .op-bar span { width: 100%; opacity: 0.5; } }
      .op-still #op-splash * { animation: none !important; } .op-still #op-splash .op-bar span { width: 100%; opacity: 0.5; }
    </style>
    <script src="${root}register-sw.js" defer></script>
`;

// The start screen itself, first thing in <body>. The same bowl as src/components/Sprout.tsx and the app icon.
const splash = `
    <div id="op-splash" role="status" aria-live="polite" aria-label="Tellerwerk is starting">
      <svg width="112" height="112" viewBox="0 0 120 120" aria-hidden="true">
        <g transform="translate(8.4 8) scale(0.86)">
          <g class="op-sprout">
            <path d="M60 66 C60 52 57 44 60 33" stroke="var(--op-leaf)" stroke-width="7" stroke-linecap="round" fill="none" />
            <path d="M59 45 C40 46 25 34 23 15 C43 14 58 27 59 45 Z" fill="var(--op-leaf)" />
            <path d="M61 38 C77 36 93 22 97 4 C77 3 62 18 61 38 Z" fill="var(--op-leaf)" opacity="0.75" />
          </g>
          <g class="op-bowl">
            <path d="M12 66 H108 A48 48 0 0 1 12 66 Z" fill="var(--op-accent)" />
            <rect x="8" y="59" width="104" height="13" rx="6.5" fill="var(--op-accent)" />
            <path d="M39 87 Q46 79 53 87" stroke="var(--op-face)" stroke-width="5" stroke-linecap="round" fill="none" />
            <path d="M67 87 Q74 79 81 87" stroke="var(--op-face)" stroke-width="5" stroke-linecap="round" fill="none" />
            <path d="M49 94 H71 Q70 107 60 107 Q50 107 49 94 Z" fill="var(--op-face)" />
          </g>
        </g>
      </svg>
      <div class="op-name">Tellerwerk</div>
      <div class="op-bar"><span></span></div>
    </div>`;

let html = readFileSync(join(dist, 'index.html'), 'utf8');
// viewport-fit=cover gives safe-area insets on iPhone; maximum-scale stops Safari zooming into fields.
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />';
html = /<meta\s+name="viewport"[^>]*>/i.test(html) ? html.replace(/<meta\s+name="viewport"[^>]*>/i, viewport) : html.replace('</head>', `${viewport}\n</head>`);
html = html.replace(/<html([^>]*)\slang="[^"]*"/i, '<html$1').replace(/<html/i, '<html lang="en"');
html = html.replace(/<title>[^<]*<\/title>/i, '<title>Tellerwerk</title>');
if (!html.includes('rel="manifest"')) html = html.replace('</head>', `${head}</head>`);
if (!html.includes('id="op-splash"')) html = html.replace(/<body([^>]*)>/i, (b) => `${b}${splash}`);

// Start fetching what the first screen needs right away, in parallel with the main bundle, instead
// of one after the other once each step has run: the root and tab layouts, the diary, and the
// fonts the app waits for before it shows anything.
const jsDir = join(dist, '_expo', 'static', 'js', 'web');
const firstChunks = existsSync(jsDir) ? readdirSync(jsDir).filter((f) => /^(_layout|index)-[0-9a-f]+\.js$/.test(f)) : [];
const fontFiles = [];
const findFonts = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findFonts(p);
    else if (name.endsWith('.ttf')) fontFiles.push(p);
  }
};
if (existsSync(join(dist, 'assets'))) findFonts(join(dist, 'assets'));
const preloads = [
  ...firstChunks.map((f) => `<link rel="preload" as="script" href="${root}_expo/static/js/web/${f}" />`),
  ...fontFiles.map((f) => `<link rel="preload" as="font" type="font/ttf" crossorigin href="${root}${relative(dist, f).split(sep).join('/')}" />`),
].join('\n    ');
if (preloads && !html.includes('rel="preload"')) html = html.replace('</head>', `    ${preloads}\n</head>`);
if (!html.includes('Content-Security-Policy')) {
  const charset = html.match(/<meta\s+charset=[^>]*>/i);
  html = charset ? html.replace(charset[0], `${charset[0]}${security}`) : html.replace(/<head[^>]*>/i, (h) => `${h}${security}`);
}
// The CSP forbids inline scripts. If an Expo update starts adding one, fail the build here
// instead of shipping an app that silently doesn't start.
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(([, attrs, body]) => !/\bsrc=/i.test(attrs) && body.trim());
if (inlineScripts.length) {
  console.error(`index.html contains ${inlineScripts.length} inline script(s), which the CSP blocks:\n${inlineScripts.map((m) => m[0].slice(0, 200)).join('\n')}`);
  process.exit(1);
}
writeFileSync(join(dist, 'index.html'), html);
// GitHub Pages serves 404.html for unknown paths, so deep links and reloads land in the app.
writeFileSync(join(dist, '404.html'), html);

// Precache every file so the app opens offline. The cache name changes with the content,
// which makes the service worker update and drop the old cache.
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!/\.map$|^sw\.js$|^404\.html$/.test(name)) files.push(p);
  }
};
walk(dist);
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(f));
const version = hash.digest('hex').slice(0, 12);
const urls = files.map((f) => root + relative(dist, f).split(sep).join('/')).map((u) => (u.endsWith('/index.html') ? u.slice(0, -10) : u));

const sw = `// Generated by scripts/web-pwa.mjs
const CACHE = 'openplate-${version}';
const ROOT = ${JSON.stringify(root)};
const PRECACHE = ${JSON.stringify(urls)};

// The version that was in use before this one keeps its files: a page that opened with it can
// still load the parts it loads later (the food database, a screen), even after this one took over.
const META = 'openplate-meta';
const previousVersion = () =>
  caches
    .open(META)
    .then((m) => m.match('active'))
    .then((r) => (r ? r.text() : null))
    .catch(() => null);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(previousVersion)
      .then((prev) =>
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('openplate-') && k !== CACHE && k !== META && k !== prev).map((k) => caches.delete(k)))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .open(META)
      .then((m) => m.put('active', new Response(CACHE)))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only our own files. Food database and AI requests always go to the network.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(ROOT)) return;

  if (req.mode === 'navigate') {
    // The app shell from this version's cache, straight away: opening the home-screen app never
    // waits for the network. Updates still arrive: the browser checks sw.js on each start, and a
    // new version installs in the background and is used from the next start.
    event.respondWith(
      caches
        .open(CACHE)
        .then((c) => c.match(ROOT))
        .then((hit) => hit || fetch(req))
        .catch(() => caches.match(ROOT)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// A tap (or the *Log now* button) on a meal reminder opens that meal's add screen: in the open app
// if there is one, else in a new window. Other notifications just bring the app to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const reminder = data.reminder;
  const url = typeof data.url === 'string' && data.url.startsWith(self.location.origin + ROOT) ? data.url : null;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (!('focus' in c)) continue;
        if (reminder) c.postMessage({ type: 'openplate-reminder', reminder });
        return c.focus();
      }
      return self.clients.openWindow(reminder && url ? url : ROOT);
    }),
  );
});
`;
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`PWA ready in ${dist} (base "${root}", ${urls.length} files precached, cache ${version})`);
