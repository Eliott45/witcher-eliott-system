# Services and establishments — 2026-10-04

## Implemented

Create an Actor of type **Услуги / заведение**, configure its **Настройка** tab and drag it onto a scene like a character. The linked token opens the same establishment sheet. Default Observer access lets players browse without granting editing rights; imported/explicit ownership is preserved. Players select an owned character, quantity and relevant extras, then submit a private request to the GMs. The active GM accepts with payment or rejects through chat or the establishment's order history.

The stock catalogue has 24 entries: 17 services and 7 lodging options. Presets: all services, inn/lodging, medic, craftsman and travel. Applying a preset changes availability only, preserving edited prices/descriptions and custom services. GMs can close the establishment, change its portrait/token art, add custom fixed-price or percentage services, and edit units and descriptions.

## Source audit

Checked the supplied Russian PDF visually: prices on p.93; descriptions and maritime multipliers on p.96; lodging, skill bases, durations and surcharges on p.97. Descriptions are paraphrases. Checked the current official [Core Errata v4](https://rtalsoriangames.com/wp-content/uploads/2022/03/RTG-WI-WitcherCoreErratav4.pdf), linked by [R. Talsorian](https://rtalsoriangames.com/errata/): no service changes for pp.96–97. No fan sources used; no unresolved RAW question required Sage's Answers.

- Critical wounds add 10/25/50/100 crowns per light/medium/severe/deadly wound. Wound counts apply to all selected patients, not again per patient.
- Craftsman's fee adds the supplied diagram's item value per item. For repairs or other negotiated work, that field stays zero and the GM sets the appropriate service price.
- Fence commission is 25% of agreed revenue, not a flat 25 crowns. Selling/transferring items and paying the sale proceeds remain a GM-mediated activity. Only the agreed commission is charged by this workflow.
- Mainland-to-Skellige travel doubles the fare; North–Nilfgaard multiplies it by 1.5. Basic fares/other routes are configurable by the GM.
- Ordinary/good rooms use lock DC15; excellent rooms DC18. Skill bases and durations are reference data, not automatically successful skill checks or elapsed world time.
- Where the table has no explicit time unit, the UI uses a negotiated job/trip/patient. No invented hourly/daily RAW multiplier. Quantities are bounded to 1–100 per request as a UI limit, not a game rule.

## Duplicate and architecture audit

- Existing Item types are physical inventory or character references, and the existing Actor model is a combat character. A dedicated `services` Actor model is justified; no extra Compendium, Item type, inventory, skills or crowns field was introduced.
- The canonical 24-entry data module supplies defaults, presets and source rules. An establishment stores its editable catalogue, while source-specific rules use canonical IDs. Existing skill keys and the doctor's defining ability ID are reused.
- Split the existing Actor-type list into all types and combat types. HP/exhaustion/death initialization, facing decorations and vision migrations continue to target characters/NPCs only. Establishments have no resource bars, vision or combat statistics by default.
- Reused Foundry Actor ownership, token linking, document sheets, private ChatMessages and the existing inventory write queue. No arbitrary client-to-GM socket executor or direct LevelDB writes.
- A ChatMessage is the order record. A paid receipt snapshot is stored alongside the crown debit in the same Actor update specifically for idempotence/recovery; it is not a second editable catalogue or order editor. If chat persistence fails, retry publishes that receipt without charging again. Deleting chat does not erase payment evidence.
- Approval recalculates the quote and validates the current author/character permissions, provider access, enabled/open status, price terms and balance. Changed offers must be resubmitted. One active GM plus per-order and per-character queues prevent duplicate/concurrent local processing. This uses Foundry document updates, not server-side transactional locking against unrelated clients manually editing crowns at the same instant.
- A shared receipt writer covers accepted/rejected/recovered orders and detects cancelled core hooks. HTML from names and player notes is escaped. No automatic HP healing, item creation, travel, skill success, time passage or Luck expenditure.
- Versions remain 0.2.0. Existing actors, Items and Compendium structures require no migration. Live pack databases are not included in the commit.

## Validation and remaining live check

- 199 tests pass, including catalogue identities, presets, costs, decimal crowns, negative/invalid inputs, private requests, permissions, insufficient balances, changed terms, repeat clicks, concurrent orders, rejected/deleted-character orders, failed payments, cancelled hooks and receipt recovery after chat failure.
- Manifest, paths, translations and all JavaScript syntax pass. Installed Foundry 14 native schema/strict-template validation passes, including all 803 existing Compendium documents.
- New service Actor save/reopen preserves modified availability, prices and greeting and does not acquire character HP. GM and player versions of the actual template compile; player markup excludes management controls. Existing character/item persistence regressions still pass.
- Live old Victoria sheet opens after the new client code loads. Resources/inventory remain intact; no new system console errors. An initial Foundry minimum-window-size warning was resolved before checking.
- Browser preview uses the actual sheet template/CSS, with the production quote/search handlers and a lightweight preview host. Visually checked catalogue, GM settings, disclosure rows and quote recalculation; 7 × 8 crowns correctly disables ordering against a 50-crown balance. Preview has no live-world persistence or chat side effects. Screenshots: `.dev/services-store-preview.png`, `.dev/services-settings-preview.png`.
- **Not live-verified:** creating the new Actor and placing/opening its token, plus player→GM approval in the real world. The browser is logged in as a player without Actor creation rights; the GM login is marked active/disabled in another session. That session was not disconnected. Creation/persistence and payment paths are covered by native schema and unit tests instead.
- Foundry needs a restart/relaunch to refresh the system's Actor-type manifest, then clients reload. The remaining GM live check is to create a service Actor, place it on a scene, open as a player and accept/reject a test request.
