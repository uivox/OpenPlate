/**
 * The spreadsheet export (Profile → Your data → Export as CSV): one zip file with a table per kind
 * of data, for any date range. Metric units; column names in the app language. German files use
 * `;` between columns and a decimal comma, as German spreadsheet apps expect; English files use
 * `,` and a decimal point. Pure: no React Native imports.
 */
import { strToU8, zipSync } from 'fflate';
import { entryNutrients } from './nutrition';
import type { TKey } from './i18n';
import type { DiaryEntry, FastingSession, Food, WeightEntry } from './types';

type Translate = (key: TKey, params?: Record<string, string | number>) => string;

export type CsvRangePreset = 'all' | '30' | '90' | '365';
export const CSV_RANGE_PRESETS: CsvRangePreset[] = ['all', '30', '90', '365'];

/** Inclusive day range (YYYY-MM-DD); a missing end means no limit. */
export interface DayRange {
  from?: string;
  to?: string;
}

export function presetRange(preset: CsvRangePreset, today: string, addDays: (key: string, n: number) => string): DayRange {
  if (preset === 'all') return {};
  return { from: addDays(today, -(Number(preset) - 1)), to: today };
}

const inRange = (day: string, r: DayRange) => (!r.from || day >= r.from) && (!r.to || day <= r.to);

export interface CsvSource {
  entries: DiaryEntry[];
  weights: WeightEntry[];
  water: Record<string, number>;
  fastingHistory: FastingSession[];
  customFoods: Food[];
}

export interface CsvTable {
  /** File name inside the zip, without the extension. */
  name: string;
  rows: (string | number | null | undefined)[][];
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const localTime = (ms: number) => {
  const d = new Date(ms);
  return `${localDay(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const r1 = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);

export function buildCsvTables(src: CsvSource, range: DayRange, t: Translate): CsvTable[] {
  const diary: CsvTable = {
    name: t('csv_file_diary'),
    rows: [
      [t('csv_date'), t('csv_logged_at'), t('csv_meal'), t('csv_food'), t('csv_brand'), t('csv_grams'), t('csv_kcal'), t('csv_protein'), t('csv_carbs'), t('csv_fat'), t('csv_sugar'), t('csv_fiber'), t('csv_sat_fat'), t('csv_salt')],
      ...src.entries
        .filter((e) => inRange(e.date, range))
        .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
        .map((e) => {
          const n = entryNutrients(e);
          return [
            e.date,
            localTime(e.createdAt),
            t(`meal_${e.meal}`),
            e.food.name,
            e.food.brand ?? '',
            r1(e.grams),
            Math.round(n.kcal),
            r1(n.protein),
            r1(n.carbs),
            r1(n.fat),
            r1(n.sugar),
            r1(n.fiber),
            r1(n.satFat),
            r1(n.salt),
          ];
        }),
    ],
  };
  const weights: CsvTable = {
    name: t('csv_file_weights'),
    rows: [[t('csv_date'), t('csv_kg')], ...src.weights.filter((w) => inRange(w.date, range)).sort((a, b) => a.date.localeCompare(b.date)).map((w) => [w.date, r1(w.kg)])],
  };
  const water: CsvTable = {
    name: t('csv_file_water'),
    rows: [
      [t('csv_date'), t('csv_ml')],
      ...Object.entries(src.water)
        .filter(([d, ml]) => ml > 0 && inRange(d, range))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, ml]) => [d, Math.round(ml)]),
    ],
  };
  const fasting: CsvTable = {
    name: t('csv_file_fasting'),
    rows: [
      [t('csv_start'), t('csv_end'), t('csv_planned_hours'), t('csv_hours'), t('csv_completed'), t('csv_scheduled')],
      ...src.fastingHistory
        .filter((f) => f.end && inRange(localDay(f.start), range))
        .sort((a, b) => a.start - b.start)
        .map((f) => {
          const hours = (f.end! - f.start) / 3600000;
          return [localTime(f.start), localTime(f.end!), f.targetHours, r1(hours), hours >= f.targetHours ? t('csv_yes') : t('csv_no'), f.scheduledFor ? t('csv_yes') : t('csv_no')];
        }),
    ],
  };
  // Own foods have no date: they're always included in full.
  const foods: CsvTable = {
    name: t('csv_file_foods'),
    rows: [
      [t('csv_food'), t('csv_brand'), t('csv_barcode'), t('csv_unit'), t('csv_kcal_100'), t('csv_protein'), t('csv_carbs'), t('csv_fat'), t('csv_sugar'), t('csv_fiber'), t('csv_sat_fat'), t('csv_salt')],
      ...src.customFoods.map((f) => [
        f.name,
        f.brand ?? '',
        f.barcode ?? '',
        f.unit === 'ml' ? '100 ml' : '100 g',
        Math.round(f.per100.kcal),
        r1(f.per100.protein),
        r1(f.per100.carbs),
        r1(f.per100.fat),
        r1(f.per100.sugar),
        r1(f.per100.fiber),
        r1(f.per100.satFat),
        r1(f.per100.salt),
      ]),
    ],
  };
  return [diary, weights, water, fasting, foods];
}

/**
 * One cell. Text that a spreadsheet would run as a formula (starting with = + - @ or a tab) gets a
 * leading apostrophe, so a food name from Open Food Facts can't become a formula on the user's
 * computer. Cells with the separator, quotes or line breaks are quoted.
 */
export function csvCell(v: string | number | null | undefined, lang: 'de' | 'en'): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    const s = String(v);
    return lang === 'de' ? s.replace('.', ',') : s;
  }
  let s = v.replace(/\r\n?/g, '\n');
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  const sep = lang === 'de' ? ';' : ',';
  return s.includes(sep) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tableToCsv(table: CsvTable, lang: 'de' | 'en'): string {
  const sep = lang === 'de' ? ';' : ',';
  return table.rows.map((row) => row.map((v) => csvCell(v, lang)).join(sep)).join('\r\n') + '\r\n';
}

/** The zip file's bytes. Each CSV starts with a byte-order mark so spreadsheet apps read UTF-8 (umlauts). */
export function zipTables(tables: CsvTable[], lang: 'de' | 'en'): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const tb of tables) files[`${tb.name}.csv`] = strToU8(`﻿${tableToCsv(tb, lang)}`);
  return zipSync(files, { level: 6 });
}

/** Rows without the header, per table (shown before exporting). */
export function rowCounts(tables: CsvTable[]): number[] {
  return tables.map((tb) => Math.max(0, tb.rows.length - 1));
}
