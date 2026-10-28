import { recordingFetch, setConnectionSink } from '../lib/connectionLog';
import { useStore } from '../lib/store';

/**
 * Installs the connection log (connectionLog.ts). Imported first by app/_layout.tsx, so the global
 * fetch is wrapped before any screen or module makes a request; every later `fetch` call (and every
 * `fetchImpl = fetch` default) then goes through it. Records only reach the store while the log is
 * switched on.
 */
let installed = false;

export function installConnectionLog(): void {
  if (installed || typeof globalThis.fetch !== 'function') return;
  installed = true;
  // In the browser, the app's own files come from its own address: those aren't outside servers.
  const own = typeof location !== 'undefined' && /^https?:/.test(location.origin) ? location.origin : undefined;
  globalThis.fetch = recordingFetch(globalThis.fetch.bind(globalThis), Date.now, own);
  setConnectionSink((r) => {
    const s = useStore.getState();
    if (s.security.logConnections) s.addConnection(r);
  });
}

installConnectionLog();
