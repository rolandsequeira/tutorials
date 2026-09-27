# Wix Accessibility App (self-hosted)

A complete, sellable accessibility app for the Wix App Market, in the same category as
"All in One Accessibility", UserWay and accessiBe. It has three parts:

1. **Visitor widget** (`public/widget.js`, ~95 KB unminified, no dependencies). Wix injects it on every page of the site.
2. **Owner dashboard**, shown inside the Wix dashboard in an iframe. Owners use it for settings, reports, AI alt text, analytics, an accessibility statement and upgrades.
3. **Backend** (Node 22 + Express + SQLite). It handles Wix auth, webhooks and billing, widget config, AI alt text, audits and analytics, and runs on your VPS.

> Working name: **"A11y Toolkit"**. Set `APP_NAME` to your own name. Do not reuse a competitor's name or branding.

---

## Features

### For visitors (widget)

| Area | Features | Plan |
|---|---|---|
| **10 one-click profiles** | Seizure safe, vision impaired, ADHD, cognitive, keyboard navigation, blind users, dyslexia, older adults, motor impaired, color blind | Free |
| **Content** | Text size 80–200% (scales each element, so it works with Wix's px-based typography), content scaling 80–150% (zooms the whole layout), line height, letter spacing, word spacing, text alignment, readable font (Atkinson Hyperlegible), dyslexia font (OpenDyslexic, self-hosted), highlight titles and links, text magnifier | Free |
| **Color** | Dark, light and high contrast, inverted colors, low and high saturation, monochrome. These use a `backdrop-filter` overlay, so Wix's fixed headers keep working. Color-blindness correction for protanopia, deuteranopia, tritanopia and achromatopsia. Smart contrast darkens or lightens only the text that fails WCAG contrast. | Free |
| **Color** | Custom text, title and background colors | Pro |
| **Orientation** | Big cursor (black or white), reading guide, reading mask, stop animations (also pauses video), hide images, mute sounds, highlight focus, highlight hover, image descriptions on hover, keyboard shortcuts (Alt+H/L/F/B/G/M/D/T/I), page structure panel (headings, landmarks, links), read mode (distraction-free text view) | Free |
| **Assistive tools** | Text to speech on hover/focus (3 speeds, voice picker; Ctrl+/ to start, Ctrl+K to pause, and shortcuts are spoken aloud), read page aloud with highlighting, voice navigation ("scroll down", "show numbers", "click 3", "click contact", …), talk & type (dictate into form fields), virtual keyboard (works with Wix/React inputs), dictionary (double-click a word or search), Brazilian Sign Language (VLibras, opt-in by the owner) | Pro |
| **Auto-fixes** | AI alt text, names for icon-only links/buttons (Facebook, Instagram, mailto, tel…), form labels, iframe titles, page `lang`, "opens in new tab" notice, skip-to-content link, re-enabling pinch-zoom | Pro |
| **UI** | 15 languages including RTL Arabic and Hebrew, Alt+A hotkey, `#accessibility` links open the menu, remembers visitor choices, light/dark panel, oversize panel option, visitors can move the widget to the other side, "Report a problem" form, fully keyboard and screen-reader operable (dialog, focus trap, `aria-pressed`, live announcements) | Free |

### For site owners (dashboard)

- Customize button position, offsets, icon, desktop and mobile icon size, colors, panel theme, default language, and hide on mobile or hide the button entirely.
- Turn individual features on or off and reorder the menu (Pro), set the accessibility statement URL, and optionally send events to Google Analytics 4 or Adobe Analytics.
- **Accessibility report.** The widget samples about 10% of real page views, at most once per page every 6 hours, and checks 14 WCAG rules: alt text, link and button names, labels, lang, title, zoom, frame titles, tabindex, autoplay, H1, heading order, main landmark and color contrast. Free owners see scores and counts. Paid owners see each issue with sample elements, WCAG references, how to fix it in the Wix editor, and how many issues were auto-fixed. This is the main upsell.
- **Documents check.** PDFs linked from the site are downloaded (only from Wix or the site's own domain) and checked for tags, language and title. Free owners see counts. Paid owners see which files need re-exporting.
- **AI alt text manager.** Review and edit every generated description, mark images as decorative, and see usage against the monthly quota.
- **Visitor reports inbox.** Problems visitors send with "Report a problem", with the page, the features they had on, a reply-by-email button and resolve/reopen.
- **PDF export** of the accessibility report (print → Save as PDF).
- **Visitor analytics.** Menu opens per day, most-used features and profiles, estimated page views.
- **Accessibility statement generator.**
- Removing the "Powered by" branding (Pro). White label with your own brand name and link, custom CSS, and excluding paths such as `/checkout` (Business).

### Plans (edit `src/plans.js`)

| | Free | Pro | Business |
|---|---|---|---|
| All free adjustments + profiles | ✓ | ✓ | ✓ |
| Assistive tools (TTS, voice navigation, talk & type, keyboard, dictionary, sign language, custom colors) | | ✓ | ✓ |
| Auto-fixes | | ✓ | ✓ |
| AI alt text / month | 0 | 1,000 | 10,000 |
| Detailed WCAG report | counts only | ✓ | ✓ |
| Remove branding | | ✓ | ✓ |
| Reorder menu | | ✓ | ✓ |
| White label (your brand in the widget) | | | ✓ |
| Custom CSS, excluded paths | | | ✓ |
| Analytics history | 7 days | 90 days | 365 days |

**Suggested prices** (Wix bills per site): Pro **$9.99/mo or $99/yr**, Business **$24.99/mo or $249/yr**.
Wix charges the customer and pays you, minus its revenue share (check the current terms in the Dev Center).
A generous Free plan brings installs and reviews. The report and AI alt text give owners a reason to upgrade.

---

## Architecture

```
Visitor browser ──(1) <script src=https://YOUR_DOMAIN/widget.js data-instance=…>──► your VPS
    │  (2) GET /api/widget/config?i=<instanceId>       (cached 5 min)
    │  (3) POST /api/widget/alt-text | /audit | /events
    ▼
Wix dashboard ── iframe /dashboard?instance=<signed> ── /api/dashboard/* (HMAC-verified)
Wix platform  ── POST /webhooks/wix (RS256 JWT)  ── install, uninstall, plan purchase/change/cancel
Your VPS      ── wixapis.com: OAuth token, embed script, App Instance (billing = plan source of truth)
              ── Claude API: alt text for queued images (background worker, cached per image)
```

- `src/wix.js` handles signed-instance verification, webhook JWT verification and the Wix REST client.
- `src/sites.js` handles install, embed and plan sync. On every billing webhook it re-reads the plan from Wix instead of trusting event order, and it re-syncs all paid sites nightly.
- `src/alttext.js` holds the Claude integration, image URL allowlist (Wix CDN or the site's own domain only) and queue worker.
- `src/plans.js` defines plans, default settings and the settings validator.
- `widget/src/*.js` is the widget source. `npm run build` concatenates it into `public/widget.js`.
- `scripts/i18n-source.py` holds the widget translations and writes `public/i18n/*.json`.

---

## Run locally

```bash
cd wix-accessibility-app
npm install
npm test                      # builds the widget and runs 9 integration tests
npm run dev                   # DEV_MODE=1 on http://localhost:8080
```

- Demo site with deliberate accessibility bugs: http://localhost:8080/demo
- Dashboard without Wix: http://localhost:8080/dashboard?instanceId=dev-site-0001&plan=pro (`&plan=` for Free)

`DEV_MODE` accepts unsigned dashboard requests. **Never enable it in production.**

---

## Deploy to your VPS

Requirements: a VPS with Docker and a DNS A record pointing at it (for example `a11y.yourdomain.com`).

```bash
git clone <this repo> && cd <repo>/wix-accessibility-app
cp .env.example .env          # fill it in (see the next section); BASE_URL=https://a11y.yourdomain.com
DOMAIN=a11y.yourdomain.com docker compose -f deploy/docker-compose.yml up -d --build
curl https://a11y.yourdomain.com/healthz   # {"ok":true}
```

Caddy gets the HTTPS certificate automatically. SQLite data lives in the `appdata` volume.
Add `deploy/backup.sh` to cron for nightly backups, and copy the `backups/` folder off the server.

Sizing: config responses are cached in browsers for 5 minutes and in session storage, and page-view analytics are sampled at 10%. A 1 vCPU / 1 GB VPS handles thousands of sites. For more headroom, put a CDN such as Cloudflare in front of `/widget.js`, `/fonts/*` and `/i18n/*`.

---

## Wix Dev Center setup (step by step)

1. Go to **dev.wix.com → Create New App**, then choose to build a self-hosted app on your own server.
2. **OAuth**: copy the **App ID** and **App Secret** into `WIX_APP_ID` and `WIX_APP_SECRET`. The server uses the client-credentials flow (`POST https://www.wixapis.com/oauth2/token` with `instance_id`), so there is no redirect install flow to host.
3. **Permissions**: add the scopes the App Instance API and Embedded Scripts API need. The Dev Center lists them next to each API, typically "Manage Embedded Scripts" and read access to the app instance/site.
4. **Extensions → Embedded Script**:
   - Type: *Functional*. Placement: *Body end*. Load once on all pages.
   - HTML template (the `{{instanceId}}` parameter is filled in by the server at install):
     ```html
     <script src="https://a11y.yourdomain.com/widget.js" data-instance="{{instanceId}}" defer></script>
     ```
   - Declare the dynamic parameter `instanceId`. The server activates the script with `POST /apps/v1/scripts` and `{"properties":{"parameters":{"instanceId":"…"}}}`.
5. **Extensions → Dashboard Page**: set the iframe URL to `https://a11y.yourdomain.com/dashboard`. Wix appends `?instance=<signed>`, which the server verifies with your App Secret.
6. **Webhooks**: set the callback URL to `https://a11y.yourdomain.com/webhooks/wix` and subscribe to *App Installed*, *App Removed*, *Paid Plan Purchased*, *Paid Plan Changed*, *Paid Plan Auto Renewal Cancelled*, *Plan Converted To Paid*, *Plan Reactivated* and *Plan Transferred*. Copy the **public key** into `WIX_PUBLIC_KEY` (`\n` for newlines is fine).
7. **Pricing**: create a Free plan plus paid plans (for example Pro monthly/yearly and Business monthly/yearly). Map their plan (vendor product) IDs to internal plans:
   ```
   WIX_PLAN_MAP={"<pro-plan-id>":"pro","<business-plan-id>":"business"}
   ```
   The "Upgrade" buttons link to `https://www.wix.com/apps/upgrade/<APP_ID>?appInstanceId=<id>`.
8. **Test**: install the app on a test site with a Premium plan and connected domain (Wix only runs embedded scripts on those), publish the site, and confirm the button appears. Then buy a plan with Wix's test billing and confirm the dashboard switches to Pro.
9. **App Market listing**: add screenshots (the panel, a contrast mode, the report), a short video, the privacy policy URL, the support email and translated descriptions, then submit for review.

Wix changes Dev Center menu names from time to time. If a label differs, look for the matching setting. The API endpoints above are the ones the code calls.

---

## AI alt text costs

The worker calls Claude (`ALT_TEXT_MODEL`, default `claude-opus-5`, low effort, with server-side refusal fallback). Each image is described **once** and cached. Size variants of the same Wix image share one row, so a site mostly pays once for its images.

Rough cost is about $0.01 per image on Opus 5 (about 1.5k image tokens in at $5 per million tokens, plus a short answer). Filling the full Pro quota of 1,000 images in one month would cost about $10, the same as the Pro price.
You can:
- set `ALT_TEXT_MODEL=claude-haiku-4-5` (roughly 5× cheaper, still good at short captions);
- lower `aiAltTextPerMonth` in `src/plans.js`;
- or price Pro higher.

Measure on real images before choosing. Without `ANTHROPIC_API_KEY`, images stay "in progress" and nothing is charged.

---

## Important: selling accessibility honestly

- **Do not promise "ADA/WCAG compliance" or lawsuit protection.** A widget cannot make an inaccessible site compliant. In 2025 the US FTC fined an overlay vendor $1M over exactly those claims, and disability advocates actively criticize overlays. Market the app as *assistive tools + automatic fixes + a report that shows what to fix*. This app is built that way: the report shows the underlying issues, and the dashboard tells owners to fix them in the editor.
- Keep the accessibility statement template accurate. It lists measures and known limitations and claims no conformance.
- Privacy: the widget sets no cookies. It uses localStorage for visitor preferences and sends anonymous counters, audit results and image URLs to your server. Say so in your privacy policy. Voice navigation uses the browser's speech recognition, which may send audio to the browser vendor, and only starts after the visitor clicks it.

## Known limitations and next steps

- Public widget endpoints are keyed by instance ID, which is visible in page source. Someone could send fake analytics or spend a site's AI quota with Wix CDN image URLs. Per-IP and per-site rate limits and the image-host allowlist limit this. Add origin checks against the site domain if abuse appears.
- Voice commands are English. The widget UI is translated into 15 languages.
- Sign language uses the free VLibras service (Brazil, Portuguese only). It loads a script from vlibras.gov.br and couldn't be tested from the build environment.
- The PDF check looks for tags, language and title. It is not a full PDF/UA validation.
- Not built (the competitor sells these): live translation of the whole site into 140+ languages (possible with an AI translation cache, but it has a real per-page cost), and human services (manual audits, VPAT/ACR reports, remediation). You can offer the services yourself.
- The dictionary uses dictionaryapi.dev for English and links to Wiktionary for other languages.
- The report covers common automated checks, not a full audit. Consider adding axe-core for Business.
- Possible next steps: Wix Blocks/CLI version, agency multi-site billing, email reports, sign-language widget.
