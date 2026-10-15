// Logic tests for the platform-independent modules (no React Native needed).
// Run: npx tsc -p tests/tsconfig.json && node --test .test-build/tests/logic.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMeal, buildMealPrompt, callProvider, CANCELLED, isPrivateHost, parseMealJson, providerOrder, sanitizeImportedAI, serverUrlProblem, DEFAULT_AI_SETTINGS } from '../src/lib/ai';
import { buildBackup, parseBackup, parseBackupReport } from '../src/lib/backup';
import { blsFood, searchBLS } from '../src/lib/bls';
import { COMMUNITY_RECIPES } from '../src/lib/communityRecipes';
import { newRecipe, perServing, recipeFood, resolveCommunity, resolveRef, scaleItems, searchRecipes, validateCommunity } from '../src/lib/recipes';
import type { BlsRow } from '../src/lib/blsData';
import { addDays, dayKey, lastNDays, weekdayOf } from '../src/lib/dates';
import { activeFastingDays, isFastingDay, stageFor } from '../src/lib/fasting';
import { searchGeneric, genericFoods } from '../src/lib/genericFoods';
import { ALL_KEYS, _dicts, translate } from '../src/lib/i18n';
import { dayGoal, weightOn } from '../src/lib/goals';
import { move, normalizeLayout, tabSides, toggle, visibleDiary, visibleTabs } from '../src/lib/layout';
import { entriesForMeal, itemsFromEntries, mealTotals, newMeal, searchMeals } from '../src/lib/meals';
import {
  bmr,
  dailyKcalGoal,
  goalDetails,
  isValidSplit,
  kcalPerDayForPace,
  macroGrams,
  macroTargets,
  per100From,
  scaleNutrients,
  splitFromGrams,
  sumEntries,
  defaultWaterGoal,
} from '../src/lib/nutrition';
import { dailyTotals, dayStatus, judgeDay, monthGrid, monthSummary, streakInfo } from '../src/lib/streaks';
import { buildColors, contrast, DEFAULT_APPEARANCE, ensureContrast, mix, normalizeAppearance, normalizeHex, THEMES } from '../src/lib/themes';
import { _resetSearchState, foodFromOFF, isBarcode, nutrientsFromOFF, parseRetailer, rankHits, RateLimitedError, searchOFF } from '../src/lib/openFoodFacts';
import { draftProblem } from '../src/lib/validation';
import { createShardedStorage, memoryStore } from '../src/lib/persistStorage';
import { migrateState, OLD_LOCAL_DEFAULT_URL } from '../src/lib/migrations';
import { goalStatus, minHealthyWeight } from '../src/lib/nutrition';
import type { AISettings, DiaryEntry, Food, Profile } from '../src/lib/types';

const profile: Profile = {
  sex: 'female',
  birthYear: 1996,
  heightCm: 168,
  startWeightKg: 72,
  targetWeightKg: 65,
  activity: 'light',
  goal: 'lose',
  paceKgPerWeek: 0.5,
  macroSplit: { carbs: 50, protein: 20, fat: 30 },
  waterGoalMl: 2500,
  glassMl: 250,
  stepGoal: 10000,
  addActivityCalories: false,
  fastingPlanId: '5:2',
  fastingDays: [1, 4],
  createdAt: 0,
};
const now = new Date(2026, 9, 12);

test('BMR follows Mifflin-St Jeor', () => {
  // 10*72 + 6.25*168 - 5*30 - 161 = 720 + 1050 - 150 - 161 = 1459
  assert.equal(Math.round(bmr(profile, 72, now)), 1459);
  assert.equal(Math.round(bmr({ ...profile, sex: 'male' }, 72, now)), 1625);
});

test('daily goal: deficit, floor and gain', () => {
  // TDEE 1459*1.375 = 2006; minus 550 = 1456 -> 1460
  assert.equal(dailyKcalGoal(profile, 72, now), 1460);
  assert.equal(dailyKcalGoal({ ...profile, paceKgPerWeek: 1 }, 72, now), 1200);
  assert.equal(dailyKcalGoal({ ...profile, goal: 'maintain', paceKgPerWeek: 0 }, 72, now), 2010);
  assert.ok(dailyKcalGoal({ ...profile, goal: 'gain', targetWeightKg: 80 }, 72, now) > 2010);
});

test('macro grams from split', () => {
  assert.deepEqual(macroGrams(2000, { carbs: 50, protein: 20, fat: 30 }), { carbs: 250, protein: 100, fat: 67 });
});

test('scaling and per-100 conversion are inverse', () => {
  const portion = { kcal: 640, protein: 32, carbs: 80, fat: 20 };
  const p100 = per100From(portion, 400);
  assert.deepEqual(p100, { kcal: 160, protein: 8, carbs: 20, fat: 5 });
  const back = scaleNutrients(p100, 400);
  assert.equal(back.kcal, 640);
});

test('sumEntries adds diary entries', () => {
  const food = genericFoods('en').find((f) => f.id === 'generic:banana')!;
  const total = sumEntries([
    { id: '1', date: '2026-10-12', meal: 'breakfast', food, grams: 120, createdAt: 0 },
    { id: '2', date: '2026-10-12', meal: 'snack', food, grams: 100, createdAt: 0 },
  ]);
  assert.equal(Math.round(total.kcal), Math.round(89 * 2.2));
});

test('water goal is bounded', () => {
  assert.equal(defaultWaterGoal(72), 2500);
  assert.equal(defaultWaterGoal(30), 1500);
  assert.equal(defaultWaterGoal(200), 4000);
});

test('dates', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekdayOf('2026-10-12'), 1); // Monday
  assert.deepEqual(lastNDays('2026-10-12', 3), ['2026-10-10', '2026-10-11', '2026-10-12']);
  assert.match(dayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('fasting days and stages', () => {
  assert.equal(isFastingDay(profile, '2026-10-12'), true); // Monday
  assert.equal(isFastingDay(profile, '2026-10-13'), false);
  assert.equal(isFastingDay({ ...profile, fastingPlanId: '16:8' }, '2026-10-12'), false);
  assert.equal(stageFor(0).key, 'stage_digest');
  assert.equal(stageFor(13).key, 'stage_switch');
  assert.equal(stageFor(30).key, 'stage_deep');
});

test('generic search finds both languages and umlauts', () => {
  assert.equal(searchGeneric('apfel', 'de')[0].name, 'Apfel');
  assert.equal(searchGeneric('apple', 'de')[0].name, 'Apfel');
  assert.ok(searchGeneric('brotchen', 'de').some((f) => f.name === 'Brötchen'));
  assert.ok(searchGeneric('dö', 'de').some((f) => f.name === 'Döner'));
  assert.equal(searchGeneric('', 'de').length, 0);
  const ids = genericFoods('en').map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate generic ids');
  for (const f of genericFoods('en')) {
    const { kcal, protein, carbs, fat } = f.per100;
    const fromMacros = protein * 4 + carbs * 4 + fat * 9;
    // alcohol, fibre and rounding aside, energy should roughly match macros (low-calorie vegetables skew)
    if (!['generic:beer', 'generic:red_wine'].includes(f.id) && kcal > 60) {
      assert.ok(Math.abs(fromMacros - kcal) / kcal < 0.25, `${f.id}: ${kcal} kcal vs ${fromMacros.toFixed(0)} from macros`);
    }
  }
});

test('translations: German has every key and placeholders match', () => {
  for (const key of ALL_KEYS) {
    const en = _dicts.en[key];
    const de = _dicts.de[key];
    assert.ok(de && de.trim(), `missing de: ${key}`);
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    assert.equal(ph(de), ph(en), `placeholder mismatch: ${key}`);
  }
  assert.equal(translate('de', 'fasting_mini', { elapsed: '1:00:00', target: 16 }), '1:00:00 von 16 h');
});

test('Open Food Facts mapping', () => {
  const f = foodFromOFF(
    {
      code: '4000000000001',
      product_name: 'Skyr Natur',
      brands: 'Musterhof, Other',
      quantity: '450 g',
      serving_quantity: '150',
      serving_size: '150 g',
      nutriments: { 'energy-kcal_100g': 63, proteins_100g: '11', carbohydrates_100g: 4, fat_100g: 0.2, salt_100g: 0.1 },
    },
    'de',
  )!;
  assert.equal(f.name, 'Skyr Natur');
  assert.equal(f.brand, 'Musterhof');
  assert.equal(f.per100.protein, 11);
  assert.equal(f.unit, 'g');
  assert.deepEqual(f.servings, [{ label: '150 g', grams: 150 }]);
  const drink = foodFromOFF(
    { code: '1', product_name: { de: 'Apfelschorle', en: 'Apple spritzer' }, quantity: '1 l', nutriments: { 'energy-kj_100g': 100 } },
    'de',
  )!;
  assert.equal(drink.name, 'Apfelschorle');
  assert.equal(drink.unit, 'ml');
  assert.equal(Math.round(drink.per100.kcal), 24);
  assert.equal(foodFromOFF({ code: '2', product_name: 'No data' }, 'de'), undefined);
});

test('AI JSON parsing is tolerant', () => {
  const r = parseMealJson(
    'Here you go:\n```json\n{"items":[{"name":"Pasta","grams":"250","kcal":395,"protein":14.5,"carbs":77,"fat":2.3,"confidence":0.8},{"name":"","grams":10,"kcal":5}],"confidence":0.75,"notes":"ok"}\n```',
  );
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].grams, 250);
  assert.equal(r.confidence, 0.75);
  const noOverall = parseMealJson('{"items":[{"name":"Apfel","grams":180,"kcal":94,"confidence":0.9}]}');
  assert.equal(noOverall.items[0].protein, 0);
  assert.equal(noOverall.confidence, 0.9);
  assert.throws(() => parseMealJson('sorry, I cannot help'));
  assert.ok(buildMealPrompt('de', 'mit Öl').includes('German'));
  assert.ok(buildMealPrompt('de', 'mit Öl').includes('mit Öl'));
});

const settings = (primary: AISettings['primary'], fallback: AISettings['fallback']): AISettings => ({
  ...DEFAULT_AI_SETTINGS,
  primary,
  fallback,
});
const reply = (conf: number, n = 1) =>
  JSON.stringify({ items: Array.from({ length: n }, () => ({ name: 'X', grams: 100, kcal: 100, confidence: conf })), confidence: conf });

test('fallback: confident primary is used alone', async () => {
  const calls: string[] = [];
  const out = await analyzeMeal('b64', settings('gemini', 'local'), async () => 'k', 'en', undefined, async (r) => {
    calls.push(r.provider);
    return reply(0.9);
  });
  assert.deepEqual(calls, ['gemini']);
  assert.equal(out.usedFallback, false);
});

test('fallback: unsure primary asks fallback and keeps better answer', async () => {
  const out = await analyzeMeal('b64', settings('local', 'anthropic'), async () => 'k', 'en', undefined, async (r) =>
    r.provider === 'local' ? reply(0.3) : reply(0.85, 2),
  );
  assert.equal(out.result.provider, 'anthropic');
  assert.equal(out.usedFallback, true);
  assert.equal(out.attempts.length, 2);
});

test('fallback: failing primary falls back; both failing throws', async () => {
  const out = await analyzeMeal('b64', settings('openai', 'gemini'), async () => 'k', 'en', undefined, async (r) => {
    if (r.provider === 'openai') throw new Error('HTTP 401');
    return reply(0.6);
  });
  assert.equal(out.result.provider, 'gemini');
  await assert.rejects(
    analyzeMeal('b64', settings('openai', 'gemini'), async () => 'k', 'en', undefined, async () => {
      throw new Error('down');
    }),
    /down/,
  );
  await assert.rejects(analyzeMeal('b64', settings(null, null), async () => null, 'en'), /NO_PROVIDER/);
  assert.deepEqual(providerOrder(settings('gemini', 'gemini')), ['gemini']);
});

test('provider requests are shaped correctly', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fake = (body: unknown) => async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const base = { prompt: 'p', imageBase64: 'AAA' };
  const a = await callProvider({ ...base, provider: 'anthropic', config: { model: 'm' }, apiKey: 'sk' }, fake({ content: [{ type: 'text', text: 'A' }] }));
  assert.equal(a, 'A');
  assert.equal(seen[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal((seen[0].init.headers as Record<string, string>)['x-api-key'], 'sk');
  const g = await callProvider(
    { ...base, provider: 'gemini', config: { model: 'gemini-x' }, apiKey: 'gk' },
    fake({ candidates: [{ content: { parts: [{ text: 'G' }] } }] }),
  );
  assert.equal(g, 'G');
  assert.ok(seen[1].url.endsWith('/models/gemini-x:generateContent'));
  const l = await callProvider(
    { ...base, provider: 'local', config: { model: 'llava', baseUrl: 'http://10.0.0.2:11434/v1/' }, apiKey: null },
    fake({ choices: [{ message: { content: 'L' } }] }),
  );
  assert.equal(l, 'L');
  assert.equal(seen[2].url, 'http://10.0.0.2:11434/v1/chat/completions');
  const body = JSON.parse(String(seen[2].init.body));
  assert.equal(body.response_format, undefined);
  assert.equal(body.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,AAA');
  await assert.rejects(callProvider({ ...base, provider: 'openai', config: { model: 'm' }, apiKey: null }), /No API key/);
  const err = async () => new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 401 });
  await assert.rejects(callProvider({ ...base, provider: 'openai', config: { model: 'm' }, apiKey: 'x' }, err), /HTTP 401: invalid key/);
});

test('backup round-trips and drops invalid rows', () => {
  const food = { id: 'g:apple', source: 'generic' as const, name: 'Apple', per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }, servings: [] };
  const data = {
    profile,
    language: 'de' as const,
    entries: [{ id: 'e1', date: '2026-10-01', meal: 'lunch' as const, food, grams: 150, createdAt: 1 }],
    customFoods: [food],
    recentFoods: [],
    water: { '2026-10-01': 500 },
    weights: [{ date: '2026-10-02', kg: 71.5 }, { date: '2026-10-01', kg: 72 }],
    fastingActive: { id: 'f1', start: 10, targetHours: 16, planId: '16:8', notificationId: 'n1' },
    fastingHistory: [],
    ai: DEFAULT_AI_SETTINGS,
    meals: [],
    recipes: [],
  };
  const json = JSON.stringify(buildBackup(data, new Date(0)));
  const back = parseBackup(json);
  assert.equal(back.language, 'de');
  assert.equal(back.entries.length, 1);
  assert.equal(back.profile?.heightCm, 168);
  assert.deepEqual(back.weights.map((w) => w.date), ['2026-10-01', '2026-10-02']);
  assert.equal(back.fastingActive?.notificationId, undefined);
  assert.equal(back.water['2026-10-01'], 500);

  const messy = JSON.parse(json);
  messy.entries.push({ id: 'bad', date: '01.10.2026', meal: 'lunch', food, grams: 1 }, null, { id: 'x' });
  messy.water.nope = 'a';
  messy.language = 'fr';
  delete messy.recentFoods;
  const cleaned = parseBackup(messy && JSON.stringify(messy));
  assert.equal(cleaned.entries.length, 1);
  assert.deepEqual(Object.keys(cleaned.water), ['2026-10-01']);
  assert.equal(cleaned.language, 'system');
  assert.deepEqual(cleaned.recentFoods, []);

  assert.throws(() => parseBackup('not json'), /INVALID_BACKUP/);
  assert.throws(() => parseBackup('{"app":"Other"}'), /INVALID_BACKUP/);
});

test('custom goals: free pace, exact kcal, own activity and maintenance', () => {
  // 0.4 kg per week is 440 kcal per day
  assert.equal(Math.round(kcalPerDayForPace(0.4)), 440);
  const gain = { ...profile, goal: 'gain' as const, targetWeightKg: 80, paceKgPerWeek: 0.4 };
  // maintenance 2006 + 440 = 2446 -> 2450
  assert.equal(dailyKcalGoal(gain, 72, now), 2450);
  const d = goalDetails(gain, 72, now);
  assert.equal(d.maintenance, 2006);
  assert.ok(Math.abs(d.kgPerWeek - 0.4) < 0.01);
  assert.deepEqual(d.warnings, []);

  const exact = goalDetails({ ...profile, goalMode: 'custom', customKcal: 1850 }, 72, now);
  assert.equal(exact.kcal, 1850);
  assert.ok(exact.kgPerWeek < 0);
  // an exact number below the minimum is raised to it as well (safety floor), and says so
  const low = goalDetails({ ...profile, goalMode: 'custom', customKcal: 1100 }, 72, now);
  assert.equal(low.kcal, 1200);
  assert.ok(low.warnings.includes('floored'));
  assert.ok(goalDetails({ ...profile, goalMode: 'custom', customKcal: 1300 }, 72, now).warnings.includes('below_bmr'));
  // auto mode floors and says so
  const floored = goalDetails({ ...profile, paceKgPerWeek: 1 }, 72, now);
  assert.equal(floored.kcal, 1200);
  assert.ok(floored.warnings.includes('floored'));
  // pace over ~1 % of body weight per week is flagged
  assert.ok(goalDetails({ ...profile, goal: 'gain', targetWeightKg: 80, paceKgPerWeek: 1 }, 72, now).warnings.includes('fast_pace'));

  // own activity factor replaces the level; own maintenance replaces BMR x activity
  assert.equal(goalDetails({ ...profile, goal: 'maintain', customActivityFactor: 1.5 }, 72, now).maintenance, Math.round(1459 * 1.5));
  assert.equal(goalDetails({ ...profile, goal: 'maintain', customMaintenanceKcal: 2400 }, 72, now).kcal, 2400);
  // out-of-range factors are ignored
  assert.equal(goalDetails({ ...profile, goal: 'maintain', customActivityFactor: 9 }, 72, now).maintenance, 2006);
});

test('macro targets: percent, grams, fasting days', () => {
  assert.deepEqual(macroTargets(profile, 2000), { carbs: 250, protein: 100, fat: 67 });
  const grams = { ...profile, macroMode: 'grams' as const, macroGramsTarget: { carbs: 200, protein: 150, fat: 70 } };
  assert.deepEqual(macroTargets(grams, 2000), { carbs: 200, protein: 150, fat: 70 });
  assert.deepEqual(macroTargets(grams, 500, 2000), { carbs: 50, protein: 38, fat: 18 });
  const split = splitFromGrams({ carbs: 200, protein: 150, fat: 70 });
  assert.equal(split.carbs + split.protein + split.fat, 100);
  assert.ok(isValidSplit(split));
  assert.ok(!isValidSplit({ carbs: 50, protein: 30, fat: 30 }));
});

test('day goal uses weight on that day and fasting days', () => {
  const weights = [{ date: '2026-10-01', kg: 80 }, { date: '2026-10-10', kg: 72 }];
  assert.equal(weightOn(weights, profile, '2026-09-30'), 72);
  assert.equal(weightOn(weights, profile, '2026-10-05'), 80);
  const monday = dayGoal(profile, weights, '2026-10-12', now); // 5:2 fasting day
  assert.equal(monday.fastDay, true);
  assert.equal(monday.kcal, 500);
  assert.equal(dayGoal(profile, weights, '2026-10-13', now).kcal, 1460);
});

const apple: Food = { id: 'generic:apple', source: 'generic', name: 'Apfel', per100: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }, servings: [] };
const oats: Food = { id: 'generic:oats', source: 'generic', name: 'Haferflocken', per100: { kcal: 370, protein: 13, carbs: 59, fat: 7 }, servings: [] };
const entry = (date: string, food: Food, grams: number, createdAt = 0): DiaryEntry => ({ id: `${date}-${createdAt}`, date, meal: 'breakfast', food, grams, createdAt });

test('streaks: logged days, goal judgement and calendar', () => {
  // goal 2000: hit band 1900–2100, with 10 % room in the goal's direction
  assert.equal(judgeDay(1950, 2000, 'maintain'), 'hit');
  assert.equal(judgeDay(1800, 2000, 'maintain'), 'under');
  assert.equal(judgeDay(2200, 2000, 'maintain'), 'over');
  assert.equal(judgeDay(1820, 2000, 'lose'), 'hit');
  assert.equal(judgeDay(2101, 2000, 'lose'), 'over');
  assert.equal(judgeDay(2190, 2000, 'gain'), 'hit');
  assert.equal(judgeDay(1890, 2000, 'gain'), 'under');
  // eating far less (or far more) than the goal is never rewarded as a hit
  assert.equal(judgeDay(1200, 2000, 'lose'), 'under');
  assert.equal(judgeDay(300, 2000, 'lose'), 'under');
  assert.equal(judgeDay(0, 2000, 'lose'), 'under');
  assert.equal(judgeDay(3000, 2000, 'gain'), 'over');

  const goalFor = () => ({ kcal: 55, goal: 'lose' as const });
  const totals = dailyTotals([
    entry('2026-10-10', apple, 100),
    entry('2026-10-11', apple, 100),
    entry('2026-10-12', oats, 100), // 370 kcal: over
    entry('2026-10-12', apple, 50, 1),
    entry('2026-10-13', apple, 100),
    entry('2026-10-01', apple, 100),
  ]);
  assert.equal(Math.round(totals.get('2026-10-12')!), 396);

  // today (14th) not logged yet: streak still alive from yesterday
  const info = streakInfo(totals, '2026-10-14', goalFor);
  assert.equal(info.current, 4);
  assert.equal(info.todayLogged, false);
  assert.equal(info.goalStreak, 1); // 13th hit, 12th over
  assert.equal(info.best, 4);
  // a gap breaks it
  assert.equal(streakInfo(totals, '2026-10-15', goalFor).current, 0);
  assert.equal(streakInfo(totals, '2026-10-15', goalFor).best, 4);

  assert.equal(dayStatus('2026-10-12', '2026-10-14', totals, goalFor), 'over');
  assert.equal(dayStatus('2026-10-13', '2026-10-14', totals, goalFor), 'hit');
  assert.equal(dayStatus('2026-10-13', '2026-10-13', totals, goalFor), 'pending');
  assert.equal(dayStatus('2026-10-09', '2026-10-14', totals, goalFor), 'empty');
  assert.equal(dayStatus('2026-10-20', '2026-10-14', totals, goalFor), 'future');

  // October 2026 starts on a Thursday: 3 blanks before it with Monday first
  const grid = monthGrid(2026, 10, 1);
  assert.equal(grid.length % 7, 0);
  assert.deepEqual(grid.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(grid.filter(Boolean).length, 31);
  assert.equal(monthGrid(2026, 10, 0)[4], '2026-10-01');
  assert.deepEqual(monthSummary(grid, '2026-10-14', totals, goalFor), { logged: 5, hit: 4 });
});

test('saved meals: totals, logging with a factor, search', () => {
  const items = itemsFromEntries([entry('2026-10-12', apple, 150, 2), entry('2026-10-12', oats, 60, 1)]);
  assert.equal(items[0].food.id, 'generic:oats'); // keeps the order they were logged in
  const m = newMeal('  Mein Frühstück ', items, 5);
  assert.equal(m.name, 'Mein Frühstück');
  assert.equal(Math.round(mealTotals(m.items).kcal), Math.round(370 * 0.6 + 52 * 1.5));
  assert.equal(Math.round(mealTotals(m.items, 2).kcal), Math.round((370 * 0.6 + 52 * 1.5) * 2));
  const logged = entriesForMeal(m, '2026-10-13', 'snack', 1.5);
  assert.deepEqual(logged.map((e) => e.grams), [90, 225]);
  assert.ok(logged.every((e) => e.date === '2026-10-13' && e.meal === 'snack'));
  const other = { ...newMeal('Abendbrot', [{ food: apple, grams: 100 }], 1), lastUsed: 10 };
  assert.deepEqual(searchMeals([m, other], '').map((x) => x.name), ['Abendbrot', 'Mein Frühstück']);
  assert.deepEqual(searchMeals([m, other], 'fruhstuck').map((x) => x.name), ['Mein Frühstück']);
  assert.deepEqual(searchMeals([m, other], 'hafer').map((x) => x.name), ['Mein Frühstück']);
});

test('backup carries saved meals and custom goal fields', () => {
  const m = newMeal('Frühstück', [{ food: oats, grams: 60 }], 1);
  const data = {
    profile: { ...profile, goalMode: 'custom' as const, customKcal: 2300, macroMode: 'grams' as const, macroGramsTarget: { carbs: 250, protein: 160, fat: 70 } },
    language: 'de' as const,
    entries: [],
    customFoods: [],
    recentFoods: [],
    water: {},
    weights: [],
    fastingActive: null,
    fastingHistory: [],
    meals: [m],
    recipes: [newRecipe({ name: 'Bowl', items: [{ food: oats, grams: 60 }], servings: 1, steps: ['Mix.'], tags: [], photo: 'data:image/jpeg;base64,AAA' }, 1)],
  };
  const back = parseBackup(JSON.stringify(buildBackup({ ...data, extra: () => 1 } as typeof data, new Date(0))));
  assert.equal(back.meals.length, 1);
  assert.equal(back.meals[0].items[0].grams, 60);
  assert.equal(back.recipes[0].photo, 'data:image/jpeg;base64,AAA');
  assert.equal(back.recipes[0].steps[0], 'Mix.');
  assert.equal(back.profile?.customKcal, 2300);
  assert.equal(back.profile?.macroGramsTarget?.protein, 160);
  assert.ok(!('extra' in JSON.parse(JSON.stringify(buildBackup({ ...data, extra: 1 } as typeof data)))));
  // older exports without meals still load
  const old = JSON.parse(JSON.stringify(buildBackup(data)));
  delete old.meals;
  old.meals = [{ id: 'x', name: 'broken', items: [{ food: null, grams: 1 }] }];
  assert.deepEqual(parseBackup(JSON.stringify(old)).meals, []);
});

test('themes: garden is unchanged, every theme is readable', () => {
  const g = buildColors(DEFAULT_APPEARANCE, 'light');
  assert.equal(g.bg, '#EEF2E5');
  assert.equal(g.accent, '#9C2F62');
  assert.equal(g.accentText, '#FFF7FB');
  assert.equal(g.meal.breakfast.tile, '#FCEBC4');
  assert.equal(buildColors(DEFAULT_APPEARANCE, 'dark').bg, '#17121B');
  for (const th of THEMES) {
    for (const scheme of ['light', 'dark'] as const) {
      const col = buildColors({ ...DEFAULT_APPEARANCE, theme: th.id }, scheme);
      const name = `${th.id}/${scheme}`;
      assert.ok(contrast(col.text, col.bg) >= 7, `${name}: text on bg`);
      assert.ok(contrast(col.text, col.card) >= 7, `${name}: text on card`);
      assert.ok(contrast(col.sub, col.card) >= 3.5, `${name}: sub on card ${contrast(col.sub, col.card).toFixed(2)}`);
      assert.ok(contrast(col.accentText, col.accent) >= 4.5, `${name}: accent text`);
      assert.ok(contrast(col.accent, col.bg) >= 2.2, `${name}: accent on bg`);
      for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
        assert.ok(contrast(col.meal[m].icon, col.meal[m].tile) >= 2.4, `${name}: ${m} icon on tile ${contrast(col.meal[m].icon, col.meal[m].tile).toFixed(2)}`);
      }
      for (const [k, v] of Object.entries(col)) if (typeof v === 'string' && v.startsWith('#')) assert.ok(normalizeHex(v), `${name}.${k} ${v}`);
    }
  }
  assert.equal(buildColors({ ...DEFAULT_APPEARANCE, theme: 'neon' }, 'dark').fontDisplay, 'SpaceGrotesk_600SemiBold');
  assert.equal(g.glow, null);
});

test('themes: own accent and macro colours stay visible', () => {
  const own = buildColors({ ...DEFAULT_APPEARANCE, accent: '#22e3ff', macroColors: { protein: '#ff00aa' } }, 'light');
  assert.ok(contrast(own.accent, own.bg) >= 2.2); // cyan on a light ground gets darkened
  assert.ok(contrast(own.accentText, own.accent) >= 4.5);
  assert.equal(own.protein, '#FF00AA');
  assert.equal(own.carbs, '#E39B12');
  const darkOwn = buildColors({ ...DEFAULT_APPEARANCE, accent: '#161616' }, 'dark');
  assert.ok(contrast(darkOwn.accent, darkOwn.bg) >= 2.2); // near-black on dark gets lightened
  assert.equal(mix('#000000', '#FFFFFF', 0.5), '#808080');
  assert.ok(contrast(ensureContrast('#EEEEEE', '#FFFFFF', 3), '#FFFFFF') >= 3);
  assert.equal(normalizeHex('abc'), '#AABBCC');
  assert.equal(normalizeHex('#12345'), null);
  assert.deepEqual(normalizeAppearance({ theme: 'nope' as never, scheme: 'x' as never, motion: 'calm', accent: 'zz' }), {
    theme: 'garden',
    scheme: 'system',
    motion: 'calm',
    accent: undefined,
    macroColors: undefined,
  });
  assert.equal(normalizeAppearance(undefined).motion, 'lively');
});

test('layout: order, hiding and the add button', () => {
  const l = normalizeLayout({ tabOrder: ['progress', 'nope' as never, 'index', 'progress'], hiddenTabs: ['fasting', 'index'], diaryOrder: ['water'], hiddenDiary: ['plate', 'steps'] });
  assert.deepEqual(l.tabOrder, ['progress', 'profile', 'index', 'fasting', 'recipes']); // missing ones follow their default neighbour
  assert.deepEqual(l.hiddenTabs, ['fasting']); // the diary can't be hidden
  assert.deepEqual(visibleTabs(l), ['progress', 'profile', 'index', 'recipes']);
  assert.deepEqual(l.diaryOrder, ['plate', 'meals', 'fasting', 'water', 'steps']);
  assert.deepEqual(visibleDiary(l), ['plate', 'meals', 'fasting', 'water']);
  // a saved order from before the recipes tab gets it next to fasting
  assert.deepEqual(normalizeLayout({ tabOrder: ['profile', 'index', 'fasting', 'progress'] }).tabOrder, ['profile', 'index', 'fasting', 'recipes', 'progress']);
  assert.equal(l.addButton, 'center');
  assert.deepEqual(move(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b']);
  assert.deepEqual(move(['a', 'b'], 'a', -1), ['a', 'b']);
  assert.deepEqual(toggle(['a'], 'b', true), ['a', 'b']);
  assert.deepEqual(toggle(['a', 'b'], 'a', false), ['b']);
  assert.deepEqual(tabSides(['index', 'fasting', 'progress'], 'center'), { left: ['index', 'fasting'], right: ['progress'] });
  assert.deepEqual(tabSides(['index', 'fasting', 'recipes', 'progress', 'profile'], 'center').right, ['progress', 'profile']);
  assert.deepEqual(tabSides(['index', 'profile'], 'left'), { left: [], right: ['index', 'profile'] });
  assert.deepEqual(normalizeLayout(undefined), normalizeLayout({}));
});

test('Open Food Facts: retailer queries and German-first ranking', () => {
  const p = parseRetailer('Lidl Skyr');
  assert.equal(p.retailer?.id, 'lidl');
  assert.equal(p.rest, 'skyr');
  assert.equal(parseRetailer('Aldi Süd Joghurt').retailer?.id, 'aldi');
  assert.equal(parseRetailer('Aldi Süd Joghurt').rest, 'joghurt');
  assert.equal(parseRetailer('dmbio hafer').retailer, undefined); // brand alone is a normal search
  assert.equal(parseRetailer('Gouda').rest, 'Gouda');

  const n = { 'energy-kcal_100g': 60, proteins_100g: 10, carbohydrates_100g: 4, fat_100g: 0.2 };
  const hits = [
    { code: '1', product_name: 'Skyr Vanille', brands: 'Foreign', countries_tags: ['en:france'], nutriments: n },
    { code: '2', product_name: 'Skyr', brands: 'Milbona', countries_tags: ['en:germany'], nutriments: n, unique_scans_n: 5 },
    { code: '3', product_name: 'Skyr Natur', brands: 'Musterhof', countries_tags: ['en:germany'], nutriments: n, unique_scans_n: 900 },
    { code: '4', product_name: 'Joghurt', brands: 'Other', countries_tags: ['en:germany'], nutriments: n },
  ];
  assert.deepEqual(rankHits(hits, 'skyr', 'de').map((h) => h.code), ['3', '2', '1', '4']);
  assert.equal(rankHits(hits, 'skyr', 'de', p.retailer)[0].code, '2'); // Milbona is a Lidl brand
  const store = [...hits, { code: '5', product_name: 'Skyr', brands: 'Hofgut', stores: 'Lidl, Kaufland', nutriments: n }];
  assert.deepEqual(rankHits(store, 'skyr', 'de', p.retailer).slice(0, 2).map((h) => h.code).sort(), ['2', '5']);
});

test('BLS search: both languages, word prefixes, main name first', () => {
  const rows: BlsRow[] = [
    ['F110100', 'Apfelkuchen, Rührteig', 'Apple cake, sponge', 280, 3.5, 38, 12],
    ['F110000', 'Apfel, roh', 'Apple, raw', 54, 0.3, 12.5, 0.2, 2.2, 10.3],
    ['F110200', 'Apfel, gegart', 'Apple, cooked', 50, 0.3, 11.6, 0.2],
    ['B110000', 'Brötchen, Weizen', 'Bread roll, wheat', 265, 8.5, 52, 1.5, 3, 2, null, 1.4],
    ['M120000', 'Joghurt, 3,5 % Fett', 'Yoghurt, 3.5 % fat', 66, 3.8, 4.5, 3.5],
  ];
  assert.deepEqual(searchBLS('apfel', 'de', 5, rows).map((f) => f.name), ['Apfel, roh', 'Apfel, gegart', 'Apfelkuchen, Rührteig']);
  assert.equal(searchBLS('apple raw', 'en', 5, rows)[0].name, 'Apple, raw');
  assert.equal(searchBLS('brotchen', 'de', 5, rows)[0].name, 'Brötchen, Weizen');
  assert.equal(searchBLS('weizen bro', 'de', 5, rows).length, 1); // word order doesn't matter
  assert.deepEqual(searchBLS('a', 'de', 5, rows), []);
  const f = blsFood(rows[3], 'de');
  assert.equal(f.id, 'bls:B110000');
  assert.equal(f.source, 'bls');
  assert.equal(f.per100.salt, 1.4);
  assert.equal(f.per100.satFat, undefined);
  assert.equal(blsFood(rows[1], 'en').name, 'Apple, raw');
});

test('community recipes are valid and plausible', () => {
  assert.deepEqual(validateCommunity(COMMUNITY_RECIPES), []);
  for (const c of COMMUNITY_RECIPES) {
    for (const lang of ['de', 'en'] as const) {
      const { recipe, missing } = resolveCommunity(c, lang);
      assert.deepEqual(missing, []);
      const kcal = perServing(recipe).kcal;
      assert.ok(kcal > 80 && kcal < 1200, `${c.id}: ${Math.round(kcal)} kcal per serving`);
    }
  }
  const broken = { ...COMMUNITY_RECIPES[0], id: 'Bad Id', ingredients: [{ ref: 'generic:nope', grams: 0 }], testedBy: ['OpenPlate'] };
  const errs = validateCommunity([broken]).join('\n');
  assert.match(errs, /lowercase/);
  assert.match(errs, /unknown ingredient generic:nope/);
  assert.match(errs, /grams > 0/);
  assert.match(errs, /can't test their own/);
});

test('recipes: per serving, logging as a food, scaling, search', () => {
  assert.equal(resolveRef('generic:oats', 'de')?.name, 'Haferflocken');
  assert.equal(resolveRef('bls:nope', 'de'), undefined);
  const oats = resolveRef('generic:oats', 'en')!;
  const skyr = resolveRef('generic:skyr', 'en')!;
  const r = newRecipe({ name: ' Bowl ', items: [{ food: oats, grams: 100 }, { food: skyr, grams: 300 }], servings: 2, steps: [], tags: ['breakfast'] }, 1);
  assert.equal(r.name, 'Bowl');
  assert.equal(r.source, 'own');
  const total = oats.per100.kcal + skyr.per100.kcal * 3;
  assert.equal(Math.round(perServing(r).kcal), Math.round(total / 2));
  const food = recipeFood(r, '1 serving');
  assert.equal(food.source, 'recipe');
  assert.deepEqual(food.servings, [{ label: '1 serving', grams: 200 }]);
  // one serving of the food = half the recipe
  assert.equal(Math.round((food.per100.kcal * 200) / 100), Math.round(total / 2));
  assert.deepEqual(scaleItems(r, 3).map((i) => i.grams), [150, 450]);
  assert.deepEqual(searchRecipes([r], 'skyr').length, 1);
  assert.deepEqual(searchRecipes([r], '', 'main').length, 0);
});


/* ---------- Security and safety (release review, Oct 2026) ---------- */

const okReply = { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
function recordingFetch() {
  const calls: { url: string; init: any }[] = [];
  const fn = async (url: string, init: any) => {
    calls.push({ url, init });
    return okReply as any;
  };
  return { calls, fn };
}
const wrapBackup = (extra: object) => JSON.stringify({ app: 'OpenPlate', ...extra });
const goodFood = { id: 'x', source: 'custom', name: 'X', per100: { kcal: 100, protein: 5, carbs: 10, fat: 2 }, servings: [] };

test('security: a backup file cannot redirect API keys', async () => {
  // the attack from the review: a backup that points OpenAI at another server
  const evil = parseBackup(
    wrapBackup({
      ai: {
        primary: 'openai',
        fallback: 'local',
        minConfidence: 0.7,
        providers: {
          openai: { model: 'gpt-x', baseUrl: 'https://attacker.example/v1' },
          local: { model: 'm', baseUrl: 'https://attacker.example/v1' },
        },
      },
    }),
  );
  const current = { ...DEFAULT_AI_SETTINGS, primary: 'anthropic' as const };
  const ai = sanitizeImportedAI(evil.ai, current);
  assert.equal(ai.providers.openai.baseUrl, DEFAULT_AI_SETTINGS.providers.openai.baseUrl);
  assert.equal(ai.providers.local.baseUrl, DEFAULT_AI_SETTINGS.providers.local.baseUrl);
  assert.equal(ai.primary, 'anthropic'); // provider choice stays this device's
  assert.equal(ai.fallback, null);
  assert.equal(ai.providers.openai.model, 'gpt-x'); // model names are fine to carry over
  assert.equal(ai.minConfidence, 0.7);
  // whatever the file says, the key goes to OpenAI
  const f = recordingFetch();
  await callProvider({ provider: 'openai', config: ai.providers.openai, apiKey: 'sk-REAL', prompt: 'p' }, f.fn);
  assert.equal(f.calls[0].url, 'https://api.openai.com/v1/chat/completions');
  // odd model names (which end up in URLs) are not taken over
  assert.equal(sanitizeImportedAI({ providers: { gemini: { model: '../../x?y' } } }, current).providers.gemini.model, DEFAULT_AI_SETTINGS.providers.gemini.model);
  assert.deepEqual(sanitizeImportedAI('nonsense', current), current);
});

test('security: keys never travel over plain http to the internet, and never follow redirects', async () => {
  assert.equal(serverUrlProblem('https://api.openai.com/v1'), null);
  assert.equal(serverUrlProblem('http://192.168.1.20:11434/v1'), null);
  assert.equal(serverUrlProblem('http://localhost:1234/v1'), null);
  assert.equal(serverUrlProblem('http://my-pc.local:11434/v1'), null);
  assert.equal(serverUrlProblem('http://100.101.102.103:11434/v1'), null); // Tailscale
  assert.equal(serverUrlProblem('http://example.com/v1'), 'insecure');
  assert.equal(serverUrlProblem('http://8.8.8.8/v1'), 'insecure');
  assert.equal(serverUrlProblem('http://192.168.1.20.evil.com/v1'), 'insecure');
  assert.equal(serverUrlProblem('https://api.openai.com@evil.com/v1'), 'invalid'); // user-info trick
  assert.equal(serverUrlProblem('ftp://x/v1'), 'invalid');
  assert.equal(serverUrlProblem('javascript:alert(1)'), 'invalid');
  assert.equal(serverUrlProblem(''), 'empty');
  assert.ok(isPrivateHost('10.0.0.1') && isPrivateHost('172.20.1.1') && !isPrivateHost('172.32.1.1'));
  assert.ok(isPrivateHost('[::1]') && isPrivateHost('fd12:3456::1') && !isPrivateHost('2001:db8::1'));

  const f = recordingFetch();
  await assert.rejects(
    callProvider({ provider: 'local', config: { model: 'm', baseUrl: 'http://evil.example/v1' }, apiKey: 'k', prompt: 'p' }, f.fn),
    /plain http/,
  );
  await assert.rejects(callProvider({ provider: 'openai', config: { model: 'm', baseUrl: 'http://api.openai.com/v1' }, apiKey: 'k', prompt: 'p' }, f.fn), /plain http/);
  assert.equal(f.calls.length, 0, 'nothing may be sent');
  // the default local address is empty (no guessed LAN address any more)
  await assert.rejects(callProvider({ provider: 'local', config: DEFAULT_AI_SETTINGS.providers.local, apiKey: null, prompt: 'p' }, f.fn), /No server address/);
  for (const provider of ['anthropic', 'gemini', 'openai'] as const) {
    await callProvider({ provider, config: DEFAULT_AI_SETTINGS.providers[provider], apiKey: 'k', prompt: 'p' }, async (url, init: any) => {
      f.calls.push({ url, init });
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], candidates: [{ content: { parts: [{ text: '{}' }] } }], choices: [{ message: { content: '{}' } }] }) } as any;
    });
  }
  assert.ok(f.calls.every((c) => c.init.redirect === 'error' && c.url.startsWith('https://')));
});

test('AI: cancelling stops the analysis; impossible values are dropped', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(analyzeMeal('img', { ...DEFAULT_AI_SETTINGS, primary: 'anthropic' }, async () => 'k', 'en', undefined, async () => '{}', ctrl.signal), new RegExp(CANCELLED));
  const parsed = parseMealJson(
    JSON.stringify({
      items: [
        { name: 'Pasta', grams: 300, kcal: 450, protein: 15, carbs: 80, fat: 8, confidence: 0.9 },
        { name: 'Giant', grams: 50000, kcal: 900, protein: 1, carbs: 1, fat: 1 },
        { name: 'Dense', grams: 100, kcal: 2000, protein: 1, carbs: 1, fat: 1 },
        { name: 'Heavy macros', grams: 100, kcal: 300, protein: 90, carbs: 90, fat: 10 },
        { name: 'Too few kcal', grams: 200, kcal: 10, protein: 20, carbs: 40, fat: 10, confidence: 0.9 },
      ],
      confidence: 0.9,
    }),
  );
  assert.deepEqual(parsed.items.map((i) => i.name), ['Pasta', 'Too few kcal']);
  assert.equal(parsed.items[1].kcal, 20 * 4 + 40 * 4 + 10 * 9);
  assert.ok(parsed.confidence <= 0.3); // corrected answers make the app ask the fallback
});

test('security: backup import rebuilds every row from checked values', () => {
  const report = parseBackupReport(
    wrapBackup({
      recipes: [
        // tracking-pixel photo, non-text steps, fake community recipe with testers
        { id: 'community:oats', name: 'Oats', servings: 2, steps: [{ evil: 1 }, 42, 'Mix.'], items: [{ food: goodFood, grams: 100 }], photo: 'https://tracker.example/p.gif', tags: 'vegan', testedBy: ['me'], author: 'x', source: 'community' },
        { id: 'r2', name: 'P', servings: 2, steps: [], items: [{ food: goodFood, grams: 100 }], photo: 123 },
        { id: 'r3', name: 'P', servings: 1e-9, steps: [], items: [{ food: goodFood, grams: 100 }] },
        { id: 'r4', name: 'P', servings: 2, steps: [], items: [{ food: goodFood, grams: 100 }], photo: 'data:image/svg+xml;base64,PHN2Zz4=' },
      ],
      entries: [
        { id: 'e1', date: '2026-10-01', meal: 'lunch', grams: -1e12, food: goodFood },
        { id: 'e2', date: '2026-10-01', meal: 'lunch', grams: 100, food: { ...goodFood, per100: { kcal: 100 } } }, // no macros
        { id: 'e3', date: '2026-10-01', meal: 'lunch', grams: 100, food: { ...goodFood, imageUrl: 'https://tracker.example/x.png', evil: '<script>' } },
        { id: 'e3', date: '2026-10-02', meal: 'lunch', grams: 100, food: goodFood }, // duplicate id
      ],
      water: { '2026-10-01': 1e15, '2026-10-02': 750 },
      weights: [{ date: '2026-10-01', kg: 2 }, { date: '2026-10-02', kg: 70 }],
      appearance: { accent: 123, macroColors: 'red' },
      layout: { hiddenTabs: 5, tabOrder: 'x' },
      fastingHistory: [{ id: 'f', start: 1, targetHours: 1e9 }],
      profile: { ...profile, name: 'x'.repeat(5000), macroSplit: { carbs: 90, protein: 90, fat: 90 }, customKcal: 100, goalMode: 'custom' },
    }),
  );
  const d = report.data;
  // recipes with a bad photo keep the recipe but lose the photo; a 1e-9-serving recipe is dropped
  assert.deepEqual(d.recipes.map((x) => x.name), ['Oats', 'P', 'P']);
  assert.ok(d.recipes.every((x) => x.photo === undefined));
  const r = d.recipes[0];
  assert.equal(r.photo, undefined);
  assert.deepEqual(r.steps, ['Mix.']);
  assert.deepEqual(r.tags, []);
  assert.equal(r.source, 'own');
  assert.equal(r.testedBy, undefined);
  assert.ok(!r.id.startsWith('community:'));
  assert.deepEqual(d.entries.map((e) => e.id), ['e3']);
  assert.equal(d.entries[0].food.imageUrl, undefined);
  assert.ok(!('evil' in d.entries[0].food));
  assert.deepEqual(d.water, { '2026-10-02': 750 });
  assert.deepEqual(d.weights, [{ date: '2026-10-02', kg: 70 }]);
  assert.deepEqual(d.fastingHistory, []);
  assert.equal(d.profile?.name?.length, 40);
  assert.deepEqual(d.profile?.macroSplit, { carbs: 50, protein: 20, fat: 30 });
  assert.equal(d.profile?.goalMode, undefined); // 100 kcal is not taken over
  assert.equal(report.skipped, 6); // r3, e1, e2, the water day, the 2 kg weight, the fast
  // wrong types in look and layout never crash
  assert.doesNotThrow(() => normalizeAppearance(d.appearance));
  assert.doesNotThrow(() => normalizeLayout(d.layout));
  assert.equal(normalizeAppearance(d.appearance).accent, undefined);
  // real photos and Open Food Facts images still come through
  const fine = parseBackup(
    wrapBackup({
      recipes: [{ id: 'r', name: 'R', servings: 2, steps: ['a'], items: [{ food: goodFood, grams: 1 }], photo: 'data:image/jpeg;base64,/9j/AAAA', tags: ['vegan', 'nope'] }],
      customFoods: [{ ...goodFood, imageUrl: 'https://images.openfoodfacts.org/images/products/400/1.jpg' }],
    }),
  );
  assert.equal(fine.recipes[0].photo, 'data:image/jpeg;base64,/9j/AAAA');
  assert.deepEqual(fine.recipes[0].tags, ['vegan']);
  assert.equal(fine.customFoods[0].imageUrl, 'https://images.openfoodfacts.org/images/products/400/1.jpg');
});

test('safety: weight loss only for adults with a healthy target', () => {
  const nowS = new Date(2026, 9, 15);
  const teen = { ...profile, birthYear: 2012, heightCm: 160, startWeightKg: 60, targetWeightKg: 50 };
  assert.equal(goalStatus(teen, 60, nowS), 'minor');
  const teenGoal = goalDetails({ ...teen, paceKgPerWeek: 1 }, 60, nowS);
  assert.equal(teenGoal.kcal, Math.round(teenGoal.maintenance / 10) * 10);
  assert.ok(teenGoal.warnings.includes('minor'));
  // an exact low number doesn't get round it either
  assert.ok(goalDetails({ ...teen, goalMode: 'custom', customKcal: 500 }, 60, nowS).kcal >= teenGoal.maintenance - 5);

  // BMI 17.6: no further loss
  const thin = { ...profile, heightCm: 160, startWeightKg: 45, targetWeightKg: 40 };
  assert.equal(goalStatus(thin, 45, nowS), 'underweight');
  assert.ok(goalDetails(thin, 45, nowS).warnings.includes('underweight'));
  assert.ok(goalDetails(thin, 45, nowS).kcal >= goalDetails(thin, 45, nowS).maintenance - 5);

  // target reached: hold the weight
  assert.equal(goalStatus(profile, 64, nowS), 'reached');
  assert.ok(Math.abs(goalDetails(profile, 64, nowS).delta) <= 5);
  assert.ok(goalDetails(profile, 64, nowS).warnings.includes('reached'));

  // nobody gets less than 1200 kcal (or their maintenance, when that is lower), whatever they type
  for (const kcal of [100, 500, 800, 1100]) assert.ok(goalDetails({ ...profile, goalMode: 'custom', customKcal: kcal }, 72, nowS).kcal >= 1200);
  assert.ok(goalDetails({ ...profile, sex: 'male', goalMode: 'custom', customKcal: 1200 }, 72, nowS).kcal >= 1500);
  const tiny = { ...profile, birthYear: 1940, heightCm: 150, startWeightKg: 50, targetWeightKg: 47, activity: 'sedentary' as const };
  const tinyGoal = goalDetails({ ...tiny, paceKgPerWeek: 1 }, 50, nowS);
  assert.ok(tinyGoal.kcal <= tinyGoal.maintenance + 5, 'the floor never turns weight loss into gain');

  // profile forms enforce the same
  const draft = { goal: 'lose' as const, sex: 'female' as const, birthYear: 1995, heightCm: 170, startWeightKg: 75, targetWeightKg: 68, activity: 'light' as const, paceKgPerWeek: 0.5, useCustomActivity: false, customActivityFactor: null };
  assert.equal(draftProblem(draft, nowS), null);
  assert.equal(draftProblem({ ...draft, birthYear: 2011 }, nowS)?.key, 'err_minor_lose');
  assert.equal(draftProblem({ ...draft, birthYear: 2011, goal: 'maintain' }, nowS), null);
  assert.equal(draftProblem({ ...draft, startWeightKg: 52, targetWeightKg: 50 }, nowS)?.key, 'err_underweight_lose');
  assert.deepEqual(draftProblem({ ...draft, targetWeightKg: 45 }, nowS), { key: 'err_target_bmi', params: { kg: minHealthyWeight(170) } });
  assert.equal(minHealthyWeight(170), 53.5);
});

test('safety: fasting days only for adults, and only as many as the plan has', () => {
  const nowS = new Date(2026, 9, 15);
  const monday = '2026-10-12';
  assert.ok(isFastingDay({ ...profile, fastingPlanId: '5:2', fastingDays: [1] }, monday, nowS));
  assert.ok(!isFastingDay({ ...profile, birthYear: 2012, fastingPlanId: '5:2', fastingDays: [1] }, monday, nowS));
  // switching from 5:2 (Mon, Thu) to 6:1 keeps one day
  assert.deepEqual(activeFastingDays({ fastingPlanId: '6:1', fastingDays: [1, 4] }), [4]);
  assert.ok(!isFastingDay({ ...profile, fastingPlanId: '6:1', fastingDays: [1, 4] }, monday, nowS));
  assert.deepEqual(activeFastingDays({ fastingPlanId: '16:8', fastingDays: [1, 4] }), []);
  // a teen's day goal is never a fasting day's 500 kcal
  assert.ok(dayGoal({ ...profile, birthYear: 2012, goal: 'maintain', fastingPlanId: '5:2', fastingDays: [1] }, [], monday, nowS).kcal > 1000);
});


test('storage: entries per month, photos apart, only changed values written', async () => {
  const day = (d: string, id: string) => ({ id, date: d, meal: 'lunch' as const, food: goodFood as Food, grams: 100, createdAt: 0 });
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
  // an install from before: everything in one value
  const legacy = { state: { profile, entries: [day('2026-09-30', 'a'), day('2026-10-01', 'b')], recipes: [{ id: 'r1', name: 'R', photo, items: [], steps: [] }] }, version: 1 };
  const kv = memoryStore({ 'openplate-v1': JSON.stringify(legacy) });
  const store = createShardedStorage<any>(kv);
  const loaded = await store.getItem('openplate-v1');
  assert.equal(loaded!.state.entries.length, 2);
  assert.equal(loaded!.state.recipes[0].photo, photo);

  await store.setItem('openplate-v1', { state: loaded!.state, version: 2 });
  await store.flush();
  assert.ok(kv.data.has('openplate-v1:entries:2026-09') && kv.data.has('openplate-v1:entries:2026-10'));
  assert.ok(kv.data.has('openplate-v1:photo:r1'));
  const main = JSON.parse(kv.data.get('openplate-v1')!);
  assert.equal(main.state.entries, undefined);
  assert.equal(main.state.recipes[0].photo, undefined);

  // logging in October rewrites October only (the main value didn't change)
  kv.writes.length = 0;
  await store.setItem('openplate-v1', { state: { ...loaded!.state, entries: [...loaded!.state.entries, day('2026-10-02', 'c')] }, version: 2 });
  await store.flush();
  assert.deepEqual(kv.writes, [['openplate-v1:entries:2026-10']]);

  // a fresh reader sees the same data
  const again = await createShardedStorage<any>(kv).getItem('openplate-v1');
  assert.deepEqual(again!.state.entries.map((e: any) => e.id).sort(), ['a', 'b', 'c']);
  assert.equal(again!.state.recipes[0].photo, photo);

  // deleting September's only entry and the photo removes their values
  await store.setItem('openplate-v1', { state: { ...again!.state, entries: again!.state.entries.filter((e: any) => e.id !== 'a'), recipes: [{ ...again!.state.recipes[0], photo: undefined }] }, version: 2 });
  await store.flush();
  assert.ok(!kv.data.has('openplate-v1:entries:2026-09'));
  assert.ok(!kv.data.has('openplate-v1:photo:r1'));
});

test('storage: never writes before a successful read, and passes read errors on', async () => {
  const kv = memoryStore({ 'openplate-v1': JSON.stringify({ state: { entries: [] }, version: 2 }) });
  const store = createShardedStorage<any>(kv);
  await store.setItem('openplate-v1', { state: { entries: [], profile: null }, version: 2 });
  await store.flush();
  assert.equal(kv.writes.length, 0, 'a save before the data was read must be ignored');

  // a read that fails (or a damaged value) leaves the stored data untouched
  const broken = memoryStore({ 'openplate-v1': JSON.stringify({ state: { profile }, version: 2 }), 'openplate-v1:entries:2026-10': '{oops' });
  const s2 = createShardedStorage<any>(broken);
  await assert.rejects(s2.getItem('openplate-v1'));
  await s2.setItem('openplate-v1', { state: { entries: [], profile: null }, version: 2 });
  await s2.flush();
  assert.equal(broken.writes.length, 0);
  assert.equal(broken.data.get('openplate-v1:entries:2026-10'), '{oops');

  // months without a main value: the diary is kept (as version 0, so the migration runs)
  const orphan = memoryStore({ 'openplate-v1:entries:2026-10': JSON.stringify([{ id: 'x', date: '2026-10-01' }]) });
  const kept = await createShardedStorage<any>(orphan).getItem('openplate-v1');
  assert.equal(kept!.state.entries.length, 1);
  assert.equal(kept!.version, 0);

  const failing = { ...memoryStore(), multiGet: async () => Promise.reject(new Error('disk')) };
  const s3 = createShardedStorage<any>(failing as any);
  await assert.rejects(s3.getItem('openplate-v1'), /disk/);
});

test('storage: years of diary and many recipe photos stay far below the 2 MB row limit', async () => {
  const kv = memoryStore();
  const store = createShardedStorage<any>(kv);
  await store.getItem('openplate-v1');
  const entries = [];
  for (let i = 0; i < 3 * 365; i++) {
    const date = addDays('2024-01-01', i);
    for (let j = 0; j < 12; j++) entries.push({ id: `${i}-${j}`, date, meal: 'lunch', food: { ...goodFood, name: 'A fairly long product name '.repeat(3) }, grams: 100, createdAt: 0 });
  }
  const photo = 'data:image/jpeg;base64,' + 'A'.repeat(120_000);
  const recipes = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, name: 'R', photo, items: [], steps: [] }));
  await store.setItem('openplate-v1', { state: { profile, entries, recipes }, version: 2 });
  await store.flush();
  const largest = Math.max(...[...kv.data.values()].map((v) => v.length));
  assert.ok(largest < 500_000, `largest stored value is ${largest} characters`);
});

test('storage: migration clears the old sample LAN address and cleans old imported recipes', () => {
  const v1 = {
    ai: { primary: 'anthropic', fallback: null, providers: { local: { model: 'm', baseUrl: OLD_LOCAL_DEFAULT_URL } } },
    recipes: [{ id: 'r', photo: 'https://tracker.example/p.gif', steps: ['ok', { evil: 1 }], tags: 'x' }],
  };
  const m = migrateState(v1, 1) as any;
  assert.equal(m.ai.providers.local.baseUrl, '');
  assert.equal(m.recipes[0].photo, undefined);
  assert.deepEqual(m.recipes[0].steps, ['ok']);
  assert.deepEqual(m.recipes[0].tags, []);
  // someone who really uses that address keeps it
  const used = migrateState({ ...v1, ai: { ...v1.ai, primary: 'local' } }, 1) as any;
  assert.equal(used.ai.providers.local.baseUrl, OLD_LOCAL_DEFAULT_URL);
});


test('release signing: Android release builds use the project key, never silently the public debug key', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { addReleaseSigning } = require(require('node:path').resolve('plugins/addReleaseSigning.js'));
  // the relevant part of the Expo SDK 54 template (templates/expo-template-bare-minimum/android/app/build.gradle)
  const template = [
    'android {',
    '    signingConfigs {',
    '        debug {',
    "            storeFile file('debug.keystore')",
    "            storePassword 'android'",
    "            keyAlias 'androiddebugkey'",
    "            keyPassword 'android'",
    '        }',
    '    }',
    '    buildTypes {',
    '        debug {',
    '            signingConfig signingConfigs.debug',
    '        }',
    '        release {',
    '            signingConfig signingConfigs.debug',
    '            minifyEnabled enableMinifyInReleaseBuilds',
    '        }',
    '    }',
    '}',
  ].join('\n');
  const out: string = addReleaseSigning(template);
  assert.match(out, /release \{\n\s+if \(System\.getenv\('OPENPLATE_KEYSTORE_PATH'\)\)/);
  assert.match(out, /release \{\n\s+signingConfig System\.getenv\('OPENPLATE_KEYSTORE_PATH'\) \? signingConfigs\.release : signingConfigs\.debug/);
  // the debug build type keeps the debug key
  assert.match(out, /debug \{\n\s+signingConfig signingConfigs\.debug\n/);
  assert.equal(addReleaseSigning(out), out);
  assert.throws(() => addReleaseSigning('android {}'), /signingConfigs/);
});


test('Open Food Facts: implausible values rejected, only OFF images, rate limit respected', async () => {
  // kJ typed into the kcal field: use the kJ value instead
  assert.equal(Math.round(nutrientsFromOFF({ 'energy-kcal_100g': 1500, 'energy-kj_100g': 1500, proteins_100g: 5 })!.kcal), 359);
  assert.equal(nutrientsFromOFF({ 'energy-kcal_100g': 5000 }), undefined);
  assert.equal(nutrientsFromOFF({ 'energy-kcal_100g': 300, proteins_100g: 80, carbohydrates_100g: 80 }), undefined);
  assert.equal(nutrientsFromOFF({ 'energy-kcal_100g': 300, sugars_100g: -4 })!.sugar, undefined);
  const p = { code: '4001', product_name: 'Skyr', nutriments: { 'energy-kcal_100g': 63, proteins_100g: 11 } };
  assert.equal(foodFromOFF({ ...p, image_front_small_url: 'https://tracker.example/a.jpg' }, 'de')!.imageUrl, undefined);
  assert.equal(foodFromOFF({ ...p, image_front_small_url: 'https://images.openfoodfacts.org/images/products/400/1/front.jpg' }, 'de')!.imageUrl, 'https://images.openfoodfacts.org/images/products/400/1/front.jpg');
  assert.ok(isBarcode('40084107') && isBarcode('4008400401621') && !isBarcode('123456789'));

  _resetSearchState();
  const calls: string[] = [];
  const ok = async (url: string) => {
    calls.push(url);
    return { ok: true, json: async () => ({ hits: [p] }) } as any;
  };
  const t0 = 1_000_000;
  for (let i = 0; i < 8; i++) await searchOFF(`skyr ${i}`, 'de', 10, ok, t0 + i);
  await assert.rejects(searchOFF('skyr 9', 'de', 10, ok, t0 + 10), (e) => e instanceof RateLimitedError);
  assert.equal(calls.length, 8, 'the 9th search inside a minute is not sent');
  // repeating a search uses the cache, a minute later new searches work again
  await searchOFF('skyr 0', 'de', 10, ok, t0 + 20);
  assert.equal(calls.length, 8);
  await searchOFF('quark', 'de', 10, ok, t0 + 61_000);
  assert.equal(calls.length, 9);

  // after a rate-limit answer the classic endpoint is not asked as well
  _resetSearchState();
  const limited: string[] = [];
  await assert.rejects(
    searchOFF('milch', 'de', 10, async (url: string) => {
      limited.push(url);
      return { ok: false, status: 429, json: async () => ({}) } as any;
    }),
  );
  assert.equal(limited.length, 1);
  _resetSearchState();
});
