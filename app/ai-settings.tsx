import React, { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { Banner, Button, Card, ChipGroup, Field, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { DEFAULT_AI_SETTINGS, KEY_OPTIONAL, PROVIDER_NAMES, serverUrlProblem, testProvider } from '../src/lib/ai';
import { getApiKey, setApiKey } from '../src/lib/secure';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { AI_PROVIDERS, type AIProviderId } from '../src/lib/types';
import { useT, type TFn } from '../src/lib/useT';

const KEY_LINKS: Partial<Record<AIProviderId, string>> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
  local: 'https://ollama.com/download',
};

export default function AISettingsScreen() {
  const { t } = useT();
  const ai = useStore((s) => s.ai);
  const setAI = useStore((s) => s.setAI);

  const options = [{ value: 'none', label: t('none') }, ...AI_PROVIDERS.map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))];

  return (
    <Screen>
      <Txt v="sub">{t('ai_settings_intro')}</Txt>
      <Banner icon="lock-closed" text={t(Platform.OS === 'web' ? 'ai_privacy_web' : 'ai_privacy')} />

      <Card style={{ gap: 12 }}>
        <Txt v="h3">{t('ai_primary')}</Txt>
        <ChipGroup options={options} value={ai.primary ?? 'none'} onChange={(v) => setAI({ primary: v === 'none' ? null : (v as AIProviderId) })} />
        <Txt v="h3">{t('ai_fallback')}</Txt>
        <ChipGroup
          options={options.filter((o) => o.value === 'none' || o.value !== ai.primary)}
          value={ai.fallback ?? 'none'}
          onChange={(v) => setAI({ fallback: v === 'none' ? null : (v as AIProviderId) })}
        />
        <Txt v="small">{t('ai_fallback_text')}</Txt>
        <Txt v="h3">{t('ai_min_confidence')}</Txt>
        <ChipGroup
          options={[0.3, 0.5, 0.7].map((v) => ({ value: v, label: `${v * 100} %` }))}
          value={ai.minConfidence}
          onChange={(minConfidence) => setAI({ minConfidence })}
        />
      </Card>

      {AI_PROVIDERS.map((p) => (
        <ProviderCard key={p} provider={p} t={t} />
      ))}
    </Screen>
  );
}

function ProviderCard({ provider, t }: { provider: AIProviderId; t: TFn }) {
  const c = useColors();
  const config = useStore((s) => s.ai.providers[provider]);
  const setProviderConfig = useStore((s) => s.setProviderConfig);
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getApiKey(provider).then((k) => setSaved(!!k));
  }, [provider]);

  const saveKey = async () => {
    await setApiKey(provider, key);
    setSaved(!!key.trim());
    setKey('');
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      if (key.trim()) await saveKey();
      const reply = await testProvider(provider, config, await getApiKey(provider));
      setResult({ ok: true, text: t('ai_test_ok', { reply }) });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const showUrl = provider === 'local' || provider === 'openai';
  const url = (config.baseUrl ?? '').trim();
  const urlProblem = url ? serverUrlProblem(url) : null;
  // A custom OpenAI address receives the OpenAI key: say so plainly.
  const customOpenAI = provider === 'openai' && url && !urlProblem && !/^https:\/\/api\.openai\.com(\/|$)/i.test(url);
  const urlHost = url.replace(/^https?:\/\//i, '').split(/[/:]/)[0];

  return (
    <>
      <SectionTitle>{PROVIDER_NAMES[provider]}</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Txt v="sub">{t(`ai_help_${provider}`)}</Txt>
        {KEY_LINKS[provider] ? (
          <Button
            small
            kind="ghost"
            icon="open-outline"
            title={provider === 'local' ? t('get_ollama') : t('get_key')}
            style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
            onPress={() => Linking.openURL(KEY_LINKS[provider]!)}
          />
        ) : null}
        <Field
          label={KEY_OPTIONAL[provider] ? t('api_key_optional') : t('api_key')}
          value={key}
          onChangeText={setKey}
          placeholder={saved ? t('key_saved') : t('paste_key')}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Row>
          <Button small title={t('save_key')} onPress={saveKey} disabled={!key.trim()} />
          {saved ? (
            <Button
              small
              kind="ghost"
              title={t('remove_key')}
              onPress={async () => {
                await setApiKey(provider, '');
                setSaved(false);
              }}
            />
          ) : null}
        </Row>
        <Field
          label={t('model')}
          value={config.model}
          onChangeText={(model) => setProviderConfig(provider, { model })}
          autoCapitalize="none"
          autoCorrect={false}
          hint={t('model_default', { model: DEFAULT_AI_SETTINGS.providers[provider].model })}
        />
        {showUrl ? (
          <Field
            label={t('server_url')}
            value={config.baseUrl ?? ''}
            onChangeText={(baseUrl) => setProviderConfig(provider, { baseUrl })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            hint={
              provider === 'local'
                ? [t('server_url_hint'), Platform.OS === 'web' ? t('server_url_web_note') : ''].filter(Boolean).join('\n')
                : undefined
            }
          />
        ) : null}
        {showUrl && urlProblem ? (
          <Txt v="small" color={c.danger}>
            {t(urlProblem === 'insecure' ? 'server_url_insecure' : 'server_url_invalid')}
          </Txt>
        ) : null}
        {customOpenAI ? <Banner icon="warning" tone="warn" text={t('openai_custom_url_note', { host: urlHost })} /> : null}
        <Button kind="secondary" small icon="pulse" title={t('test_connection')} onPress={test} loading={testing} />
        {result ? (
          <Txt v="small" color={result.ok ? c.accent : c.danger}>
            {result.text}
          </Txt>
        ) : null}
      </Card>
    </>
  );
}
