# KFB Management on Squarespace

Paste-ready version of the KFB Management one-page site.

| File | Where it goes |
| --- | --- |
| `1-code-block.html` | One Code Block on the home page (styles, page content and form script in one paste) |
| `2-page-header-code-injection.html` | That page's Header Code Injection (hides Squarespace's own header/footer and makes the block full width) |
| `images/` | The 8 photos to upload to Squarespace |
| `preview.html` | Local preview only, do not paste |

Custom JavaScript and code injection need a **Core plan or higher**. On the Personal plan the page still shows, but the form script won't run.

## 1. Create the site
1. Go to squarespace.com → **Get Started** → choose any template (a minimal one is easiest) → name the site **KFB Management**.
2. **Pages** → open the Home page and delete the template's sections, leaving one blank section.

## 2. Upload the images
1. **Website → Pages → Custom Code → Custom CSS** (older menus: **Design → Custom CSS**).
2. Click **Custom Files → Add images or fonts** and upload the 8 files in `images/`.
3. Click each uploaded file. Squarespace inserts its URL (`https://static1.squarespace.com/...`) into the CSS box. Copy it, then **delete it from the CSS box** and don't save CSS.
4. In `1-code-block.html`, replace each placeholder with its URL:

| Placeholder | Image |
| --- | --- |
| `PASTE-URL-FOR-hero-office.jpg` | Hero |
| `PASTE-URL-FOR-portrait.jpg` | Karim Farag portrait |
| `PASTE-URL-FOR-service-strategy.jpg` | Service card 1 |
| `PASTE-URL-FOR-service-partnerships.jpg` | Service card 2 |
| `PASTE-URL-FOR-service-revenue.jpg` | Service card 3 |
| `PASTE-URL-FOR-service-building.jpg` | Service card 4 |
| `PASTE-URL-FOR-mountains.jpg` | Approach background |
| `PASTE-URL-FOR-facade.jpg` | "Let's talk" background |

## 3. Add the page
1. Edit the Home page → **Add Block → Code**. Stretch the block across the full width of the section.
2. Set the block to **HTML**, turn **Display Source** off, and paste all of `1-code-block.html`.
3. Page **⚙ Settings → Advanced → Page Header Code Injection** → paste `2-page-header-code-injection.html`.
4. Save. Code blocks show "Script disabled" in the editor. Check the live site in a private window.

## 4. SEO and settings
- Page Settings → **SEO**: title `KFB Management | Strategy, Partnerships & Growth Advisory`; description `KFB Management helps businesses develop growth strategies, build strategic partnerships, and execute commercial opportunities. Led by Karim Farag.`
- **Settings → Browser icon**: upload a KFB favicon.
- Hide the page title if the template shows one.

## 5. Before launch
- **LinkedIn:** in `1-code-block.html`, replace `https://www.linkedin.com/` with Karim's profile URL.
- **Form:** right now the form opens the visitor's email app addressed to kfbizdev@gmail.com. To have submissions sent straight to the inbox, create a free form at formspree.io and set `var FORM_ENDPOINT = "https://formspree.io/f/xxxx";` near the bottom of the file.
- Replace the portrait with a final photo of Karim when you have one.
- **Settings → Domains**: connect or buy the domain, then publish the site.
