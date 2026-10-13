import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/** Where the zustand store is saved. Native: AsyncStorage. The web build uses storage.web.ts (IndexedDB). */
export const appStorage: StateStorage = AsyncStorage;

/** Only meaningful in the browser (see storage.web.ts). */
export async function requestPersistentStorage(): Promise<void> {}
