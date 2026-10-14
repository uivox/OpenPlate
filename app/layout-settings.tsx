import React from 'react';
import { Switch, View } from 'react-native';
import { Button, Card, ChipGroup, Divider, IconButton, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { DEFAULT_LAYOUT, FIXED_DIARY, FIXED_TABS, move, toggle } from '../src/lib/layout';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import type { DiarySection, LayoutPrefs, TabId } from '../src/lib/types';
import { useT, type TFn } from '../src/lib/useT';

const tabLabel = (id: TabId, t: TFn) =>
  ({ index: t('tab_diary'), fasting: t('tab_fasting'), progress: t('tab_progress'), profile: t('tab_profile') })[id];
const sectionLabel = (id: DiarySection, t: TFn) =>
  ({ plate: t('section_plate'), meals: t('meals'), fasting: t('tab_fasting'), water: t('water'), steps: t('steps') })[id];

/** Order and visibility of tabs and diary sections, and which side the add button sits on. */
export default function LayoutSettingsScreen() {
  const { t } = useT();
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);

  return (
    <Screen>
      <SectionTitle>{t('tabs_order')}</SectionTitle>
      <OrderList<TabId>
        order={layout.tabOrder}
        hidden={layout.hiddenTabs}
        fixed={FIXED_TABS}
        label={(id) => tabLabel(id, t)}
        onOrder={(tabOrder) => setLayout({ tabOrder })}
        onHidden={(hiddenTabs) => setLayout({ hiddenTabs })}
      />
      <Txt v="small">{t('tabs_order_hint')}</Txt>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('add_button_pos')}</Txt>
        <ChipGroup<LayoutPrefs['addButton']>
          options={[
            { value: 'left', label: t('pos_left') },
            { value: 'center', label: t('pos_center') },
            { value: 'right', label: t('pos_right') },
          ]}
          value={layout.addButton}
          onChange={(addButton) => setLayout({ addButton })}
        />
      </Card>

      <SectionTitle>{t('diary_order')}</SectionTitle>
      <OrderList<DiarySection>
        order={layout.diaryOrder}
        hidden={layout.hiddenDiary}
        fixed={FIXED_DIARY}
        label={(id) => sectionLabel(id, t)}
        onOrder={(diaryOrder) => setLayout({ diaryOrder })}
        onHidden={(hiddenDiary) => setLayout({ hiddenDiary })}
      />
      <Txt v="small">{t('diary_order_hint')}</Txt>

      <Button kind="ghost" icon="refresh" title={t('reset_layout')} onPress={() => setLayout(DEFAULT_LAYOUT)} />
    </Screen>
  );
}

function OrderList<T extends string>({
  order,
  hidden,
  fixed,
  label,
  onOrder,
  onHidden,
}: {
  order: T[];
  hidden: T[];
  fixed: T[];
  label: (id: T) => string;
  onOrder: (o: T[]) => void;
  onHidden: (h: T[]) => void;
}) {
  const { t } = useT();
  const c = useColors();
  return (
    <Card style={{ gap: 0, paddingVertical: 6 }}>
      {order.map((id, i) => {
        const shown = !hidden.includes(id);
        return (
          <View key={id}>
            {i > 0 ? <Divider /> : null}
            <Row gap={4} style={{ paddingVertical: 4 }}>
              <Txt style={{ flex: 1, opacity: shown ? 1 : 0.45 }}>{label(id)}</Txt>
              <IconButton
                icon="chevron-up"
                size={18}
                color={i === 0 ? c.line : c.text}
                label={`${t('move_up')}: ${label(id)}`}
                onPress={() => onOrder(move(order, id, -1))}
              />
              <IconButton
                icon="chevron-down"
                size={18}
                color={i === order.length - 1 ? c.line : c.text}
                label={`${t('move_down')}: ${label(id)}`}
                onPress={() => onOrder(move(order, id, 1))}
              />
              <Switch
                value={shown}
                disabled={fixed.includes(id)}
                onValueChange={(on) => onHidden(toggle(hidden, id, !on))}
                trackColor={{ true: c.accent }}
                accessibilityLabel={label(id)}
              />
            </Row>
          </View>
        );
      })}
    </Card>
  );
}
