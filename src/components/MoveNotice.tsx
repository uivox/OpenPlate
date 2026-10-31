import React, { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { RELEASES_URL, WEB_URL } from '../lib/appIdentity';
import { cancelAllNotifications } from '../lib/device';
import { useStore } from '../lib/store';
import { space } from '../lib/theme';
import { useT } from '../lib/useT';
import { exportBackupFlow } from './exportBackup';
import { Button, Card, Row, Txt } from './ui';

/**
 * Shown at the top of the diary in the last OpenPlate build and in the web app at the old address
 * (`oldAppCopy`): how to move to Tellerwerk. It can't be dismissed, since this copy has no other
 * job any more. Nothing moves by itself: the user exports, imports in Tellerwerk, and turns off the
 * reminders here, each with its own button.
 */
export function MoveNotice() {
  const { t } = useT();
  const reminders = useStore((s) => s.reminders.enabled);
  const schedule = useStore((s) => s.fastingSchedule);
  const [turnedOff, setTurnedOff] = useState(false);
  const web = Platform.OS === 'web';
  const anyOn = reminders || schedule.closeNotice || schedule.doneNotice;

  const turnOff = async () => {
    const s = useStore.getState();
    s.setReminders({ enabled: false });
    s.setFastingSchedule({ closeNotice: false, doneNotice: false });
    await cancelAllNotifications();
    setTurnedOff(true);
  };

  return (
    <View testID="move-notice">
      <Card tone="beet">
        <Txt v="h3">{t('move_title')}</Txt>
        <Txt v="sub">{t(web ? 'move_text_web' : 'move_text')}</Txt>
        <Txt v="sub">{t('move_step1')}</Txt>
        <Txt v="sub">{t(web ? 'move_step2_web' : 'move_step2')}</Txt>
        <Txt v="sub">{t(web ? 'move_step3_web' : 'move_step3')}</Txt>
        <Txt v="small">{t('move_not_in_backup')}</Txt>
        <Row style={{ flexWrap: 'wrap', marginTop: space.xs }}>
          <Button small icon="share-outline" title={t('move_export')} onPress={exportBackupFlow} />
          <Button
            small
            kind="secondary"
            icon="open-outline"
            title={t(web ? 'move_open_web' : 'move_get')}
            onPress={() => Linking.openURL(web ? WEB_URL : RELEASES_URL).catch(() => {})}
          />
        </Row>
        {anyOn && !turnedOff ? (
          <Button small kind="ghost" icon="notifications-off-outline" title={t('move_off')} onPress={() => void turnOff()} style={{ alignSelf: 'flex-start' }} />
        ) : (
          <Txt v="small">{t('move_off_done')}</Txt>
        )}
      </Card>
    </View>
  );
}
