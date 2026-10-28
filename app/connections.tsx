import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { Switch, View } from 'react-native';
import { Card, Divider, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { countByPurpose, CONNECTION_PURPOSES, LOG_DAYS, pruneLog, type ConnectionRecord } from '../src/lib/connectionLog';
import { formatTime, locale } from '../src/lib/dates';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

/**
 * Profile → Your data → Connection log: every connection to an outside server in the last 7 days,
 * grouped by day. Only when, where, why, whether a photo went along and whether it worked; never
 * what was sent. Kept on this device only, never in a backup.
 */
export default function Connections() {
  const { t, lang } = useT();
  const c = useColors();
  const on = useStore((s) => s.security.logConnections);
  const stored = useStore((s) => s.connections);
  const setSecurity = useStore((s) => s.setSecurity);
  const clear = useStore((s) => s.clearConnections);
  const records = useMemo(() => pruneLog(stored, Date.now()), [stored]);
  const counts = countByPurpose(records);

  const days = useMemo(() => {
    const out: { label: string; items: ConnectionRecord[] }[] = [];
    for (const r of records) {
      const label = new Date(r.at).toLocaleDateString(locale(lang), { weekday: 'long', day: 'numeric', month: 'long' });
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(r);
      else out.push({ label, items: [r] });
    }
    return out;
  }, [records, lang]);

  return (
    <Screen>
      <Card style={{ gap: 10 }}>
        <Row gap={12}>
          <Txt v="h3" style={{ flex: 1 }}>
            {t('conn_switch')}
          </Txt>
          <Switch
            value={on}
            onValueChange={(v) => {
              setSecurity({ logConnections: v });
              if (!v) clear();
            }}
            trackColor={{ true: c.accent }}
            accessibilityLabel={t('conn_switch')}
            testID="conn-switch"
          />
        </Row>
        <Txt v="sub">{t('conn_explain', { n: LOG_DAYS })}</Txt>
      </Card>

      {on && records.length ? (
        <Card style={{ gap: 6 }}>
          <Txt v="label">{t('conn_summary', { n: records.length, days: LOG_DAYS })}</Txt>
          {CONNECTION_PURPOSES.filter((p) => counts[p]).map((p) => (
            <Row key={p} gap={10}>
              <Txt style={{ flex: 1 }}>{t(`conn_p_${p}`)}</Txt>
              <Txt v="sub">{counts[p]}</Txt>
            </Row>
          ))}
        </Card>
      ) : null}

      {on && !records.length ? <Txt v="sub">{t('conn_empty', { n: LOG_DAYS })}</Txt> : null}

      {on
        ? days.map((d) => (
            <View key={d.label} style={{ gap: 8 }}>
              <SectionTitle>{d.label}</SectionTitle>
              <Card style={{ gap: 0 }}>
                {d.items.map((r, i) => (
                  <View key={`${r.at}-${i}`}>
                    {i ? <Divider /> : null}
                    <Row gap={10} style={{ paddingVertical: 8, alignItems: 'flex-start' }}>
                      <Ionicons name={r.ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={r.ok ? c.accent : c.sub} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt>{t(`conn_p_${r.purpose}`)}</Txt>
                        <Txt v="small">
                          {[formatTime(r.at, lang), r.host, r.photo ? t('conn_photo') : null, r.ok ? null : r.status ? t('conn_failed_status', { s: r.status }) : t('conn_failed')]
                            .filter(Boolean)
                            .join(' · ')}
                        </Txt>
                      </View>
                    </Row>
                  </View>
                ))}
              </Card>
            </View>
          ))
        : null}
    </Screen>
  );
}
