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
import { bmr, dailyKcalGoal, macroGrams, per100From, scaleNutrients, sumEntries, defaultWaterGoal } from '../src/lib/nutrition';
import { foodFromOFF } from '../src/lib/openFoodFacts';
import type { AISettings, Profile } from '../src/lib/types';

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
