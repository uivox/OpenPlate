// Turns the `expo export --platform web` output into an installable web app (PWA):
// iPhone home-screen tags, web manifest, an offline service worker, a 404.html for deep links and a
// Content Security Policy (meta tag; GitHub Pages can't set headers).
// Usage: node scripts/web-pwa.mjs <dist dir> [base path]   (base path defaults to $WEB_BASE_URL, e.g. /OpenPlate)
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
  name: 'OpenPlate',
  short_name: 'OpenPlate',
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
    <meta name="apple-mobile-web-app-title" content="OpenPlate" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content="${LIGHT}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${DARK}" media="(prefers-color-scheme: dark)" />
    <meta name="format-detection" content="telephone=no" />
    <link rel="manifest" href="${root}manifest.webmanifest" />
    <link rel="apple-touch-icon" href="${root}icons/apple-touch-icon.png" />
    <style>
      html, body { background: ${LIGHT}; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
      @media (prefers-color-scheme: dark) { html, body { background: ${DARK}; } }
      body { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; -webkit-text-size-adjust: 100%; }
      input, textarea { -webkit-user-select: text; user-select: text; }
    </style>
    <script src="${root}register-sw.js" defer></script>
`;

let html = readFileSync(join(dist, 'index.html'), 'utf8');
// viewport-fit=cover gives safe-area insets on iPhone; maximum-scale stops Safari zooming into fields.
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />';
html = /<meta\s+name="viewport"[^>]*>/i.test(html) ? html.replace(/<meta\s+name="viewport"[^>]*>/i, viewport) : html.replace('</head>', `${viewport}\n</head>`);
html = html.replace(/<html([^>]*)\slang="[^"]*"/i, '<html$1').replace(/<html/i, '<html lang="en"');
html = html.replace(/<title>[^<]*<\/title>/i, '<title>OpenPlate</title>');
if (!html.includes('rel="manifest"')) html = html.replace('</head>', `${head}</head>`);
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

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('openplate-') && k !== CACHE).map((k) => caches.delete(k))))
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
    // Network first so updates arrive; the cached app shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(ROOT, copy));
          }
          return res.ok ? res : caches.match(ROOT).then((r) => r || res);
        })
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow(ROOT);
    }),
  );
});
`;
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`PWA ready in ${dist} (base "${root}", ${urls.length} files precached, cache ${version})`);
