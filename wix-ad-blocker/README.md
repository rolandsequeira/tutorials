# AdFree Site for Wix

A Wix app that blocks third-party ads on the site owner's own Wix site: ad
scripts, ad frames, tracking pixels, ad requests and pop-unders that come in
through custom code, embeds and third-party widgets. It has a free plan and a
Premium plan you sell through the Wix App Market.

It's the counterpart of AdBlock Guard (`wix-adblock-guard/` on the
`claude/beautiful-wright-prab89` branch), which *detects* visitors' ad blockers. The project setup, settings encoding, plan rules and
browser test harness follow that app.

## How it blocks

A single inline script, injected into `<head>` so it runs before the ad code:

| How the ad code loads | What happens | Test |
| --- | --- | --- |
| `script.src = …`, `iframe.src = …`, `new Image().src = …` | Property guard: the URL is never set | `free plan: every ad request is blocked` |
| `setAttribute('src', …)` | Attribute guard | same |
| `innerHTML` / `insertAdjacentHTML` with an ad iframe | HTML is cleaned before it's parsed, so nothing loads | same |
| `<script src>` in the page's HTML | Script is disabled and removed before it runs (see Limits) | same, `ran` assertion |
| `fetch`, `XMLHttpRequest`, `navigator.sendBeacon` | Fails the way it does under a browser ad blocker | same |
| `window.open` to an ad network | Blocked | `pop-ups: …` |
| `window.open` without a click (Premium) | Blocked; pop-ups the visitor clicks for still open | `pop-ups: …` |

The ad list (~50 networks, including AdSense/Google Ad Manager, Amazon, Taboola,
Outbrain, MGID and pop-under networks) and the tracker list live in
`embedded.html`, so each app release updates them on every site.

**It never blocks** the site's own domain or Wix's infrastructure (`wix.com`,
`wixstatic.com`, `parastorage.com`, …). That's enforced twice, in the dashboard
(`normalizeSettings`) and again in the site script, and covered by a test that
feeds the script a tampered config. So the app can't break a site, and it can't
be used to hide Wix's own free-plan branding, which would break Wix's terms.

The tracker list deliberately leaves out tools owners connect themselves
(Google Analytics, Meta Pixel, Hotjar), so turning it on doesn't break their
marketing setup.

## Plans

| | Free | Premium |
| --- | --- | --- |
| Block ad networks (scripts, frames, pixels, requests) | ✓ | ✓ |
| Hide empty ad spaces | ✓ | ✓ |
| Always block pop-ups to ad networks | ✓ | ✓ |
| Allow list (keep your own ad partner) | ✓ | ✓ |
| Block third-party ad trackers | | ✓ |
| Block pop-ups that open without a click | | ✓ |
| Your own block list | | ✓ |
| Pages without blocking | | ✓ |

The allow list is free on purpose: an owner must always be able to unblock an
ad partner they're paid by. The plan is enforced when settings are written
(`applyPlan` in `src/shared/config.ts`), so a free site never receives premium
settings.

## Project layout

```
src/
  site/embedded-scripts/ad-blocker/
    embedded.html     # the blocker, injected into <head> on every page
    embedded.json     # Wix extension config (ESSENTIAL script, HEAD)
  dashboard/pages/
    page.tsx          # settings page in the site owner's dashboard
  shared/
    config.ts         # settings, plan rules, domain cleaning, parameter encoding
    constants.ts      # APP_ID (set this) and the embedded script ID
test/                 # unit + real-Chromium tests
```

The dashboard saves settings with `embeddedScripts.embedScript()` as the
script's dynamic parameter, so the app needs no backend or database.

## Develop

```bash
npm install
npm test            # 20 tests: settings + blocker in real Chromium
npm run typecheck
npm run build       # needs a real appId in wix.config.json
```

The browser tests load a demo recipe page that carries the usual ad code
(AdSense tag, a GPT-style loader, an Outbrain widget via `innerHTML`, a
tracking pixel, bid requests, a beacon, pop-ups), record every request that
reaches the network and every script that runs, and check them with and
without the app.

## Publish to the Wix App Market

Do these steps signed in to the [Wix App Dashboard](https://manage.wix.com/account/custom-apps)
with the account that will own the app.

1. **Create the app.** Click **Create New App**, choose **Build from scratch**,
   and name it "AdFree Site".
2. **Connect this project.** Copy the new app's ID into `wix.config.json`
   (`appId`) and `src/shared/constants.ts` (`APP_ID`). Then run
   `npx wix login` and `npm run dev` to try it on a test site.
3. **Permissions.** Under **Develop → Permissions**, add **Manage Embedded
   Scripts** (for `embedScript` / `getEmbeddedScript`). **Read site, business
   and email details** is usually included by default; it's needed for
   `getAppInstance`.
4. **Pricing.** Under **Monetize → Pricing plans**, choose **Freemium**. Add a
   free plan and one paid plan named "Premium", with monthly and yearly prices.
   Match the feature list to the table above.
5. **Release a version.** Run `npm run build`, then `npm run release`, and pick
   a major version.
6. **Test the whole flow** on a test site: install, add an AdSense snippet
   under **Settings → Custom Code**, check that no ads load, upgrade with a
   test purchase, and try the Premium options.
7. **App Market listing.** Under **Market listing**, fill in a teaser (e.g.
   "Keep third-party ads, trackers and pop-ups off your site."), a
   description based on the tables above, screenshots of the dashboard and a
   before/after of a page, and the required support email, privacy policy URL
   and terms of use URL.
8. **Submit for review.** Wix reviews apps before they go live.

### Notes for Wix review

- The script is `ESSENTIAL` and placed in `HEAD` so it runs before ad code and
  before cookie consent. It collects nothing and sends no requests of its own.
  If a reviewer objects, change `scriptType` to `FUNCTIONAL` in
  `embedded.json`; blocking then only applies to visitors who accept
  functional cookies.
- Premium settings stay active after a downgrade until the owner next opens
  the dashboard, which re-applies the plan. To close that gap, add a backend
  event handler for `appInstances.onAppInstancePaidPlanChanged` that calls the
  same `applyPlan` + `embedScript`.

## Limits

- **`<script src>` tags written directly in the page's HTML** are still
  *requested*, because the browser's preload scanner fetches them before any
  JavaScript runs. Their code never runs. Ad code added from JavaScript, which
  is how nearly all ad loaders work, is never requested at all.
- **"Embed HTML" boxes** run their content in a separate frame on another
  domain, which no site app can reach. Ads placed there aren't blocked; the
  dashboard tells owners to move such code to **Settings → Custom Code**.
- **Wix's own ads** on free Wix plans are never touched (see above).
- **New ad networks** need to be added to the list in `embedded.html` and
  released. Owners can block them sooner with the Premium block list.
