// Logic tests for the platform-independent modules (no React Native needed).
// Run: npx tsc -p tests/tsconfig.json && node --test .test-build/tests/logic.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMeal, buildMealPrompt, callProvider, parseMealJson, providerOrder, DEFAULT_AI_SETTINGS } from '../src/lib/ai';
import { buildBackup, parseBackup } from '../src/lib/backup';
import { addDays, dayKey, lastNDays, weekdayOf } from '../src/lib/dates';
import { isFastingDay, stageFor } from '../src/lib/fasting';
import { searchGeneric, genericFoods } from '../src/lib/genericFoods';
import { ALL_KEYS, _dicts, translate } from '../src/lib/i18n';
import { dayGoal, weightOn } from '../src/lib/goals';
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
import { foodFromOFF } from '../src/lib/openFoodFacts';
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
  assert.ok(dailyKcalGoal({ ...profile, goal: 'gain' }, 72, now) > 2010);
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
  const gain = { ...profile, goal: 'gain' as const, paceKgPerWeek: 0.4 };
  // maintenance 2006 + 440 = 2446 -> 2450
  assert.equal(dailyKcalGoal(gain, 72, now), 2450);
  const d = goalDetails(gain, 72, now);
  assert.equal(d.maintenance, 2006);
  assert.ok(Math.abs(d.kgPerWeek - 0.4) < 0.01);
  assert.deepEqual(d.warnings, []);

  const exact = goalDetails({ ...profile, goalMode: 'custom', customKcal: 1850 }, 72, now);
  assert.equal(exact.kcal, 1850);
  assert.ok(exact.kgPerWeek < 0);
  // custom mode ignores the minimum floor but warns below BMR
  const low = goalDetails({ ...profile, goalMode: 'custom', customKcal: 1100 }, 72, now);
  assert.equal(low.kcal, 1100);
  assert.ok(low.warnings.includes('below_bmr'));
  // auto mode floors and says so
  const floored = goalDetails({ ...profile, paceKgPerWeek: 1 }, 72, now);
  assert.equal(floored.kcal, 1200);
  assert.ok(floored.warnings.includes('floored'));
  // pace over ~1 % of body weight per week is flagged
  assert.ok(goalDetails({ ...profile, goal: 'gain', paceKgPerWeek: 1 }, 72, now).warnings.includes('fast_pace'));

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
  // goal 2000: hit band 1900–2100; losing counts anything below, gaining anything above
  assert.equal(judgeDay(1950, 2000, 'maintain'), 'hit');
  assert.equal(judgeDay(1800, 2000, 'maintain'), 'under');
  assert.equal(judgeDay(2200, 2000, 'maintain'), 'over');
  assert.equal(judgeDay(1200, 2000, 'lose'), 'hit');
  assert.equal(judgeDay(2101, 2000, 'lose'), 'over');
  assert.equal(judgeDay(3000, 2000, 'gain'), 'hit');
  assert.equal(judgeDay(1890, 2000, 'gain'), 'under');

  const goalFor = () => ({ kcal: 100, goal: 'lose' as const });
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
  };
  const back = parseBackup(JSON.stringify(buildBackup({ ...data, extra: () => 1 } as typeof data, new Date(0))));
  assert.equal(back.meals.length, 1);
  assert.equal(back.meals[0].items[0].grams, 60);
  assert.equal(back.profile?.customKcal, 2300);
  assert.equal(back.profile?.macroGramsTarget?.protein, 160);
  assert.ok(!('extra' in JSON.parse(JSON.stringify(buildBackup({ ...data, extra: 1 } as typeof data)))));
  // older exports without meals still load
  const old = JSON.parse(JSON.stringify(buildBackup(data)));
  delete old.meals;
  old.meals = [{ id: 'x', name: 'broken', items: [{ food: null, grams: 1 }] }];
  assert.deepEqual(parseBackup(JSON.stringify(old)).meals, []);
});
