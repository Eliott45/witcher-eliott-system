import { ACTOR_TYPES, SYSTEM_ID } from "./config.mjs";
import { applyActorTokenDefaults } from "./combat/token-defaults.mjs";
import { WitcherActorData } from "./data/witcher-actor-data.mjs";
import { WitcherActorSheet } from "./sheets/witcher-actor-sheet.mjs";

Hooks.once("init", () => {
  for (const type of ACTOR_TYPES) {
    CONFIG.Actor.dataModels[type] = WitcherActorData;
    CONFIG.Actor.trackableAttributes[type] = { bar: ["health", "stamina"], value: [] };
  }

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor,
    SYSTEM_ID,
    WitcherActorSheet,
    { types: ACTOR_TYPES, makeDefault: true, label: "WITCHER.Sheet.Title" }
  );
});

Hooks.on("preCreateActor", applyActorTokenDefaults);
