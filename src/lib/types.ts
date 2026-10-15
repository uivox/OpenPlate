export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  fiber?: number;
  satFat?: number;
  salt?: number;
}

export type FoodSource = 'generic' | 'bls' | 'off' | 'custom' | 'ai' | 'quick' | 'recipe';

export interface Serving {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  source: FoodSource;
  name: string;
  brand?: string;
  barcode?: string;
  /** Nutrients per 100 g (or 100 ml when unit is 'ml'). */
  per100: Nutrients;
  servings: Serving[];
  imageUrl?: string;
  unit?: 'g' | 'ml';
  /** Where the values of an own food came from when they weren't typed: read off a label photo, or Open Food Facts' photo AI. */
  dataFrom?: 'label' | 'robotoff';
  /** Open Food Facts product without protein, carbs or fat (they count as 0); offers completing it from the label. Not stored in backups. */
  incomplete?: boolean;
}

export interface SavedMealItem {
  /** Full snapshot, like diary entries, so later edits to a custom food don't change the meal. */
  food: Food;
  grams: number;
}

/** A named combination of foods the user logs together (see meals.ts). */
export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
  createdAt: number;
  /** When it was last logged (0 = never); used for sorting. */
  lastUsed: number;
}

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD, local time
  meal: MealType;
  food: Food;
  grams: number;
  createdAt: number;
}

export type Sex = 'female' | 'male';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type LanguagePref = 'system' | 'de' | 'en';

/** Percent of calories; the three values add up to 100. */
export interface MacroSplit {
  carbs: number;
  protein: number;
  fat: number;
}

export interface Profile {
  /** Optional first name for the greeting. */
  name?: string;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  startWeightKg: number;
  targetWeightKg: number;
  activity: Activity;
  goal: Goal;
  paceKgPerWeek: number;
  macroSplit: MacroSplit;
  waterGoalMl: number;
  glassMl: number;
  stepGoal: number;
  addActivityCalories: boolean;
  fastingPlanId: string;
  /** Weekdays (0 = Sunday … 6 = Saturday) used as fasting days by weekly plans. */
  fastingDays: number[];
  createdAt: number;

  // Optional overrides (added later; older saved profiles simply don't have them).
  /** 'custom' uses `customKcal` as the daily goal instead of the calculated one. */
  goalMode?: 'auto' | 'custom';
  customKcal?: number;
  /** Own activity multiplier, used instead of the `activity` level when set. */
  customActivityFactor?: number;
  /** Known maintenance calories (e.g. from a watch); replaces BMR × activity when set. */
  customMaintenanceKcal?: number;
  /** 'grams' uses `macroGramsTarget` instead of the percentage split. */
  macroMode?: 'percent' | 'grams';
  macroGramsTarget?: MacroGrams;
}

/** Profile fields as edited in onboarding and edit-profile (numbers may still be empty). */
export interface ProfileDraft {
  goal: Goal;
  sex: Sex;
  birthYear: number | null;
  heightCm: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  activity: Activity;
  paceKgPerWeek: number | null;
  /** When true, `customActivityFactor` replaces the activity level. */
  useCustomActivity: boolean;
  customActivityFactor: number | null;
}

export interface MacroGrams {
  carbs: number;
  protein: number;
  fat: number;
}

export interface WeightEntry {
  date: string;
  kg: number;
}

export interface FastingSession {
  id: string;
  start: number;
  end?: number;
  targetHours: number;
  planId: string;
  notificationId?: string;
}

export type AIProviderId = 'anthropic' | 'openai' | 'gemini' | 'local';
export const AI_PROVIDERS: AIProviderId[] = ['anthropic', 'openai', 'gemini', 'local'];

export interface AIProviderConfig {
  model: string;
  baseUrl?: string;
}

export interface AISettings {
  primary: AIProviderId | null;
  fallback: AIProviderId | null;
  providers: Record<AIProviderId, AIProviderConfig>;
  /** Below this confidence the fallback provider is asked as well. */
  minConfidence: number;
}

export interface AIItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
}

export interface AIResult {
  items: AIItem[];
  confidence: number;
  notes?: string;
  provider: AIProviderId;
  model: string;
}

export type ThemeId = 'garden' | 'ocean' | 'berry' | 'sunset' | 'forest' | 'mono' | 'neon';
export type MotionPref = 'lively' | 'calm' | 'off';

/** Look of the app (see themes.ts). */
export interface Appearance {
  theme: ThemeId;
  scheme: 'system' | 'light' | 'dark';
  /** Own action colour (hex) instead of the theme's. */
  accent?: string;
  /** Own macro colours (hex); missing ones keep the theme's. */
  macroColors?: Partial<Record<'carbs' | 'protein' | 'fat', string>>;
  motion: MotionPref;
}

export type TabId = 'index' | 'fasting' | 'recipes' | 'progress' | 'profile';
export type DiarySection = 'plate' | 'meals' | 'fasting' | 'water' | 'steps';

/** Order and visibility of tabs and diary sections (see layout.ts). */
export interface LayoutPrefs {
  tabOrder: TabId[];
  hiddenTabs: TabId[];
  addButton: 'left' | 'center' | 'right';
  diaryOrder: DiarySection[];
  hiddenDiary: DiarySection[];
}

export type RecipeTag = 'breakfast' | 'main' | 'snack' | 'vegetarian' | 'vegan' | 'high_protein' | 'quick';

/** A recipe: ingredients for the whole dish, how many servings it makes, and the steps (see recipes.ts). */
export interface Recipe {
  id: string;
  name: string;
  items: SavedMealItem[];
  servings: number;
  steps: string[];
  minutes?: number;
  tags: RecipeTag[];
  /** Own recipes: a small JPEG data URI. Community recipes: an https URL. */
  photo?: string;
  photoCredit?: string;
  source: 'own' | 'community';
  /** Community recipes: who wrote it and who cooked it and checked the values. */
  author?: string;
  testedBy?: string[];
  createdAt: number;
}
