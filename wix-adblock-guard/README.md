# AdBlock Guard for Wix

A Wix app that detects ad blockers and asks visitors to allow ads. It has a
free plan and a Premium plan you sell through the Wix App Market.

Unlike detectors that load their logic from a third-party server, AdBlock Guard
is entirely inline. It also keeps working when the visitor blocks **all**
scripts, the "Failed in Brave" case from competitor reviews:

| How the visitor blocks | What happens |
| --- | --- |
| Element hiding (AdBlock, AdBlock Plus, uBlock Origin) | Bait element is hidden → detected |
| Ad requests blocked (Brave Shields, uBlock, Pi-hole/DNS) | Ad-server probe fails → detected; Brave users get Shields instructions |
| **All scripts blocked** (Brave "Block scripts", NoScript, uBlock "no scripting") | `<noscript>` fallback shows the message with no JavaScript (free plan) |
| Only this app's script killed, rest of the page runs | Strict mode fails closed: the message appears unless the detector clears it (Premium) |

All four rows are covered by browser tests in `test/browser.test.ts`.

## Plans

| | Free | Premium |
| --- | --- | --- |
| Detection (element hiding and network) | ✓ | ✓ |
| Pop-up or bottom bar, dismissible | ✓ | ✓ |
| Scripts-blocked protection | ✓ | ✓ |
| Lock the page until ads are allowed | | ✓ |
| Custom title, message, buttons, colors | | ✓ |
| Strict mode (fail closed) | | ✓ |
| Once per visit, exclude pages | | ✓ |
| Remove "Protected by AdBlock Guard" | | ✓ |

The plan is enforced when settings are written (`applyPlan` in
`src/shared/config.ts`), so a free site never receives premium settings. Any
paid plan counts as Premium, so you can offer monthly and yearly versions of it.

## Project layout

```
src/
  site/embedded-scripts/adblock-guard/
    embedded.html     # the detector, injected into every page of the site
    embedded.json     # Wix extension config (ESSENTIAL script, end of <body>)
  dashboard/pages/
    page.tsx          # settings page in the site owner's dashboard
  shared/
    config.ts         # settings, plan rules, parameter encoding
    constants.ts      # APP_ID (set this) and the embedded script ID
test/                 # unit + real-Chromium tests
scripts/record-demo.ts  # records the demo video
```

The dashboard saves settings with `embeddedScripts.embedScript()` as the
script's dynamic parameters, so the app needs no backend or database.

## Develop

```bash
npm install
npm test            # 22 tests: settings + detector in real Chromium
npm run typecheck
npm run demo-video  # writes demo-output/adblock-guard-demo.webm
```

## Publish to the Wix App Market

You have to do these steps signed in as **Coders Creation** in the
[Wix App Dashboard](https://manage.wix.com/account/custom-apps).

1. **Create the app.** In the App Dashboard, click **Create New App**, choose
   **Build from scratch**, and name it "AdBlock Guard".
2. **Connect this project.** Copy the new app's ID into `wix.config.json`
   (`appId`) and `src/shared/constants.ts` (`APP_ID`). Then run
   `npx wix login` and `npm run dev` to try it on a test site.
3. **Permissions.** Under **Develop → Permissions**, add **Manage Embedded
   Scripts** (needed for `embedScript` / `getEmbeddedScript`). **Read site,
   business and email details** is usually included by default; it's needed
   for `getAppInstance`.
4. **Pricing.** Under **Monetize → Pricing plans**, choose **Freemium**. Add a
   free plan and one paid plan named "Premium", with monthly and yearly prices
   (e.g. $3.99/month, $2.99/month billed yearly). Match the feature list to
   the table above.
5. **Release a version.** Run `npm run build`, then `npm run release`, and pick
   a major version.
6. **Test the whole flow** on a test site: install from the dashboard,
   upgrade with a test purchase, then check with uBlock Origin, Brave Shields
   and Brave "Block scripts".
7. **App Market listing.** Under **Market listing**, fill in:
   - **Teaser:** "Detect ad blockers and win back ad revenue, even when scripts are blocked."
   - **Description:** the "How the visitor blocks" table above, in prose.
   - **Screenshots:** frames from the demo video (pop-up, scripts-blocked
     message, lock mode) plus a screenshot of the dashboard settings page.
   - **Video:** the YouTube link once it's uploaded (see `docs/youtube.md`).
   - **Support email**, **privacy policy URL** and **terms of use URL** (all required).
8. **Submit for review.** Click **Submit for Review**. Wix reviews apps
   before they go live. Address any feedback, then the listing appears under
   your developer page.

### Notes for Wix review

- The script type is `ESSENTIAL` so it runs before cookie consent. If a
  reviewer objects, change `scriptType` to `FUNCTIONAL` in `embedded.json`.
  Detection then only runs for visitors who accept functional cookies.
- The optional network probe sends a `HEAD` request to
  `pagead2.googlesyndication.com` without cookies. Site owners can turn it off
  in the dashboard. Mention it in your privacy policy.
- Premium settings stay active after a downgrade until the owner next opens
  the dashboard, which re-applies the plan. To close that gap, add a backend
  event handler for `appInstances.onAppInstancePaidPlanChanged` that calls the
  same `applyPlan` + `embedScript`.

## Limits

No client-side detector is unbeatable. A determined user can write a custom
filter for this app's fallback classes or use a "cosmetic filter killer". The
layers above cover all default configurations of the common blockers, plus the
scripts-blocked case most detectors miss.
