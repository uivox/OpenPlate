import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { answerCheckIn, applyNewGoal, undoLastChange, useCheckIn, useDueCheckIn } from '../src/components/goalCheck';
import { Banner, Button, Card, ChipGroup, Divider, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { INCOMPLETE_BELOW_KCAL, KCAL_PER_KG, MIN_CHANGE_KCAL, MIN_LOGGED_DAYS, MIN_WEIGH_INS, WINDOW_DAYS, type Calculation } from '../src/lib/adaptiveGoal';
import { locale, parseDayKey } from '../src/lib/dates';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import type { TKey } from '../src/lib/i18n';
import { useT } from '../src/lib/useT';

/**
 * Profile → Weekly goal check-in (also from the diary card and the Energy statistics): every step
 * behind the suggested goal, the days it used (tap one to leave it out), the goal history with
 * *Undo*, and the check-in settings.
 */
export default function GoalCheckScreen() {
  const { t, lang } = useT();
  const c = useColors();
  const check = useCheckIn();
  const due = useDueCheckIn();
  const prefs = useStore((s) => s.goalCheck);
  const setPrefs = useStore((s) => s.setGoalCheck);
  const profile = useStore((s) => s.profile)!;
  const n = (v: number) => Math.round(v).toLocaleString(locale(lang));
  const kg = (v: number) => v.toLocaleString(locale(lang), { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const day = (d: string, long = false) => parseDayKey(d).toLocaleDateString(locale(lang), long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' });
  const weekdayName = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(locale(lang), { weekday: 'short' });
  const toggleDay = (d: string) => setPrefs({ excluded: prefs.excluded.includes(d) ? prefs.excluded.filter((x) => x !== d) : [...prefs.excluded, d] });
  const calc: Calculation | null = check && 'calc' in check ? check.calc : null;
  const last = prefs.history[0];

  return (
    <Screen>
      <Txt v="sub">{t('gc_intro', { days: WINDOW_DAYS })}</Txt>

      {check?.kind === 'step_calories' ? <Banner icon="walk-outline" tone="warn" text={t('gc_steps_text')} /> : null}
      {check?.kind === 'missing' ? (
        <Card style={{ gap: 6 }}>
          <Txt v="h3">{t('gc_missing_title')}</Txt>
          <Txt v="sub">{t('gc_missing_days', { have: check.loggedDays, need: MIN_LOGGED_DAYS, days: WINDOW_DAYS, kcal: INCOMPLETE_BELOW_KCAL })}</Txt>
          <Txt v="sub">{t('gc_missing_weights', { have: check.weighIns, need: MIN_WEIGH_INS })}</Txt>
        </Card>
      ) : null}

      {calc ? (
        <>
          {check?.kind === 'suggest' ? (
            <Card tone="beet" style={{ gap: 10 }}>
              <Txt v="label">{t('gc_result')}</Txt>
              <Txt v="big">{t('gc_goal_kcal', { kcal: n(calc.suggestedGoal) })}</Txt>
              <Txt v="sub">{t('gc_now', { kcal: n(calc.currentGoal) })}</Txt>
              <Button icon="checkmark" title={t('gc_use')} onPress={() => applyNewGoal(calc)} />
              {due ? <Button kind="ghost" title={t('gc_keep')} onPress={answerCheckIn} /> : null}
            </Card>
          ) : (
            <Card style={{ gap: 6 }}>
              <Txt v="h3">{check?.kind === 'unusual' ? t('gc_unusual_title') : t('gc_fits_title')}</Txt>
              <Txt v="sub">
                {check?.kind === 'unusual' ? t('gc_unusual_text') : t('gc_fits_text', { kcal: n(calc.currentGoal), min: MIN_CHANGE_KCAL })}
              </Txt>
            </Card>
          )}

          <SectionTitle>{t('gc_how')}</SectionTitle>
          <Card style={{ gap: 10 }}>
            <Step n={1} title={t('gc_step1', { kcal: n(calc.avgIntake) })} text={t('gc_step1_text', { used: calc.usedDays, from: day(calc.from), to: day(calc.to) })} />
            <Divider />
            <Step
              n={2}
              title={t('gc_step2', { kg: `${calc.trendKgPerWeek > 0 ? '+' : calc.trendKgPerWeek < 0 ? '−' : '±'}${kg(Math.abs(calc.trendKgPerWeek))}` })}
              text={t('gc_step2_text', { n: calc.weighIns.length, list: calc.weighIns.map((w) => `${day(w.date)}: ${kg(w.kg)}`).join(' · ') })}
            />
            <Divider />
            <Step
              n={3}
              title={t('gc_step3', { kcal: n(calc.energyUse) })}
              text={t('gc_step3_text', {
                intake: n(calc.avgIntake),
                stored: n(Math.abs((calc.trendKgPerWeek * KCAL_PER_KG) / 7)),
                sign: calc.trendKgPerWeek <= 0 ? '+' : '−',
                per: n(KCAL_PER_KG),
                before: n(calc.currentMaintenance),
              })}
            />
            <Divider />
            <Step
              n={4}
              title={t('gc_step4', { kcal: n(calc.suggestedGoal) })}
              text={[
                t(`gc_step4_${profile.goal}` as TKey, { pace: kg(profile.paceKgPerWeek) }),
                ...calc.warnings.map((w) => t(`gc_warn_${w}` as TKey)),
                profile.goalMode === 'custom' ? t('gc_step4_custom') : t('gc_step4_auto'),
              ].join(' ')}
            />
          </Card>

          <SectionTitle>{t('gc_days')}</SectionTitle>
          <Txt v="small">{t('gc_days_hint', { kcal: INCOMPLETE_BELOW_KCAL })}</Txt>
          <Card style={{ gap: 0, paddingVertical: 6 }}>
            {calc.days.map((d, i) => (
              <View key={d.date}>
                {i ? <Divider /> : null}
                <Pressable
                  onPress={() => toggleDay(d.date)}
                  disabled={d.use === 'incomplete'}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: d.use === 'used', disabled: d.use === 'incomplete' }}
                  style={{ paddingVertical: 10 }}
                >
                  <Row gap={10}>
                    <Ionicons
                      name={d.use === 'used' ? 'checkmark-circle' : d.use === 'excluded' ? 'remove-circle-outline' : 'ellipse-outline'}
                      size={20}
                      color={d.use === 'used' ? c.accent : c.sub}
                    />
                    <Txt style={{ flex: 1 }} color={d.use === 'used' ? c.text : c.sub}>
                      {day(d.date, true)}
                    </Txt>
                    <Txt v="sub">{t(d.use === 'used' ? 'gc_day_used' : d.use === 'excluded' ? 'gc_day_excluded' : 'gc_day_incomplete', { kcal: n(d.kcal) })}</Txt>
                  </Row>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>{t('gc_history')}</SectionTitle>
      <Card style={{ gap: 8 }}>
        {prefs.history.length === 0 ? <Txt v="sub">{t('gc_history_empty')}</Txt> : null}
        {prefs.history.slice(0, 10).map((h, i) => (
          <Row key={h.at} gap={10}>
            <Txt style={{ flex: 1 }}>{t('gc_history_row', { date: new Date(h.at).toLocaleDateString(locale(lang)), from: n(h.oldKcal), to: n(h.newKcal), use: n(h.energyUse) })}</Txt>
            {i === 0 ? <Button small kind="ghost" icon="arrow-undo-outline" title={t('gc_undo')} onPress={undoLastChange} /> : null}
          </Row>
        ))}
        {last ? <Txt v="small">{t('gc_undo_hint')}</Txt> : null}
      </Card>

      <SectionTitle>{t('gc_settings')}</SectionTitle>
      <Card style={{ gap: 10 }}>
        <Row gap={12}>
          <Txt v="h3" style={{ flex: 1 }}>
            {t('gc_switch')}
          </Txt>
          <Switch value={prefs.enabled} onValueChange={(on) => setPrefs({ enabled: on })} trackColor={{ true: c.accent }} accessibilityLabel={t('gc_switch')} />
        </Row>
        {prefs.enabled ? (
          <>
            <Txt v="sub">{t('gc_weekday')}</Txt>
            <ChipGroup<number> options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: weekdayName(d) }))} value={prefs.weekday} onChange={(weekday) => setPrefs({ weekday })} />
          </>
        ) : null}
        <Txt v="small">{t('gc_switch_text')}</Txt>
      </Card>
    </Screen>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  const c = useColors();
  return (
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="label" color={c.accent}>
          {n}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3">{title}</Txt>
        <Txt v="sub">{text}</Txt>
      </View>
    </Row>
  );
}
