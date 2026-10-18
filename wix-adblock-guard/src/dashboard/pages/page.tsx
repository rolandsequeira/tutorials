import React, { type FC, useEffect, useMemo, useState } from 'react';
import { dashboard } from '@wix/dashboard';
import { appInstances, embeddedScripts } from '@wix/app-management';
import {
  Badge,
  Box,
  Button,
  Card,
  Cell,
  ColorInput,
  FormField,
  Input,
  InputArea,
  Layout,
  Loader,
  Page,
  RadioGroup,
  SectionHelper,
  Text,
  ToggleSwitch,
  WixDesignSystemProvider,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import * as Icons from '@wix/wix-ui-icons-common';
import {
  DEFAULT_SETTINGS,
  LIMITS,
  PREMIUM_FEATURES,
  type GuardSettings,
  applyPlan,
  decodeSettings,
  premiumFeaturesUsed,
  toEmbedParameters,
} from '../../shared/config';
import { APP_ID, EMBEDDED_SCRIPT_ID } from '../../shared/constants';

type PlanState = { isPremium: boolean; instanceId?: string };

async function loadPlan(): Promise<PlanState> {
  try {
    const { instance } = await appInstances.getAppInstance();
    return { isPremium: instance?.isFree === false, instanceId: instance?.instanceId };
  } catch {
    return { isPremium: false };
  }
}

async function loadSettings(): Promise<{ settings: GuardSettings; embedded: boolean }> {
  try {
    const script = await embeddedScripts.getEmbeddedScript({ componentId: EMBEDDED_SCRIPT_ID });
    const settings = decodeSettings(script.parameters?.config);
    return { settings: { ...settings, enabled: !script.disabled }, embedded: true };
  } catch {
    // 404: the script hasn't been added to this site yet.
    return { settings: DEFAULT_SETTINGS, embedded: false };
  }
}

async function saveSettings(settings: GuardSettings, isPremium: boolean) {
  await embeddedScripts.embedScript(
    { parameters: toEmbedParameters(settings, isPremium), disabled: !settings.enabled },
    { componentId: EMBEDDED_SCRIPT_ID },
  );
}

const PremiumBadge: FC = () => (
  <Badge size="tiny" skin="premium" prefixIcon={<Icons.PremiumSmall />}>
    Premium
  </Badge>
);

const AdBlockGuardPage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<PlanState>({ isPremium: false });
  const [settings, setSettings] = useState<GuardSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<GuardSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    (async () => {
      const [planState, current] = await Promise.all([loadPlan(), loadSettings()]);
      // Re-apply the plan on every visit, so a site that downgraded stops
      // getting premium behavior and a new install is protected right away.
      const effective = applyPlan(current.settings, planState.isPremium);
      const changed = JSON.stringify(effective) !== JSON.stringify(current.settings);
      if (!current.embedded || changed) {
        try {
          await saveSettings(effective, planState.isPremium);
        } catch {
          dashboard.showToast({ message: 'Could not activate protection. Please refresh.', type: 'error' });
        }
      }
      setPlan(planState);
      setSettings(effective);
      setSaved(effective);
      setLoading(false);
    })();
  }, []);

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(saved), [settings, saved]);
  const lockedFeatures = plan.isPremium ? [] : premiumFeaturesUsed(settings);
  const locked = !plan.isPremium;

  const update = <K extends keyof GuardSettings>(key: K, value: GuardSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const upgrade = () => {
    const url = `https://www.wix.com/apps/upgrade/${APP_ID}?appInstanceId=${plan.instanceId ?? ''}`;
    window.open(url, '_blank', 'noopener');
  };

  const save = async () => {
    if (lockedFeatures.length > 0) {
      dashboard.showToast({
        message: 'Some of your changes need the Premium plan. Upgrade to save them.',
        type: 'warning',
        action: { text: 'Upgrade', onClick: upgrade },
      });
      return;
    }
    setSaving(true);
    try {
      await saveSettings(settings, plan.isPremium);
      setSaved(settings);
      dashboard.showToast({ message: 'Settings saved. Changes are live on your site.', type: 'success' });
    } catch {
      dashboard.showToast({ message: 'Could not save settings. Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <WixDesignSystemProvider features={{ newColorsBranding: true }}>
        <Box align="center" verticalAlign="middle" height="100vh">
          <Loader text="Loading AdBlock Guard..." />
        </Box>
      </WixDesignSystemProvider>
    );
  }

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="AdBlock Guard"
          subtitle="Ask visitors who block ads to allow them on your site."
          actionsBar={
            <Box gap="SP2" verticalAlign="middle">
              {plan.isPremium ? <PremiumBadge /> : <Badge size="small">Free plan</Badge>}
              {!plan.isPremium && (
                <Button skin="premium" prefixIcon={<Icons.PremiumFilled />} onClick={upgrade}>
                  Upgrade
                </Button>
              )}
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          }
        />
        <Page.Content>
          <Layout>
            <Cell span={12}>
              <Card>
                <Card.Header
                  title="Protection"
                  subtitle="Turn detection on or off for your whole site."
                  suffix={
                    <ToggleSwitch checked={settings.enabled} onChange={(e) => update('enabled', e.target.checked)} />
                  }
                />
                <Card.Divider />
                <Card.Content>
                  <Box direction="vertical" gap="SP4">
                    <FormField
                      label="Detect network-level blockers"
                      infoContent="Catches Brave Shields, uBlock Origin and DNS blockers that block ad servers without hiding page elements."
                      labelPlacement="right"
                      stretchContent={false}
                    >
                      <ToggleSwitch
                        checked={settings.networkProbe}
                        onChange={(e) => update('networkProbe', e.target.checked)}
                      />
                    </FormField>
                    <FormField
                      label="Show the message when scripts are blocked"
                      infoContent='Visitors who block all scripts (for example Brave "Block scripts" or NoScript) still see your message. No JavaScript needed.'
                      labelPlacement="right"
                      stretchContent={false}
                    >
                      <ToggleSwitch
                        checked={settings.noScriptProtection}
                        onChange={(e) => update('noScriptProtection', e.target.checked)}
                      />
                    </FormField>
                    <FormField
                      label="Strict mode (fail closed)"
                      suffix={locked ? <PremiumBadge /> : undefined}
                      infoContent="Shows the message by default and removes it only after the detector confirms there is no ad blocker. Protects you even if a blocker targets this app's script."
                      labelPlacement="right"
                      stretchContent={false}
                    >
                      <ToggleSwitch
                        checked={settings.strictMode}
                        disabled={locked}
                        onChange={(e) => update('strictMode', e.target.checked)}
                      />
                    </FormField>
                  </Box>
                </Card.Content>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Card.Header title="Message" subtitle="What visitors see when an ad blocker is detected." />
                <Card.Divider />
                <Card.Content>
                  <Box direction="vertical" gap="SP4">
                    <FormField label="Display">
                      <RadioGroup
                        value={settings.mode}
                        onChange={(value) => update('mode', value as GuardSettings['mode'])}
                      >
                        <RadioGroup.Radio value="notice">Bar at the bottom (can be dismissed)</RadioGroup.Radio>
                        <RadioGroup.Radio value="modal">Pop-up (can be dismissed)</RadioGroup.Radio>
                        <RadioGroup.Radio value="lock" disabled={locked}>
                          Lock the page until ads are allowed{locked ? ' (Premium)' : ''}
                        </RadioGroup.Radio>
                      </RadioGroup>
                    </FormField>
                    <FormField label="Title" suffix={locked ? <PremiumBadge /> : undefined}>
                      <Input
                        value={settings.title}
                        maxLength={LIMITS.title}
                        disabled={locked}
                        onChange={(e) => update('title', e.target.value)}
                      />
                    </FormField>
                    <FormField label="Message" suffix={locked ? <PremiumBadge /> : undefined}>
                      <InputArea
                        value={settings.message}
                        maxLength={LIMITS.message}
                        hasCounter
                        rows={3}
                        disabled={locked}
                        onChange={(e) => update('message', e.target.value)}
                      />
                    </FormField>
                    <Layout>
                      <Cell span={6}>
                        <FormField label="Reload button" suffix={locked ? <PremiumBadge /> : undefined}>
                          <Input
                            value={settings.reloadText}
                            maxLength={LIMITS.button}
                            disabled={locked}
                            onChange={(e) => update('reloadText', e.target.value)}
                          />
                        </FormField>
                      </Cell>
                      <Cell span={6}>
                        <FormField label="Dismiss button" suffix={locked ? <PremiumBadge /> : undefined}>
                          <Input
                            value={settings.dismissText}
                            maxLength={LIMITS.button}
                            disabled={locked || settings.mode === 'lock'}
                            onChange={(e) => update('dismissText', e.target.value)}
                          />
                        </FormField>
                      </Cell>
                    </Layout>
                    <Layout>
                      {(
                        [
                          ['accentColor', 'Button color'],
                          ['backgroundColor', 'Background'],
                          ['textColor', 'Text'],
                        ] as const
                      ).map(([key, label]) => (
                        <Cell span={4} key={key}>
                          <FormField label={label} suffix={locked ? <PremiumBadge /> : undefined}>
                            <ColorInput
                              value={settings[key]}
                              disabled={locked}
                              onConfirm={(value) => update(key, String(value).toUpperCase())}
                            />
                          </FormField>
                        </Cell>
                      ))}
                    </Layout>
                    <FormField label="Show the message" suffix={locked ? <PremiumBadge /> : undefined}>
                      <RadioGroup
                        value={settings.frequency}
                        disabled={locked}
                        onChange={(value) => update('frequency', value as GuardSettings['frequency'])}
                      >
                        <RadioGroup.Radio value="always">On every page</RadioGroup.Radio>
                        <RadioGroup.Radio value="session">Once per visit, after it's dismissed</RadioGroup.Radio>
                      </RadioGroup>
                    </FormField>
                    <FormField label='Show "Protected by AdBlock Guard"' labelPlacement="right" stretchContent={false}
                      suffix={locked ? <PremiumBadge /> : undefined}>
                      <ToggleSwitch
                        checked={settings.showBranding}
                        disabled={locked}
                        onChange={(e) => update('showBranding', e.target.checked)}
                      />
                    </FormField>
                  </Box>
                </Card.Content>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Card.Header title="Excluded pages" subtitle="Pages where the detector won't run, one path per line (e.g. /blog)." />
                <Card.Divider />
                <Card.Content>
                  <FormField suffix={locked ? <PremiumBadge /> : undefined}>
                    <InputArea
                      rows={4}
                      disabled={locked}
                      placeholder={'/about\n/contact'}
                      value={settings.excludedPaths.join('\n')}
                      onChange={(e) =>
                        update(
                          'excludedPaths',
                          e.target.value.split('\n').map((p) => p.trim()).filter(Boolean),
                        )
                      }
                    />
                  </FormField>
                </Card.Content>
              </Card>
            </Cell>

            {!plan.isPremium && (
              <Cell span={12}>
                <SectionHelper
                  appearance="premium"
                  title="Get more with Premium"
                  actionText="Upgrade"
                  onAction={upgrade}
                >
                  <Box direction="vertical">
                    {Object.values(PREMIUM_FEATURES).map((feature) => (
                      <Text size="small" key={feature}>
                        • {feature}
                      </Text>
                    ))}
                  </Box>
                </SectionHelper>
              </Cell>
            )}
          </Layout>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default AdBlockGuardPage;
