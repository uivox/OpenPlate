import type { AIProviderId } from './types';

/**
 * Browser version of secure.ts. There is no Keychain on the web, so keys are kept in this
 * browser's localStorage for this site only (never in the store or the export) and are only
 * sent to the provider they belong to.
 */
const keyName = (p: AIProviderId) => `openplate_ai_key_${p}`;

export async function getApiKey(p: AIProviderId): Promise<string | null> {
  try {
    return window.localStorage.getItem(keyName(p)) || null;
  } catch {
    return null;
  }
}

export async function setApiKey(p: AIProviderId, value: string): Promise<void> {
  const v = value.trim();
  try {
    if (v) window.localStorage.setItem(keyName(p), v);
    else window.localStorage.removeItem(keyName(p));
  } catch {
    /* storage blocked */
  }
}

export async function clearAllKeys(): Promise<void> {
  for (const p of ['anthropic', 'openai', 'gemini', 'local'] as AIProviderId[]) await setApiKey(p, '');
}
