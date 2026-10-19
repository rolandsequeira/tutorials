# AdBlock Guard: Wix App Market listing

Ready-to-paste copy for the App Dashboard **Market listing** page. Wix sets
character limits per field and changes them from time to time; where a field
is shorter than the text here, use the short variant.

## 1. Basics

| Field | Value |
| --- | --- |
| App name | **AdBlock Guard** (subtitle, if asked: **AdBlock Guard: Ad Blocker Detector**) |
| Developer | Coders Creation |
| Category | Marketing → Ads (or the closest match Wix offers) |
| Teaser | Detect ad blockers and win back ad revenue, even when scripts are blocked. |
| Short teaser (≤ 50 chars) | Detect ad blockers, recover ad revenue |
| Pricing label | Free plan available |
| App icon | `marketing/out/icon-256.png` (also `icon-512.png`, `icon-64.png`) |
| Logo / wordmark | `marketing/out/logo.png` |
| Video | the YouTube link (see `docs/youtube.md`) |
| Support email, privacy policy URL, terms of use URL | required; use the same ones as your other Coders Creation apps |

## 2. Short description

> AdBlock Guard detects visitors who use ad blockers and asks them to allow
> ads on your site. It catches browser extensions, Brave Shields and DNS
> blockers, and it still works when visitors block every script.

## 3. Full description

> **Your content is free because of ads. Ad blockers hide them.**
> AdBlock Guard detects visitors who block ads and asks them to allow ads on
> your site, with a friendly pop-up, a bar at the bottom, or (Premium) a lock
> that keeps your content hidden until ads are allowed.
>
> **Detects every common way of blocking ads**
> • Browser extensions: AdBlock, AdBlock Plus, uBlock Origin
> • Network blocking: Brave Shields, uBlock, and DNS blockers like Pi-hole
> • Brave users get step-by-step instructions to turn Shields off for your site
> • Visitors who block all scripts (Brave "Block scripts", NoScript) still see
>   your message. It needs no JavaScript, so it works where most detectors fail.
>
> **Free plan**
> • Detection of extensions, network blockers and blocked scripts
> • Dismissible pop-up or bottom bar
>
> **Premium**
> • Lock mode: content stays hidden until ads are allowed
> • Your own title, message, button labels and colors
> • Strict mode: shows the message even if a blocker targets the app itself
> • Show once per visit, exclude pages, remove "Protected by AdBlock Guard"
>
> **Fast and private**
> Everything runs inside your site, with nothing loaded from outside
> servers. The only external request is an optional check against a public
> ad server, which you can turn off. No visitor data is collected or stored.

## 4. Key features (benefit bullets)

1. **Detects all common ad blockers.** Extensions, Brave Shields and DNS blockers.
2. **Works with scripts blocked.** The message shows even without JavaScript.
3. **Polite or firm.** Pop-up, bottom bar, or (Premium) lock the page.
4. **Your brand.** Custom text and colors on Premium.
5. **Instant setup.** Install and protection is on; adjust it from your dashboard.

## 5. Plans (Monetize → Pricing plans, Freemium)

| Plan | Price (suggested) | Includes |
| --- | --- | --- |
| Free | $0 | Detection (extensions, network, scripts blocked), pop-up or bar |
| Premium | $3.99/month, or $2.99/month billed yearly | Lock mode, custom text and colors, strict mode, once per visit, excluded pages, no branding |

Name the paid plan exactly **Premium**. The app treats any paid plan as
Premium, so monthly and yearly versions both work.

## 6. Screenshots (in this order, 1600×900)

| File | Caption |
| --- | --- |
| `marketing/out/screenshot-1-popup.png` | A friendly reminder for visitors with an ad blocker |
| `marketing/out/screenshot-2-scripts-blocked.png` | Still works when visitors block all scripts |
| `marketing/out/screenshot-3-lock-mode.png` | Premium lock mode with your own text and colors |
| `marketing/out/screenshot-4-dashboard.png` | Set it up from your Wix dashboard |
| `marketing/out/screenshot-5-dashboard-free.png` | Everything you need on the free plan |

## 7. Wording guardrails

- Don't promise it's unbeatable: the README's Limits section explains why
  no client-side detector is.
- "No visitor data collected" is accurate: the script stores only a
  "dismissed" flag in the visitor's own browser session. Mention the optional
  ad-server check in your privacy policy.
