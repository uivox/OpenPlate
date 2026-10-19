import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { AI_RATING_TAGS, type AIRating, type AIRatingTag } from '../lib/aiLog';
import { useColors } from '../lib/theme';
import { useT } from '../lib/useT';
import { Card, Chip, Field, Row, Txt } from './ui';

/**
 * Optional rating of an AI answer for the AI answer log (only shown while logging is on).
 * Collapsed by default so it never gets in the way of logging food.
 */
export function AIRatingCard({
  value,
  onChange,
  showWeighed,
}: {
  value: AIRating;
  onChange: (r: AIRating) => void;
  /** Meal photos: "I weighed it" marks the grams as ground truth. Labels are the truth already. */
  showWeighed?: boolean;
}) {
  const { t } = useT();
  const c = useColors();
  const rated = value.tags.length > 0 || !!value.note?.trim() || !!value.weighed;
  const [open, setOpen] = useState(rated);

  const toggleTag = (tag: AIRatingTag) => {
    const has = value.tags.includes(tag);
    let tags = has ? value.tags.filter((x) => x !== tag) : [...value.tags, tag];
    // "Spot on" and the problem tags exclude each other.
    if (!has) tags = tag === 'spot_on' ? ['spot_on'] : tags.filter((x) => x !== 'spot_on');
    onChange({ ...value, tags });
  };

  return (
    <Card tone="inset" style={{ gap: 12 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('rate_title')}
        hitSlop={8}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={8} style={{ flex: 1 }}>
            <Ionicons name={rated ? 'checkmark-circle' : 'chatbubble-ellipses-outline'} size={20} color={c.accent} />
            <Txt v="h3" style={{ flex: 1 }}>
              {t('rate_title')}
            </Txt>
          </Row>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.sub} />
        </Row>
      </Pressable>
      {open ? (
        <>
          <Txt v="small">{t('rate_text')}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {AI_RATING_TAGS.map((tag) => (
              <Chip key={tag} label={t(`rate_${tag}`)} selected={value.tags.includes(tag)} onPress={() => toggleTag(tag)} />
            ))}
          </View>
          {showWeighed ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="body" style={{ flex: 1 }}>
                {t('rate_weighed')}
              </Txt>
              <Switch
                value={!!value.weighed}
                onValueChange={(weighed) => onChange({ ...value, weighed })}
                trackColor={{ true: c.accent }}
                accessibilityLabel={t('rate_weighed')}
              />
            </Row>
          ) : null}
          <Field
            label={t('rate_note')}
            placeholder={t('rate_note_ph')}
            value={value.note ?? ''}
            onChangeText={(note) => onChange({ ...value, note })}
            multiline
            maxLength={1000}
          />
        </>
      ) : null}
    </Card>
  );
}
