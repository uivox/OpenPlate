import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from './persistStorage';

/**
 * Where the zustand store is saved (see persistStorage.ts for how it is split into values).
 * Native: AsyncStorage. The web build uses storage.web.ts (IndexedDB).
 */
export const kvStore: KeyValueStore = {
  getAllKeys: () => AsyncStorage.getAllKeys(),
  multiGet: (keys) => AsyncStorage.multiGet(keys),
  multiSet: (pairs) => AsyncStorage.multiSet(pairs),
  multiRemove: (keys) => AsyncStorage.multiRemove(keys),
};

/** Only meaningful in the browser (see storage.web.ts). */
export async function requestPersistentStorage(): Promise<void> {}
