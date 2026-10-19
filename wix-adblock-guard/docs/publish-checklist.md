# AdBlock Guard: publish checklist

Every step for getting AdBlock Guard live on the Wix App Market and YouTube,
in the order you'd click through them. Text to paste and files to upload are
given inline, so you shouldn't need to open another document. Files are
relative to `wix-adblock-guard/`.

The YouTube video goes up **first, as Unlisted**, because the Wix listing
asks for its link. It becomes Public once Wix approves the app.

## 0. Have these ready

- [ ] Signed in to the [Wix App Dashboard](https://manage.wix.com/account/custom-apps) as **Coders Creation**
- [ ] Signed in to [YouTube Studio](https://studio.youtube.com) on the channel the video belongs to
- [ ] A support email address
- [ ] A privacy policy URL. It must mention the optional ad-server check (a
      cookieless `HEAD` request to `pagead2.googlesyndication.com` that site
      owners can turn off) and say that no visitor data is collected
- [ ] A terms of use URL
- [ ] A Wix test site, plus a browser with uBlock Origin, and Brave

## 1. Wix: create and release the app

- [ ] **Create New App → Build from scratch**, name: `AdBlock Guard`
- [ ] Copy the app ID into `wix.config.json` (`appId`) and
      `src/shared/constants.ts` (`APP_ID`), then commit
- [ ] **Develop → Permissions**: add **Manage Embedded Scripts**. Check that
      **Read site, business and email details** is there too
- [ ] **Monetize → Pricing plans → Freemium**:

  | Plan | Price | Features to list |
  | --- | --- | --- |
  | Free | $0 | Ad blocker detection (extensions, network, scripts blocked) · Pop-up or bottom bar |
  | **Premium** (name it exactly this) | $3.99/month, or $2.99/month billed yearly | Lock mode · Custom text and colors · Strict mode · Show once per visit · Exclude pages · No branding |

- [ ] Run `npx wix login`, `npm run build`, then `npm run release` (major version)
- [ ] Install on the test site, then check:
  - [ ] uBlock Origin: the pop-up appears
  - [ ] Brave Shields on: the pop-up appears, with Brave instructions
  - [ ] Brave with **Block scripts**: the message still appears
  - [ ] Test purchase of Premium: lock mode and custom colors unlock in the dashboard

## 2. YouTube: upload the demo (Unlisted)

**Create → Upload videos**, file: `marketing/out/adblock-guard-demo.mp4`
(1920×1080, 61 s, no audio).

**Details tab**

| Field | Paste / pick |
| --- | --- |
| Title (59/100 chars) | `Stop Ad Blockers on Your Wix Site: AdBlock Guard (Free App)` |
| Description | the block below |
| Thumbnail | **Upload file** → `marketing/out/youtube-thumbnail.png` (1280×720) |
| Playlists | your Wix apps playlist, if you have one |
| Audience | **No, it's not made for kids** |
| Show more → Altered content | **No** (screen recording of the real app) |
| Show more → Tags (149/500 chars) | the tags line below |
| Show more → Category | **Science & Technology** |
| Show more → Video language | English |

Description:

```
AdBlock Guard detects visitors who use ad blockers on your Wix site and asks
them, politely or firmly, to allow ads, so your free content keeps paying
for itself.

It detects:
• Browser extensions: AdBlock, AdBlock Plus, uBlock Origin
• Brave Shields and DNS blockers like Pi-hole, with step-by-step Shields
  instructions for Brave users
• Browsers that block all scripts (Brave "Block scripts", NoScript): the
  message still appears, with no JavaScript needed. Most detectors miss this.

Free plan: detection, a pop-up or bottom bar, scripts-blocked protection.
Premium: lock mode (content stays hidden until ads are allowed), your own
text and colors, strict mode, show once per visit, excluded pages, no
branding.

Install free from the Wix App Market: search "AdBlock Guard".

Chapters
0:00 Intro and a visitor without an ad blocker
0:12 Ad blocker extensions and Brave Shields
0:22 All scripts blocked, and setting it up in your dashboard
0:45 Lock mode and everything AdBlock Guard detects

#Wix #WixApps #AdBlock
```

These chapter times match the video's scene cuts: extensions start at 0:12,
scripts blocked at 0:22, the dashboard at 0:31, and lock mode at 0:45.
YouTube needs at least 10 s per chapter, which is why scripts blocked and
the dashboard share one chapter.

Tags:

```
wix, wix app, wix app market, adblock detector, ad blocker detector, anti adblock, detect adblock, brave shields, ublock origin, website monetization
```

**Video elements tab**

- [ ] End screen: add a **Subscribe** element and one of your other app
      videos over the outro, which starts at 0:57. Skip this if the channel
      has no other videos yet

**Visibility tab**

- [ ] **Unlisted** → Save, then copy the video link (`https://youtu.be/…`)

**After saving**, post this comment under the video and pin it
(**⋮ → Pin**):

```
Install AdBlock Guard free from the Wix App Market: search "AdBlock Guard" in the Wix App Market. Questions or a blocker it misses? Reply here and we'll take a look.
```

## 3. Wix: fill in the Market listing

App Dashboard → **Market listing**. If a field's counter is shorter than
the text here, use the shorter variant given. These counts are measured, but
Wix changes its limits, so trust the counter in the form.

**Basic info**

| Field | Paste / upload |
| --- | --- |
| App name (13 chars) | `AdBlock Guard` |
| Subtitle, if the form asks (34 chars) | `AdBlock Guard: Ad Blocker Detector` |
| App icon | `marketing/out/icon-256.png` (use `icon-512.png` or `icon-64.png` if the form asks for those sizes) |
| Logo / wordmark, if the form asks | `marketing/out/logo.png` (1400×256) |
| Category | Marketing → Ads, or the closest match |
| Teaser (74 chars) | `Detect ad blockers and win back ad revenue, even when scripts are blocked.` |
| Teaser, ≤ 50 chars (47) | `Detect ad blockers and win back your ad revenue` |
| Teaser, ≤ 40 chars (38) | `Detect ad blockers, recover ad revenue` |
| Pricing label | Free plan available |

**Description**

| Field | Paste |
| --- | --- |
| Short description (207 chars) | `AdBlock Guard detects visitors who use ad blockers and asks them to allow ads on your site. It catches browser extensions, Brave Shields and DNS blockers, and it still works when visitors block every script.` |
| Full description (about 1,300 chars) | section 3 of `docs/app-market-listing.md`. Drop the `>` quote markers, and use the editor's bold for the heading lines |

**Key features**, one per field (title, then text):

1. **Detects all common ad blockers**: Extensions, Brave Shields and DNS blockers.
2. **Works with scripts blocked**: The message shows even without JavaScript.
3. **Polite or firm**: Pop-up, bottom bar, or (Premium) lock the page.
4. **Your brand**: Custom text and colors on Premium.
5. **Instant setup**: Install and protection is on; adjust it from your dashboard.

**Media**: the screenshots are all 1600×900. Upload them in this order:

| # | File | Caption |
| --- | --- | --- |
| 1 | `marketing/out/screenshot-1-popup.png` | A friendly reminder for visitors with an ad blocker |
| 2 | `marketing/out/screenshot-2-scripts-blocked.png` | Still works when visitors block all scripts |
| 3 | `marketing/out/screenshot-3-lock-mode.png` | Premium lock mode with your own text and colors |
| 4 | `marketing/out/screenshot-4-dashboard.png` | Set it up from your Wix dashboard |
| 5 | `marketing/out/screenshot-5-dashboard-free.png` | Everything you need on the free plan |

Video: paste the Unlisted YouTube link from step 2.

**Support and legal**

- [ ] Support email, privacy policy URL, terms of use URL
- [ ] Developer / company info: `Coders Creation` (Wix caps company names
      at 23 characters; this is 15)

## 4. Wix: submit for review

- [ ] Click **Submit for Review**
- [ ] If the reviewer objects to the `ESSENTIAL` script type, change
      `scriptType` to `FUNCTIONAL` in
      `src/site/embedded-scripts/adblock-guard/embedded.json`, then release
      again. Detection will then only run for visitors who accept
      functional cookies
- [ ] Answer any other feedback and resubmit

## 5. After Wix approves

Wix publishes the approved listing with the next app version you release.

- [ ] Release a version if Wix asks (`npm run release`), and confirm that
      the listing is live
- [ ] Copy the App Market link
- [ ] YouTube description: replace
      `Install free from the Wix App Market: search "AdBlock Guard".` with
      `Install free from the Wix App Market: <App Market link>`
- [ ] Pinned comment: replace the search instructions with the link the same way
- [ ] YouTube **Visibility → Public**
- [ ] Check that the listing's video plays (it's the same link, so nothing
      to change in Wix)
