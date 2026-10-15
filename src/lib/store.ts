import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_AI_SETTINGS, sanitizeImportedAI } from './ai';
import type { BackupData } from './backup';
import { newId } from './id';
import { DEFAULT_LAYOUT, normalizeLayout } from './layout';
import { entriesForMeal } from './meals';
import { appStorage } from './storage';
import { DEFAULT_APPEARANCE, normalizeAppearance } from './themes';
import type {
  AIProviderConfig,
  Appearance,
  LayoutPrefs,
  AIProviderId,
  AISettings,
  DiaryEntry,
  FastingSession,
  Food,
  LanguagePref,
  MealType,
  Profile,
  Recipe,
  SavedMeal,
  WeightEntry,
} from './types';

const MAX_RECENT = 40;

interface State {
  profile: Profile | null;
  language: LanguagePref;
  entries: DiaryEntry[];
  customFoods: Food[];
  recentFoods: Food[];
  water: Record<string, number>;
  weights: WeightEntry[];
  fastingActive: FastingSession | null;
  fastingHistory: FastingSession[];
  ai: AISettings;
  meals: SavedMeal[];
  /** Own recipes (community ones are bundled, see communityRecipes.ts). */
  recipes: Recipe[];
  appearance: Appearance;
  layout: LayoutPrefs;

  setProfile: (p: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  setLanguage: (l: LanguagePref) => void;
  addEntry: (e: Omit<DiaryEntry, 'id' | 'createdAt'>) => void;
  updateEntry: (id: string, patch: Partial<Pick<DiaryEntry, 'grams' | 'meal' | 'date'>>) => void;
  removeEntry: (id: string) => void;
  copyMeal: (fromDate: string, toDate: string, meal: MealType) => number;
  saveCustomFood: (f: Food) => void;
  removeCustomFood: (id: string) => void;
  saveMeal: (m: SavedMeal) => void;
  removeMeal: (id: string) => void;
  /** Adds every item of a saved meal as its own diary entry; returns how many were added. */
  logMeal: (id: string, date: string, meal: MealType, factor?: number) => number;
  saveRecipe: (r: Recipe) => void;
  removeRecipe: (id: string) => void;
  addWater: (date: string, ml: number) => void;
  logWeight: (date: string, kg: number) => void;
  removeWeight: (date: string) => void;
  startFast: (s: Omit<FastingSession, 'id'>) => void;
  updateActiveFast: (patch: Partial<FastingSession>) => void;
  endFast: (end: number) => void;
  removeFast: (id: string) => void;
  setAI: (patch: Partial<AISettings>) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  setLayout: (patch: Partial<LayoutPrefs>) => void;
  setProviderConfig: (id: AIProviderId, patch: Partial<AIProviderConfig>) => void;
  resetAll: () => void;
  /** Replaces all data with an imported backup (see backup.ts). */
  importBackup: (d: BackupData) => void;
}

const initial = {
  profile: null,
  language: 'system' as LanguagePref,
  entries: [],
  customFoods: [],
  recentFoods: [],
  water: {},
  weights: [],
  fastingActive: null,
  fastingHistory: [],
  ai: DEFAULT_AI_SETTINGS,
  meals: [] as SavedMeal[],
  recipes: [] as Recipe[],
  appearance: DEFAULT_APPEARANCE,
  layout: DEFAULT_LAYOUT,
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...initial,

      setProfile: (p) => set({ profile: p }),
      updateProfile: (patch) => set((s) => (s.profile ? { profile: { ...s.profile, ...patch } } : {})),
      setLanguage: (language) => set({ language }),

      addEntry: (e) =>
        set((s) => {
          const entry: DiaryEntry = { ...e, id: newId(), createdAt: Date.now() };
          const recent =
            e.food.source === 'quick'
              ? s.recentFoods
              : [e.food, ...s.recentFoods.filter((f) => f.id !== e.food.id)].slice(0, MAX_RECENT);
          return { entries: [...s.entries, entry], recentFoods: recent };
        }),
      updateEntry: (id, patch) => set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      copyMeal: (fromDate, toDate, meal) => {
        const source = get().entries.filter((e) => e.date === fromDate && e.meal === meal);
        const now = Date.now();
        const copies = source.map((e, i) => ({ ...e, id: newId(), date: toDate, createdAt: now + i }));
        set((s) => ({ entries: [...s.entries, ...copies] }));
        return copies.length;
      },

      saveCustomFood: (f) => set((s) => ({ customFoods: [f, ...s.customFoods.filter((x) => x.id !== f.id)] })),
      removeCustomFood: (id) => set((s) => ({ customFoods: s.customFoods.filter((f) => f.id !== id) })),

      saveMeal: (m) => set((s) => ({ meals: [m, ...s.meals.filter((x) => x.id !== m.id)] })),
      removeMeal: (id) => set((s) => ({ meals: s.meals.filter((m) => m.id !== id) })),
      saveRecipe: (r) => set((s) => ({ recipes: [r, ...s.recipes.filter((x) => x.id !== r.id)] })),
      removeRecipe: (id) => set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) })),
      logMeal: (id, date, slot, factor = 1) => {
        const m = get().meals.find((x) => x.id === id);
        if (!m) return 0;
        const now = Date.now();
        const added = entriesForMeal(m, date, slot, factor).map((e, i) => ({ ...e, id: newId(), createdAt: now + i }));
        set((s) => {
          let recent = s.recentFoods;
          for (const e of [...added].reverse()) {
            if (e.food.source !== 'quick') recent = [e.food, ...recent.filter((f) => f.id !== e.food.id)];
          }
          return {
            entries: [...s.entries, ...added],
            recentFoods: recent.slice(0, MAX_RECENT),
            meals: s.meals.map((x) => (x.id === id ? { ...x, lastUsed: now } : x)),
          };
        });
        return added.length;
      },

      addWater: (date, ml) => set((s) => ({ water: { ...s.water, [date]: Math.max(0, (s.water[date] ?? 0) + ml) } })),

      logWeight: (date, kg) =>
        set((s) => ({
          weights: [...s.weights.filter((w) => w.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date)),
        })),
      removeWeight: (date) => set((s) => ({ weights: s.weights.filter((w) => w.date !== date) })),

      startFast: (f) => set({ fastingActive: { ...f, id: newId() } }),
      updateActiveFast: (patch) => set((s) => (s.fastingActive ? { fastingActive: { ...s.fastingActive, ...patch } } : {})),
      endFast: (end) =>
        set((s) =>
          s.fastingActive
            ? { fastingActive: null, fastingHistory: [{ ...s.fastingActive, end }, ...s.fastingHistory].slice(0, 200) }
            : {},
        ),
      removeFast: (id) => set((s) => ({ fastingHistory: s.fastingHistory.filter((f) => f.id !== id) })),

      setAI: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      setAppearance: (patch) => set((s) => ({ appearance: normalizeAppearance({ ...s.appearance, ...patch }) })),
      setLayout: (patch) => set((s) => ({ layout: normalizeLayout({ ...s.layout, ...patch }) })),
      setProviderConfig: (id, patch) =>
        set((s) => ({ ai: { ...s.ai, providers: { ...s.ai.providers, [id]: { ...s.ai.providers[id], ...patch } } } })),

      resetAll: () => set({ ...initial }),
      importBackup: (d) =>
        set((s) => ({
          ...initial,
          ...d,
          // older exports have no look/layout: keep the current one
          appearance: d.appearance ? normalizeAppearance(d.appearance) : s.appearance,
          layout: d.layout ? normalizeLayout(d.layout) : s.layout,
          // Only model names come from the file; providers and server addresses stay as set on this
          // device, so a backup can never redirect a saved API key (see sanitizeImportedAI).
          ai: sanitizeImportedAI(d.ai, s.ai),
        })),
    }),
    {
      name: 'openplate-v1',
      version: 1,
      storage: createJSONStorage(() => appStorage),
      partialize: (s) => ({
        profile: s.profile,
        language: s.language,
        entries: s.entries,
        customFoods: s.customFoods,
        recentFoods: s.recentFoods,
        water: s.water,
        weights: s.weights,
        fastingActive: s.fastingActive,
        fastingHistory: s.fastingHistory,
        ai: s.ai,
        meals: s.meals,
        recipes: s.recipes,
        appearance: s.appearance,
        layout: s.layout,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        return {
          ...current,
          ...p,
          ai: {
            ...current.ai,
            ...(p.ai ?? {}),
            providers: { ...current.ai.providers, ...(p.ai?.providers ?? {}) },
          },
          appearance: normalizeAppearance(p.appearance),
          layout: normalizeLayout(p.layout),
        };
      },
    },
  ),
);

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}

/** Re-exported for older imports; lives in the pure goals module now. */
export { weightOn } from './goals';
