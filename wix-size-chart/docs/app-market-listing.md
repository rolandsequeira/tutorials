# FitChart: Wix App Market listing

Ready-to-paste copy for the Wix Dev Center **App Market listing** page, plus plan setup and assets.
Wix sets character limits on each field and changes them from time to time. If a field is shorter than the text here, use the shorter variant given.

---

## 1. Basics

| Field | Value |
|---|---|
| App name | **FitChart: Size Chart & Guide** (short: **FitChart**) |
| Developer | Coders Creation |
| Category | eCommerce → Store tools / Product page (or the closest match Wix offers) |
| Teaser / tagline | Add a "Size guide" pop-up with size charts to your product pages. |
| Short tagline (≤ 50 chars) | Size charts & size guide pop-up for Wix Stores |
| Pricing label | Free plan available |
| Requires | Wix Stores |
| Support email | support@coderscreation.com |
| Privacy policy | https://coderscreation.com/fitchart/privacy *(required; outline in §7)* |
| Terms of use | https://coderscreation.com/fitchart/terms |
| Website | Your FitChart landing page (`LANDING_URL`) |
| Icon | `docs/media/icon-512.png` (source: `public/brand/fitchart-icon.svg`) |
| Video | The YouTube link of `docs/media/fitchart-demo.mp4` (see `docs/youtube.md`) |

---

## 2. Short description (intro paragraph)

> FitChart adds a "Size guide" link next to the size option on your product pages. One click opens a clean size chart made for that product: clothing, shoes, gloves, kids' wear or anything else. Shoppers can switch between cm and inches, see how to measure, and pick the right size the first time.

**Shorter variant (≈ 160 chars):**
> A "Size guide" link next to the size dropdown that opens the right size chart for each product, with cm/inch switch and how-to-measure pictures.

---

## 3. Full description

> **Help shoppers pick the right size the first time**
>
> Wrong sizes are one of the most common reasons for returns in fashion, shoes and sportswear. FitChart puts a clear size chart one click away, right where shoppers choose their size.
>
> **On your product pages**
> • A "Size guide" link or button right under the size options, above "Add to Cart" or under the product name
> • Opens a clean size chart in a pop-up or side panel, as a bottom sheet on phones
> • cm ↔ inches and kg ↔ lb switch, and the shopper's choice is remembered (Pro)
> • A "how to measure" picture and note under each chart (picture: Pro)
> • Matches your store's colors, works with keyboards and screen readers
>
> **The right chart for every product**
> • Ready-made templates: women's and men's clothing, shoes (EU / UK / US), gloves, boxing gloves, kids, pants & jeans
> • Show a chart on all products, on chosen categories, on products whose name contains a keyword (like "glove" or "shoe"), or on specific products
> • Up to 50 charts (Pro). The most specific match wins.
>
> **Easy to manage**
> • Edit the table like a spreadsheet, or paste it straight from Excel or Google Sheets
> • Live preview while you edit
> • See how many shoppers open the size guide
>
> Wix runs app scripts only on published Premium sites with a connected domain.

---

## 4. Key features (short bullets for the "Features" / benefits section)

1. **Size guide on every product page.** A link right next to the size options opens the chart in one click.
2. **The right chart for each product.** Assign charts by category, keyword or product.
3. **cm / inch switch.** Shoppers see sizes in the units they know (Pro).
4. **Templates and spreadsheet paste.** Get started in a minute with clothing, shoe and glove charts.
5. **How-to-measure pictures.** Show shoppers exactly where to measure (Pro).

---

## 5. Plans and pricing (Dev Center → Pricing)

Wix bills per site and pays you after its revenue share. These plans match `src/plans.js`. Put the Wix plan IDs into `WIX_PLAN_MAP`.

| | **Free** | **Pro** |
|---|---|---|
| Suggested price | $0 | **$4.99/mo** or **$49/yr** |
| "Size guide" link + pop-up / side panel | ✓ | ✓ |
| Templates, table editor, spreadsheet paste | ✓ | ✓ |
| Size charts | 1 | 50 |
| Show on categories, keywords or products | ✓ | ✓ |
| cm ↔ inch and kg ↔ lb switch | | ✓ |
| How-to-measure images | | ✓ |
| Remove "Powered by FitChart" | | ✓ |
| Shopper numbers | 7 days | 90 days |

Suggested **plan descriptions** for the Wix pricing page:
- **Free.** One size chart with a "Size guide" link on your product pages.
- **Pro.** Up to 50 charts, a cm/inch switch, how-to-measure images and no branding.

Pricing notes:
- Size chart apps on the Wix App Market and other store platforms mostly cost $3–$10 a month. $4.99 keeps you in that range. Check current competitors before you set the final price.
- One chart is enough for a single-category store, but most fashion and sports stores need several charts (tops, bottoms, shoes, gloves). That makes "several charts" the main reason to upgrade.
- Yearly at about 2 months free pushes average revenue up and churn down.

---

## 6. Screenshot captions (`docs/media/`, 1280×800)

1. `1-link.png`: "A Size guide link right next to the size options"
2. `2-popup-cm.png`: "A clear size chart without leaving the product"
3. `3-popup-inches.png`: "Shoppers switch between cm and inches"
4. `4-image.png`: "Show shoppers how to measure"
5. `5-dashboard.png`: "See how many shoppers use the size guide"
6. `6-editor.png`: "Edit charts like a spreadsheet, with a live preview"
7. `7-mobile.png`: "Made for phones"

To retake them, run the app with `npm run dev` and use `/demo` and `/dashboard?instanceId=dev-site-0001&plan=pro`.

---

## 7. Privacy policy: what it must say

- **Shoppers:** the app sets no cookies. It stores the unit choice (cm or inches) in the shopper's browser and counts link views, opens and unit switches once per visit as daily totals, with no IP addresses or visitor IDs.
- **Site owners:** the Wix site ID, site URL and plan come from Wix. Charts, settings and uploaded images are stored on Coders Creation's server, and product names and category IDs are cached for up to 6 hours to pick the right chart.
- **Server logs:** the web server's access logs record IP addresses. Say how long you keep them (for example 14 days).
- **Retention after uninstall:** say how long you keep data (for example 30 days). *To do before launch:* the app only marks a site as removed, so add a scheduled job that deletes its data and images after that period.
- **GDPR:** hosting location (your VPS region), subprocessors (hosting provider), and a contact for data deletion.

---

## 8. FAQ for the listing

**Where does the Size guide link appear?**
Under the product's size option by default. You can move it above "Add to Cart" or under the product name, or choose your own spot with a CSS selector.

**Can I use different charts for different products?**
Yes. Assign each chart to categories, to products whose name contains a keyword, or to specific products. The free plan includes one chart, and Pro includes up to 50.

**Do I have to type my chart again?**
No. Copy it from Excel or Google Sheets and paste it into the editor. You can also start from a template.

**Can shoppers see inches?**
Yes, on Pro. Enter your chart in cm and kg, and FitChart converts it to inches and pounds.

**Why don't I see the link on my site?**
Wix runs app scripts only on published sites with a Premium plan and a connected domain. Publish your site after installing. The link shows on product pages that match one of your charts.

**Does it slow down my store?**
No. The script is small, loads after your page, and caches each chart.

**How do I cancel?**
Downgrade or uninstall from your Wix dashboard at any time. Billing is handled by Wix.
