import type { DiaryEntry, Food } from './types';

export function amountText(e: DiaryEntry, quickLabel: string): string {
  if (e.food.source === 'quick') return quickLabel;
  const unit = e.food.unit ?? 'g';
  const parts = [`${Math.round(e.grams)} ${unit}`];
  if (e.food.brand) parts.push(e.food.brand);
  return parts.join(' · ');
}

export function foodSubtitle(f: Food): string {
  const unit = f.unit ?? 'g';
  const parts = [`${Math.round(f.per100.kcal)} kcal / 100 ${unit}`];
  if (f.brand) parts.unshift(f.brand);
  return parts.join(' · ');
}

export function fmt(n: number, digits = 0): string {
  return n.toFixed(digits).replace(/\.0+$/, '');
}
