import type { DiaryEntry, Recipe } from './types';

/**
 * Persistence for the app state without one ever-growing value.
 *
 * - Diary entries are stored per month under `<name>:entries:YYYY-MM`.
 * - Photos of own recipes are stored one per recipe under `<name>:photo:<recipe id>`.
 * - Everything else stays under `<name>`.
 *
 * Only values that actually changed are written, so logging food rewrites one small value instead
 * of the whole history, and no single value grows past Android's ~2 MB row limit (above it, the
 * stored data can no longer be read back).
 *
 * Old installs kept everything inside the main value; it is read from there until the first write
 * moves entries and photos into their own values.
 *
 * Safety: nothing is written before the stored data was read successfully, so a failed read can
 * never be followed by an empty state overwriting the user's history.
 */

/** The subset of AsyncStorage this needs (IndexedDB on the web, an in-memory version in tests). */
export interface KeyValueStore {
  getAllKeys(): Promise<readonly string[]>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export interface StoredValue<S> {
  state: S;
  version?: number;
}

type Shardable = { entries?: DiaryEntry[]; recipes?: Recipe[] };

const monthOf = (date: string) => date.slice(0, 7);
const entryPrefix = (name: string) => `${name}:entries:`;
const photoPrefix = (name: string) => `${name}:photo:`;

/** Groups diary entries by month (YYYY-MM). */
export function splitEntries(entries: DiaryEntry[]): Map<string, DiaryEntry[]> {
  const out = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    const m = monthOf(e.date);
    const list = out.get(m);
    if (list) list.push(e);
    else out.set(m, [e]);
  }
  return out;
}

export function createShardedStorage<S extends Shardable>(kv: KeyValueStore) {
  /** Last JSON written or read per key, to skip unchanged writes. */
  const written = new Map<string, string>();
  /** Writes stay in order even though zustand does not wait for them. */
  let queue: Promise<void> = Promise.resolve();
  let loaded = false;
  let lastError: unknown = null;

  return {
    async getItem(name: string): Promise<StoredValue<S> | null> {
      loaded = false;
      const keys = await kv.getAllKeys();
      const ePrefix = entryPrefix(name);
      const pPrefix = photoPrefix(name);
      const shardKeys = keys.filter((k) => k.startsWith(ePrefix) || k.startsWith(pPrefix)).sort();
      const pairs = await kv.multiGet([name, ...shardKeys]);
      const seen = new Map<string, string>();
      let main: (StoredValue<S> & { entriesSharded?: boolean }) | null = null;
      const entries: DiaryEntry[] = [];
      const photos = new Map<string, string>();
      let hasEntryShards = false;
      for (const [key, raw] of pairs) {
        if (raw === null) continue;
        seen.set(key, raw);
        if (key === name) main = JSON.parse(raw);
        else if (key.startsWith(ePrefix)) {
          hasEntryShards = true;
          const list = JSON.parse(raw);
          if (!Array.isArray(list)) throw new Error(`Stored diary month ${key.slice(ePrefix.length)} is damaged.`);
          entries.push(...(list as DiaryEntry[]));
        } else if (key.startsWith(pPrefix)) photos.set(key.slice(pPrefix.length), JSON.parse(raw) as string);
      }
      // Everything was read and parsed: from now on saving is safe.
      written.clear();
      for (const [k, v] of seen) written.set(k, v);
      loaded = true;
      if (!main) {
        // Normally impossible (the main value is written in the same transaction). If it happens,
        // keep the diary rather than starting empty and deleting the months on the next save.
        if (!hasEntryShards) return null;
        return { state: { entries } as S, version: 0 };
      }
      // Month values win once they exist; a legacy main value may still hold an old copy.
      const legacy = main.state.entries ?? [];
      const all = hasEntryShards || main.entriesSharded ? entries : legacy;
      const recipes = main.state.recipes?.map((r) => (photos.has(r.id) && !r.photo ? { ...r, photo: photos.get(r.id) } : r));
      return {
        state: { ...main.state, entries: all, ...(recipes ? { recipes } : {}) },
        version: main.version,
      };
    },

    setItem(name: string, value: StoredValue<S>): Promise<void> {
      if (!loaded) return queue;
      const { entries = [], recipes, ...rest } = value.state;
      const ePrefix = entryPrefix(name);
      const pPrefix = photoPrefix(name);
      const sets: [string, string][] = [];
      const wanted = new Set<string>([name]);
      const put = (key: string, json: string) => {
        wanted.add(key);
        if (written.get(key) !== json) sets.push([key, json]);
      };

      for (const [month, list] of splitEntries(entries)) put(ePrefix + month, JSON.stringify(list));
      const lightRecipes = recipes?.map((r) => {
        if (!r.photo || !r.photo.startsWith('data:')) return r;
        put(pPrefix + r.id, JSON.stringify(r.photo));
        const { photo: _photo, ...withoutPhoto } = r;
        return withoutPhoto;
      });
      const mainState = lightRecipes ? { ...rest, recipes: lightRecipes } : rest;
      // The main value is written last: if the app dies in between, the old main value still
      // matches the old month values, and the new ones are picked up on the next start.
      put(name, JSON.stringify({ state: mainState, version: value.version, entriesSharded: true }));

      const removes = [...written.keys()].filter((k) => (k.startsWith(ePrefix) || k.startsWith(pPrefix)) && !wanted.has(k));
      if (!sets.length && !removes.length) return queue;
      for (const [k, v] of sets) written.set(k, v);
      for (const k of removes) written.delete(k);
      queue = queue
        .then(async () => {
          if (sets.length) await kv.multiSet(sets);
          if (removes.length) await kv.multiRemove(removes);
          lastError = null;
        })
        .catch((e) => {
          // Forget what we think is stored so the next change rewrites everything.
          written.clear();
          lastError = e;
          console.warn('OpenPlate: saving failed', e);
        });
      return queue;
    },

    async removeItem(name: string): Promise<void> {
      const keys = await kv.getAllKeys();
      await kv.multiRemove(keys.filter((k) => k === name || k.startsWith(entryPrefix(name)) || k.startsWith(photoPrefix(name))));
      written.clear();
    },

    /** Waits for pending writes (tests, export). */
    flush: () => queue,
    /** The last write error, or null after a successful write. */
    lastError: () => lastError,
  };
}

/** In-memory KeyValueStore for tests. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string>; writes: string[][] } {
  const data = new Map(Object.entries(initial));
  const writes: string[][] = [];
  return {
    data,
    writes,
    getAllKeys: async () => [...data.keys()],
    multiGet: async (keys) => keys.map((k) => [k, data.get(k) ?? null] as const),
    multiSet: async (pairs) => {
      writes.push(pairs.map(([k]) => k));
      for (const [k, v] of pairs) data.set(k, v);
    },
    multiRemove: async (keys) => {
      for (const k of keys) data.delete(k);
    },
  };
}
