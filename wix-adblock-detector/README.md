# AdBlock Notice for Wix

A self-hosted Wix App Market app in the same category as "Adblocker Scanner". It detects visitors who use an
ad blocker and shows them a notice the site owner can configure. It has three parts:

1. **Visitor script** (`public/notice.js`, ~17 KB, no dependencies). Wix injects it on every page as an embedded script.
2. **Settings page**, shown inside the Wix dashboard in an iframe, with a live preview and visitor numbers.
3. **Backend** (Node 22 + Express + SQLite). It handles Wix auth, webhooks and billing, and serves the notice config.

The Wix plumbing (signed instance, webhooks, embedding the script, plan sync) is the same code as
`../wix-accessibility-app`, so both apps behave the same way in Wix.

---

## Features

| Area | What it does | Plan |
|---|---|---|
| **Detection** | Two checks run together: a bait element with class names that filter lists hide (`adsbox`, `ad-banner`…), and a `HEAD` request to `adsbygoogle.js`, which network filters block. Either one counts. Nothing from Google is executed. Works with uBlock Origin, AdBlock / AdBlock Plus, AdGuard, Brave Shields and Firefox strict tracking protection. | Free |
| **Notice styles** | Pop-up in the middle, banner at the top or banner at the bottom | Free |
| **Ask politely** | Visitors can close the notice ("Continue anyway", ×, or Escape). The owner picks how often it comes back: every page, once per visit, once a day or once a week. | Free |
| **Block content** | A full-screen, blurred wall with only the reload button. Page scrolling is locked, and the wall comes back if something removes it from the page. | Pro |
| **Text & colors** | Title, message, both button labels, background/text/accent colors, overlay darkness, delay before showing | Free |
| **Skip pages** | Paths where the script doesn't check (for example `/checkout`) | Pro |
| **Branding** | "Powered by" line under the notice; Pro can hide it | Free / Pro |
| **Visitor numbers** | Visits checked, % with an ad blocker, notices shown, visitors who turned their blocker off after the notice, and a daily chart. Each event counts once per visit. | 7 days Free, 90 days Pro |
| **Preview on my site** | The settings page links to `https://<site>/?sn-preview=1`, which shows the notice even without an ad blocker | Free |

Accessibility: the pop-up is a labelled `role="dialog"` with a focus trap, focus goes to the reload button, Escape closes it
(when closing is allowed), and animations respect `prefers-reduced-motion`.

### Staying unblocked

Anti-adblock scripts are themselves a target for filter lists ("anti-adblock killer" and annoyance lists), so:

- Nothing the visitor downloads has "ad", "adblock", "detect" or similar in its name: `/notice.js`, `/api/v1/config`, `/api/v1/ping`.
- The notice is drawn inside a closed shadow root with a random host id, so generic cosmetic filters can't hide it.
- **Pick a neutral hostname** for `BASE_URL`, such as `notice.yourdomain.com` or `cdn.yourdomain.com`. Don't use `adblock.…`.
- If the app gets popular, some lists may add your hostname anyway. The fix is a second hostname pointing at the same server;
  update the embedded script URL in the Dev Center.

No detection is perfect. Some blockers, and some privacy browsers, allow the bait through; the notice then simply doesn't show.

---

## Layout

- `public/notice.js` holds the visitor script: detection, the notice, dismissal memory and the per-visit counters. Without a `data-instance` attribute it only exposes `window.SiteNotice` (`detect`, `render`, `run`), which the settings preview uses.
- `public/dashboard/` is the settings page (plain HTML/CSS/JS).
- `public/demo.html` is a test page, served at `/demo` in `DEV_MODE` only.
- `src/server.js` wires up the routes. `src/routes/public.js` is what the visitor script calls, `src/routes/dashboard.js` is the settings API and `src/routes/webhooks.js` receives Wix events.
- `src/plans.js` holds the plans, default settings and the settings validator. The server enforces the plan, so a downgraded site stops getting Pro options right away.
- `src/wix.js` and `src/sites.js` handle Wix auth, the embed call and plan sync.

---

## Run locally

```bash
cd wix-adblock-detector
npm install
npm test          # 6 integration tests
npm run dev       # DEV_MODE=1 on http://localhost:8080
```

- Test page: http://localhost:8080/demo. Turn your ad blocker on and off and reload. It prints what each check found.
- Settings page without Wix: http://localhost:8080/dashboard?instanceId=dev-site-0001 (add `&plan=pro` for the Pro options)

The config is cached in the browser for 5 minutes, so open a new private window to see a change straight away.
`DEV_MODE` accepts unsigned dashboard requests. **Never enable it in production.**

---

## Deploy to your VPS

Requirements: a VPS with Docker and a DNS A record pointing at it (for example `notice.yourdomain.com`).

```bash
git clone <this repo> && cd <repo>/wix-adblock-detector
cp .env.example .env          # fill it in (see the next section); BASE_URL=https://notice.yourdomain.com
DOMAIN=notice.yourdomain.com docker compose -f deploy/docker-compose.yml up -d --build
curl https://notice.yourdomain.com/healthz   # {"ok":true}
```

Caddy gets the HTTPS certificate automatically, and SQLite data lives in the `appdata` volume. Add `deploy/backup.sh` to cron
for nightly backups.

**Running it next to LumAccess on the same VPS:** only one Caddy can own ports 80 and 443. Run this app's `app` service on its
own and add a site block to the existing Caddyfile instead:

```
notice.yourdomain.com {
	reverse_proxy <this app's container or host:port>
}
```

---

## Wix Dev Center setup (step by step)

1. Go to **dev.wix.com → Create New App**, then choose to build a self-hosted app on your own server.
2. **OAuth**: copy the **App ID** and **App Secret** into `WIX_APP_ID` and `WIX_APP_SECRET`. The server uses the client-credentials flow (`POST https://www.wixapis.com/oauth2/token` with `instance_id`), so there is no redirect install flow to host.
3. **Permissions**: add the scopes the App Instance API and Embedded Scripts API need. The Dev Center lists them next to each API, typically "Manage Embedded Scripts" and read access to the app instance/site.
4. **Extensions → Embedded Script**:
   - Type: *Functional* (not *Advertising* or *Analytics*: those categories are held back by cookie-consent banners, and this script sets no cookies). Placement: *Body end*. Load once on all pages.
   - HTML template (the `{{instanceId}}` parameter is filled in by the server at install):
     ```html
     <script src="https://notice.yourdomain.com/notice.js" data-instance="{{instanceId}}" defer></script>
     ```
   - Declare the dynamic parameter `instanceId`. The server activates the script with `POST /apps/v1/scripts` and `{"properties":{"parameters":{"instanceId":"…"}}}`.
   - Settings changes don't need a new embed: the script reads its config from the server on each page load.
5. **Extensions → Dashboard Page**: set the iframe URL to `https://notice.yourdomain.com/dashboard`. Wix appends `?instance=<signed>`, which the server verifies with your App Secret.
6. **Webhooks**: set the callback URL to `https://notice.yourdomain.com/webhooks/wix` and subscribe to *App Installed*, *App Removed*, *Paid Plan Purchased*, *Paid Plan Changed*, *Paid Plan Auto Renewal Cancelled*, *Plan Converted To Paid*, *Plan Reactivated* and *Plan Transferred*. Copy the **public key** into `WIX_PUBLIC_KEY` (`\n` for newlines is fine).
7. **Pricing**: create a Free plan and a Pro plan (monthly and/or yearly). Map the Pro plan (vendor product) IDs:
   ```
   WIX_PLAN_MAP={"<pro-monthly-id>":"pro","<pro-yearly-id>":"pro"}
   ```
   The "Upgrade" button links to `https://www.wix.com/apps/upgrade/<APP_ID>?appInstanceId=<id>`.
8. **Test**: install the app on a test site with a Premium plan and connected domain (Wix only runs embedded scripts on those) and publish it. Open the site with an ad blocker on and confirm the notice appears, then open it with `?sn-preview=1` and the blocker off. Buy Pro with Wix's test billing and confirm "Block content" unlocks.
9. **App Market listing**: add screenshots (pop-up, banner, block wall, settings page), the privacy policy URL, the support email and translated descriptions, then submit for review. Say in the listing that the app stores no personal data: the counters are per-day totals with no IP, cookie or visitor ID.

Wix changes Dev Center menu names from time to time. If a label differs, look for the matching setting. The API endpoints above are the ones the code calls.

---

## Privacy

The visitor script sets no cookies. It uses `sessionStorage` to count each event once per visit and to remember a
dismissal for the visit, and `localStorage` for the once-a-day / once-a-week options. The server stores only per-site,
per-day counts, with no IP addresses or page URLs. Caddy's access log (`deploy/Caddyfile`) does include IPs; delete its
`log` block if you don't want them.
