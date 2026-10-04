# General gear — 2026-10-04

Scope: the 60 physical items in RU core p.93: 34 general gear, 11 containers, 10 food/drink and 5 clothing. Twenty-six missing records added; descriptions enriched for the existing 34. Services and lodging are not inventory Items in this block. Descriptions are paraphrased from pp.94–96; table names, prices and weights follow p.93.

## Duplicate and architecture audit

- Reused `equipment`, `kind=gear/container`, `ruleId`, `description`, `properties`, weight, price and capacity. No new Compendium, Item type, Actor field or second inventory.
- Existing `eqip…` IDs retain their order. Musical instrument, sacred symbol and shoulder bag reuse their family/friend records and UUIDs. Their original Lifepath prose/folders remain intact. A sacred symbol does not itself grant the family's Courage bonus.
- `general-gear.mjs` holds structured future action rules keyed by those canonical IDs: conditional skill modifiers, detection/opening/breaking DCs, lighting levels/shapes/distances, occupants, included dice, timers, shackles' Speed cap and alcahest ingestion. UI descriptions and property tooltips share its content. Presentation now handles both tools and general gear, retaining custom properties without repeating stock rules.
- Container capacities have one authority, `CORE_CONTAINERS`; all containers use existing sibling Item references and nesting/weight calculation. Small-object restrictions remain descriptive until a rules-backed object-size model exists. Bow case and sheaths have no book kg capacity: existing capacity=0 displays a dash, with descriptive contents restrictions.
- Kept existing five-candle/five-stake Items as packs, with pack weight/price and explicit wording. Did not silently multiply existing inventories or change the established ammunition-unit system.

## Rules audit

Checked the supplied PDF visually, pp.93–96, after the content block; checked official [Core Errata v4](https://rtalsoriangames.com/wp-content/uploads/2022/03/RTG-WI-WitcherCoreErratav4.pdf), linked from [R. Talsorian errata](https://rtalsoriangames.com/errata/). Its p.93/95 additions (torch, waterskin, one-day trail rations and torch lighting) are already included in this Russian printing and match these records. No fan sources used.

The poker board includes **ten dice**. A normal chest holds 30 kg of small objects, a large chest 50 kg of large objects. Lock DCs are 15/18; cuffs open at 16 or break at 18; shackles open at 20 or break at 22 and cap Speed at 3. Climbing with the hook maps to the existing Athletics skill, with its conditional +2. The map's +3 applies to navigation; warm clothing +5 applies against cold; dark clothing +1 applies when worn. No carrying-only Actor bonuses are generated.

Future automation TODOs: lighting levels are not a guessed conversion into Foundry bright/dim light; cone angle, fuel duration and vessel volume are not invented. Prostheses have no invented numerical restoration. Alcahest retains its specific Endurance DC16 and `(12 - BODY)` intoxication-hours rule; do not substitute the generic poison DC15. Decide treatment of BODY >=12 in the future ingestion workflow before evaluating that duration. These are reference/future-action rules, not newly activated roll or effect automation.

## Compatibility and validation

Content revision 8 appends only missing canonical entries and enriches stock descriptions through Foundry document APIs for pack/world/Actor/unlinked-token Items. Exact old family prose is retained and appended to; custom descriptions/properties, quantities, prices, images, capacities and placement are preserved. `_preCreate` also enriches old stock imports. Migration is idempotent, leaves user-created canonical replacements alone, preserves pack locking and does not open live LevelDB externally. System/package versions remain 0.2.0.

- 188 tests pass, including all table values/identities, source reuse, conditional targets, nested cargo weight, tooltips, pack economics, import, migration retry/idempotence and custom-data preservation.
- Manifest, JS syntax, translations and installed Foundry 14 schemas/strict templates pass: 803 documents total, including 584 equipment documents.
- Native new Actor save/reopen preserves new basket contents, dice rules and clothing description without passive skill gains. Existing compatibility checks still pass.
- Live old Victoria sheet: imported legacy lantern via catalog, saved temporary `QA — Фонарь`, reloaded and reopened; description, properties and details persisted, no system console errors. Initial browser viewport warning was resolved before testing. Temporary item removed, weight returned from 21.5 to the original 20.5 kg; crowns unchanged. Screenshot: `.dev/general-gear-proof.png`.
- Active browser is a player session without Actor creation rights: new-Actor persistence and drag/drop paths were verified in native schema/action tests, not by live pointer dragging. The active GM must reload once for the 26 new pack entries and stock-copy enrichment; other clients reload afterward. Live LevelDB files were neither staged nor rebuilt externally.
