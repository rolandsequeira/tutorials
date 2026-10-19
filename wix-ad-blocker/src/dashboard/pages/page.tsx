import React, { type FC, useEffect, useMemo, useState } from 'react';
import { dashboard } from '@wix/dashboard';
import { appInstances, embeddedScripts } from '@wix/app-management';
import {
  Badge,
  Box,
  Button,
  Card,
  Cell,
  FormField,
  InputArea,
  Layout,
  Loader,
  Page,
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
  type BlockerSettings,
  applyPlan,
  cleanDomain,
  decodeSettings,
  isProtectedDomain,
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

async function loadSettings(): Promise<{ settings: BlockerSettings; embedded: boolean }> {
  try {
    const script = await embeddedScripts.getEmbeddedScript({ componentId: EMBEDDED_SCRIPT_ID });
    const settings = decodeSettings(script.parameters?.config);
    return { settings: { ...settings, enabled: !script.disabled }, embedded: true };
  } catch {
    // 404: the script hasn't been added to this site yet.
    return { settings: DEFAULT_SETTINGS, embedded: false };
  }
}

async function saveSettings(settings: BlockerSettings, isPremium: boolean) {
  await embeddedScripts.embedScript(
    { parameters: toEmbedParameters(settings, isPremium), disabled: !settings.enabled },
    { componentId: EMBEDDED_SCRIPT_ID },
  );
}

const lines = (value: string) => value.split('\n').map((l) => l.trim()).filter(Boolean);

/** Explains entries in a domain list that won't be used, so nothing is dropped silently. */
function domainProblems(entries: string[], blocking: boolean): string | undefined {
  const invalid = entries.filter((e) => !cleanDomain(e));
  const wix = blocking ? entries.filter((e) => cleanDomain(e) && isProtectedDomain(cleanDomain(e))) : [];
  const problems: string[] = [];
  if (invalid.length) problems.push(`Not a domain: ${invalid.join(', ')}`);
  if (wix.length) problems.push(`Wix domains can't be blocked: ${wix.join(', ')}`);
  if (entries.length > LIMITS.domains) problems.push(`Only the first ${LIMITS.domains} domains are used.`);
  return problems.length ? problems.join('. ') : undefined;
}

const PremiumBadge: FC = () => (
  <Badge size="tiny" skin="premium" prefixIcon={<Icons.PremiumSmall />}>
    Premium
  </Badge>
);

const AdFreeSitePage: FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<PlanState>({ isPremium: false });
  const [settings, setSettings] = useState<BlockerSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState<BlockerSettings>(DEFAULT_SETTINGS);
  // Raw text of the list fields, so typing isn't reformatted mid-word.
  const [blockedText, setBlockedText] = useState('');
  const [allowedText, setAllowedText] = useState('');

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
          dashboard.showToast({ message: 'Could not turn on ad blocking. Please refresh.', type: 'error' });
        }
      }
      setPlan(planState);
      setSettings(effective);
      setSaved(effective);
      setBlockedText(effective.customBlocked.join('\n'));
      setAllowedText(effective.allowed.join('\n'));
      setLoading(false);
    })();
  }, []);

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(saved), [settings, saved]);
  const lockedFeatures = plan.isPremium ? [] : premiumFeaturesUsed(settings);
  const locked = !plan.isPremium;

  const update = <K extends keyof BlockerSettings>(key: K, value: BlockerSettings[K]) =>
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
      const next = applyPlan(settings, plan.isPremium);
      await saveSettings(next, plan.isPremium);
      setSettings(next);
      setSaved(next);
      setBlockedText(next.customBlocked.join('\n'));
      setAllowedText(next.allowed.join('\n'));
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
          <Loader text="Loading AdFree Site..." />
        </Box>
      </WixDesignSystemProvider>
    );
  }

  const blockedProblems = domainProblems(lines(blockedText), true);
  const allowedProblems = domainProblems(lines(allowedText), false);

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="AdFree Site"
          subtitle="Block third-party ads, trackers and pop-ups on your site."
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
                  title="Ad blocking"
                  subtitle="Turn the blocker on or off for your whole site."
                  suffix={
                    <ToggleSwitch checked={settings.enabled} onChange={(e) => update('enabled', e.target.checked)} />
                  }
                />
                <Card.Divider />
                <Card.Content>
                  <Box direction="vertical" gap="SP4">
                    <FormField
                      label="Block ad networks"
                      infoContent="Stops scripts, frames, images and requests from about 50 ad networks, including Google AdSense, Taboola, Outbrain and pop-under networks."
                      labelPlacement="right"
                      stretchContent={false}
                    >
                      <ToggleSwitch checked={settings.blockAds} onChange={(e) => update('blockAds', e.target.checked)} />
                    </FormField>
                    <FormField
                      label="Hide empty ad spaces"
                      infoContent="Hides the boxes blocked ads would have filled, so your pages have no gaps."
                      labelPlacement="right"
                      stretchContent={false}
                    >
                      <ToggleSwitch
                        checked={settings.hideAdSlots}
                        disabled={!settings.blockAds}
                        onChange={(e) => update('hideAdSlots', e.target.checked)}
                      />
                    </FormField>
                    <FormField
                      label="Block ad trackers"
                      suffix={locked ? <PremiumBadge /> : undefined}
                      infoContent="Blocks third-party ad trackers and data brokers. Analytics and marketing tools you connect yourself, like Google Analytics or Meta Pixel, keep working."
                      labelPlacement="right"
                      stretchContent={false}
                    >
                      <ToggleSwitch
                        checked={settings.blockTrackers}
                        disabled={locked}
                        onChange={(e) => update('blockTrackers', e.target.checked)}
                      />
                    </FormField>
                    <FormField
                      label="Block pop-ups"
                      suffix={locked ? <PremiumBadge /> : undefined}
                      infoContent="Blocks windows that open without the visitor clicking. Pop-ups to ad networks are always blocked."
                      labelPlacement="right"
                      stretchContent={false}
                    >
                      <ToggleSwitch
                        checked={settings.blockPopups}
                        disabled={locked}
                        onChange={(e) => update('blockPopups', e.target.checked)}
                      />
                    </FormField>
                  </Box>
                </Card.Content>
              </Card>
            </Cell>

            <Cell span={6}>
              <Card stretchVertically>
                <Card.Header title="Always allow" subtitle="Domains that are never blocked, one per line. Use this for ad partners you work with." />
                <Card.Divider />
                <Card.Content>
                  <FormField status={allowedProblems ? 'warning' : undefined} statusMessage={allowedProblems}>
                    <InputArea
                      rows={5}
                      placeholder={'adpartner.com'}
                      value={allowedText}
                      onChange={(e) => {
                        setAllowedText(e.target.value);
                        update('allowed', lines(e.target.value));
                      }}
                    />
                  </FormField>
                </Card.Content>
              </Card>
            </Cell>

            <Cell span={6}>
              <Card stretchVertically>
                <Card.Header title="Also block" subtitle="Extra domains to block, one per line." suffix={locked ? <PremiumBadge /> : undefined} />
                <Card.Divider />
                <Card.Content>
                  <FormField status={blockedProblems ? 'warning' : undefined} statusMessage={blockedProblems}>
                    <InputArea
                      rows={5}
                      disabled={locked}
                      placeholder={'ads.example.com'}
                      value={blockedText}
                      onChange={(e) => {
                        setBlockedText(e.target.value);
                        update('customBlocked', lines(e.target.value));
                      }}
                    />
                  </FormField>
                </Card.Content>
              </Card>
            </Cell>

            <Cell span={12}>
              <Card>
                <Card.Header
                  title="Pages without blocking"
                  subtitle="Pages where ads load normally, one path per line (e.g. /blog)."
                  suffix={locked ? <PremiumBadge /> : undefined}
                />
                <Card.Divider />
                <Card.Content>
                  <InputArea
                    rows={3}
                    disabled={locked}
                    placeholder={'/sponsors\n/blog'}
                    value={settings.excludedPaths.join('\n')}
                    onChange={(e) => update('excludedPaths', lines(e.target.value))}
                  />
                </Card.Content>
              </Card>
            </Cell>

            <Cell span={12}>
              <SectionHelper appearance="standard" title="What AdFree Site blocks">
                Ads that third-party code adds to your site: custom code, embeds and widgets. It never blocks your
                own domain or Wix itself. Ads inside an "Embed HTML" box run in their own frame, which no site app
                can reach; add that code under Settings → Custom Code instead and it will be blocked.
              </SectionHelper>
            </Cell>

            {!plan.isPremium && (
              <Cell span={12}>
                <SectionHelper appearance="premium" title="Get more with Premium" actionText="Upgrade" onAction={upgrade}>
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

export default AdFreeSitePage;
