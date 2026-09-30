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

The theme language follows the visitor's Shopify language (`snippets/site-lang.liquid`): ratelsgroup.com/sv (or ratelsgroup.se, if it serves the store) shows Swedish, and ratelsgroup.com shows English.

- **Homepage, header and footer texts:** every text setting has an English field and a Swedish field (label ends in "(Svenska)") in the theme editor, so this no longer depends on Translate & Adapt translations that are tied to one theme. All current texts and all built-in defaults exist in both languages. An empty Swedish field falls back to the English text.
- **SV | EN switch:** uses Shopify's language form, so it works with a /sv folder or with a separate domain.
- **Product page:** spec labels come from `snippets/spec-label.liquid`, which is generated from the `specs` keys in `locales/en.default.json` and `locales/sv.json`. Values like Yes/No, Petrol and Air-cooled are translated on the Swedish site by `snippets/spec-value.liquid`. Placeholders ("unknown", "- kN") are hidden in both languages.
- **Collection grid and cart:** all texts follow the language. The cart links keep the /sv prefix.
- **Contact page:** the funnelbud form (Swedish or English) follows the language.
- `templates/index.context.se.json` was removed. It swapped the hero title to Swedish for visitors in the Swedish market, even on the English site.

Content stored in Shopify (product titles and descriptions, collection names, menus) comes from Translate & Adapt, which keeps those translations for the whole store rather than per theme.
