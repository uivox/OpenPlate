import * as SecureStore from 'expo-secure-store';
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
}
