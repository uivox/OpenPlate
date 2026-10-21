import * as SecureStore from 'expo-secure-store';
import { parseOffLogin, type OffLogin } from './offWrite';
import type { AIProviderId } from './types';

/** API keys live in the iOS Keychain and are only sent to the provider they belong to. */
const keyName = (p: AIProviderId) => `ai_key_${p}`;

export async function getApiKey(p: AIProviderId): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(keyName(p))) || null;
  } catch {
    return null;
  }
}

export async function setApiKey(p: AIProviderId, value: string): Promise<void> {
  const v = value.trim();
  if (v) await SecureStore.setItemAsync(keyName(p), v);
  else await SecureStore.deleteItemAsync(keyName(p));
}

export async function clearAllKeys(): Promise<void> {
  for (const p of ['anthropic', 'openai', 'gemini', 'local'] as AIProviderId[]) {
    try {
      await SecureStore.deleteItemAsync(keyName(p));
    } catch {
      /* ignore */
    }
  }
  try {
    await SecureStore.deleteItemAsync('off_login');
  } catch {
    /* ignore */
  }
}

/* ---------- Open Food Facts login ---------- */

const OFF_KEY = 'off_login';

/** The user's own Open Food Facts login, kept in the Keychain / Keystore and only sent to Open Food Facts. */
export async function getOffLogin(): Promise<OffLogin | null> {
  try {
    return parseOffLogin(await SecureStore.getItemAsync(OFF_KEY));
  } catch {
    return null;
  }
}

export async function setOffLogin(login: OffLogin | null): Promise<void> {
  if (login) await SecureStore.setItemAsync(OFF_KEY, JSON.stringify(login));
  else await SecureStore.deleteItemAsync(OFF_KEY);
}
