import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { locale } from '../lib/dates';
import { useT } from '../lib/useT';
import { answerCheckIn, applyNewGoal, useCheckIn, useDueCheckIn } from './goalCheck';
import { Button, Card, Row, Txt } from './ui';

/**
 * The weekly goal check-in in the diary (adaptiveGoal.ts). Only a suggestion: the goal changes when
 * the user taps *Use new goal*; *Show calculation* opens every step behind the number.
 */
export function GoalCheckCard() {
  const { t, lang } = useT();
  const due = useDueCheckIn();
  const check = useCheckIn();
  if (!due || !check) return null;
  const n = (v: number) => v.toLocaleString(locale(lang));
  const details = () => router.push('/goal-check');

  let text: string;
  if (check.kind === 'missing')
    text = t('gc_card_missing', { days: Math.max(0, check.needDays - check.loggedDays), weighIns: Math.max(0, check.needWeighIns - check.weighIns) });
  else if (check.kind === 'step_calories') text = t('gc_card_steps');
  else if (check.kind === 'unusual') text = t('gc_card_unusual', { kcal: n(check.calc.energyUse) });
  else if (check.kind === 'fits') text = t('gc_card_fits', { kcal: n(check.calc.energyUse), goal: n(check.calc.currentGoal) });
  else text = t('gc_card_suggest', { kcal: n(check.calc.energyUse), goal: n(check.calc.suggestedGoal), now: n(check.calc.currentGoal) });

  return (
    <View testID="goal-check-card">
    <Card style={{ gap: 10 }}>
      <Txt v="label">{t('gc_card_title')}</Txt>
      <Txt>{text}</Txt>
      {check.kind === 'suggest' ? (
        <View style={{ gap: 8 }}>
          <Button small icon="checkmark" title={t('gc_use')} onPress={() => applyNewGoal(check.calc)} />
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Button small kind="secondary" title={t('gc_keep')} onPress={answerCheckIn} />
            <Button small kind="ghost" icon="calculator-outline" title={t('gc_show')} onPress={details} />
          </Row>
        </View>
      ) : (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Button small kind="secondary" title={t('gc_ok')} onPress={answerCheckIn} />
          <Button small kind="ghost" icon="calculator-outline" title={t('gc_show')} onPress={details} />
        </Row>
      )}
    </Card>
    </View>
  );
}
