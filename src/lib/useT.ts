import { getLocales } from 'expo-localization';
import { useCallback } from 'react';
import { translate, type Lang, type TKey } from './i18n';
import { useStore } from './store';
import type { LanguagePref } from './types';

export function resolveLang(pref: LanguagePref): Lang {
  if (pref !== 'system') return pref;
  try {
    return getLocales()[0]?.languageCode === 'de' ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

export function useT() {
  const pref = useStore((s) => s.language);
  const lang = resolveLang(pref);
  const t = useCallback((key: TKey, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
  return { t, lang };
}

export type TFn = ReturnType<typeof useT>['t'];
