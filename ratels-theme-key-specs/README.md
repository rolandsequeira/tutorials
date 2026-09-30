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

# Language: baseline v2 (confirmed working on the live store)

This folder holds the files changed from the 27 Sep export. v2.1 is v2 plus the bilingual cart. Future fixes build on this version.

- **Language:** follows the domain (`snippets/site-lang.liquid`). www.ratelsgroup.se is Swedish, www.ratelsgroup.com is English, and other hosts use the Shopify language.
- **Homepage, header and footer texts:** each text setting has an English field and a "(Svenska)" field, filled in `templates/index.json` and `config/settings_data.json`.
- **SV | EN switch:** links to the same page on the other domain.
- **Product page:** labels come from `snippets/spec-label.liquid`, and values are translated and placeholders hidden by `snippets/spec-value.liquid`.
- **Collection grid, cart and contact form:** follow the language.
- `templates/index.context.se.json` was removed.
