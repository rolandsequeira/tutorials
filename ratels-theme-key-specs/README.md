# Ratels theme: key specs by category

The collection grid cards and the product page "Key Attributes" card show different key specs depending on the machine category.

| Category | Key specs | Metafields used (the first one that has a value wins) |
|---|---|---|
| Loaders | Operating Weight • Lift Capacity • Engine Power • Hydraulic Flow | `operating_weight` • `rated_load_capacity`/`tipping_load` • `engine_power` • `hydraulic_flow`/`maximum_auxiliary_flow` |
| Excavators | Operating Weight • Engine Power • Digging Depth • Digging Reach | `operating_weight` • `engine_power` • `digging_depth` • `digging_reach` |
| Electric Machines | Operating Weight • Battery Capacity • Working Time • Power kW | `operating_weight` • `battery_capacity`/`usable_battery_capacity` • `runtime_normal_duty`/`runtime_light_duty`/`runtime_heavy_duty` • `drive_motor_power_continuous`/`drive_motor_power_peak`/`engine_power` |
| Attachments | Weight • Working Width • Hydraulic Flow | `weight`/`operating_weight` • `working_width`/`standard_bucket_width`/`overall_width` • `required_hydraulic_flow`/`hydraulic_flow` |
| Forestry & Agriculture | Operating Weight • Load Capacity • Engine Power • Crane Reach / PTO | `operating_weight` • `rated_load_capacity`/`load_capacity` • `engine_power` • `crane_reach`/`pto_power`/`pto_speed` |
| Other | Operating Weight • Load Capacity • Engine Power | `operating_weight` • `rated_load_capacity`/`load_capacity` • `engine_power` |

All metafields are in the `custom` namespace.

## How the category is chosen

1. `custom.spec_group` metafield, if set (`loaders`, `excavators`, `electric`, `attachments`, `forestry`, `other`)
2. The collection being browsed, matched by handle (for example `lastmaskiner`, `gravmaskiner`, `elektriska-maskiner`, `redskap`, `skogsbruk-lantbruk`, `annat`)
3. Product type (Loader, Skid-steer, Crawler/Wheel Excavator, Electric Machine, Tractor, Timber Forwarder, ...)
4. The product's own collections
5. Otherwise: Other

## Files

- `snippets/machine-key-specs.liquid` (new): the category logic, labels (EN/SV) and value clean-up
- `sections/main-collection-product-grid.liquid`: the card uses the snippet and gets a `machinery-product-card--<group>` class
- `sections/main-product-machinery.liquid`: the category key specs appear as tiles at the top of the Key Attributes card, followed by the other flagged attributes (duplicates removed)
- `assets/component-machinery-product.css`: tile styles

# Swedish and English without mixing

The full theme (`ratels-theme-full-sv-en.zip`) is the 27 Sep export with these changes. The homepage keeps the export's sections, order and category tiles.

- **Language:** the theme follows the visitor's Shopify language (`snippets/site-lang.liquid`). ratelsgroup.com/sv (or ratelsgroup.se, if it serves the store) is Swedish, and ratelsgroup.com is English.
- **Homepage, header and footer texts:** each text setting has a "(Svenska)" field, and all current texts are filled in in both languages.
  - An empty Swedish field falls back to `snippets/sv-auto.liquid`, a phrase list of the site's texts.
  - On the English site, Swedish text typed into an English field goes through `snippets/en-auto.liquid`.
- **SV | EN switch:** uses Shopify's language form.
- **Product page:** labels come from `snippets/spec-label.liquid` (generated from the locale files). Values are translated and placeholders hidden by `snippets/spec-value.liquid`.
- **Collection grid and cart:** bilingual. The cart links keep the /sv prefix.
- **Contact page:** the funnelbud form follows the language.
- `templates/index.context.se.json` was removed. It swapped the hero title to Swedish for Swedish-market visitors, even on the English site.

Product and collection texts and menus come from Translate & Adapt, which keeps those translations for the whole store rather than per theme.
