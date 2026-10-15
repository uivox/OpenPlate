import React from 'react';
import { View } from 'react-native';
import type { GoalDetails } from '../lib/nutrition';
import { useColors } from '../lib/theme';
import type { Sex } from '../lib/types';
import { useT } from '../lib/useT';
import { Banner, Row, Txt } from './ui';

/** Notes about a goal (too fast, below BMR, raised to the minimum, no deficit for under-18s, …). */
export function GoalWarnings({ details }: { details: GoalDetails; sex?: Sex }) {
  const { t } = useT();
  if (details.warnings.length === 0) return null;
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      {details.warnings.map((w) => (
        <Banner
          key={w}
          icon="information-circle"
          tone="warn"
          text={
            w === 'below_bmr'
              ? t('warn_below_bmr', { bmr: details.bmr })
              : w === 'floored'
                ? t('warn_floored', { min: details.kcal })
                : t(`warn_${w}`)
          }
        />
      ))}
    </View>
  );
}

/** Goal, maintenance, difference and the weekly change it implies. */
export function GoalBreakdown({ details }: { details: GoalDetails }) {
  const { t, lang } = useT();
  const c = useColors();
  const num = (n: number) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±');
  const kg = Math.abs(details.kgPerWeek).toFixed(2).replace('.', t('decimal_sep'));
  const rows: [string, string][] = [
    [t('maintenance'), `${num(details.maintenance)} kcal`],
    [t('difference'), `${sign(details.delta)}${num(Math.abs(details.delta))} kcal`],
    [t('expected_change'), t('kg_per_week', { kg: `${sign(Math.round(details.kgPerWeek * 100))}${kg}` })],
  ];
  return (
    <View style={{ gap: 4, alignSelf: 'stretch' }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <Txt v="label">{t('your_daily_goal')}</Txt>
        <Txt v="big" color={c.accent}>
          {num(details.kcal)}
        </Txt>
      </Row>
      {rows.map(([label, value]) => (
        <Row key={label} style={{ justifyContent: 'space-between' }}>
          <Txt v="sub">{label}</Txt>
          <Txt v="sub" color={c.text}>
            {value}
          </Txt>
        </Row>
      ))}
    </View>
  );
}
