import { registerOilExpiry } from "./workshop/upgrades.mjs";
import { WitcherRecipeData } from "./data/witcher-recipe-data.mjs";
import { ACTOR_TYPES, ITEM_TYPES, SYSTEM_ID } from "./config.mjs";
import { applyActorTokenDefaults } from "./combat/token-defaults.mjs";
import { WitcherActorData } from "./data/witcher-actor-data.mjs";
import { WitcherActor } from "./documents/witcher-actor.mjs";
import { WitcherChatMessage } from "./documents/witcher-chat-message.mjs";
import { WitcherCombat } from "./documents/witcher-combat.mjs";
import { registerCriticalDice } from "./dice/critical-chain.mjs";
import { WitcherActorSheet } from "./sheets/witcher-actor-sheet.mjs";
import { WitcherAbilityData } from "./data/witcher-ability-data.mjs";
import { WitcherEquipmentData } from "./data/witcher-equipment-data.mjs";
import { WitcherWeaponData } from "./data/witcher-weapon-data.mjs";
import { WitcherArmorData } from "./data/witcher-armor-data.mjs";
import { WitcherItem } from "./documents/witcher-item.mjs";
import { WitcherReferenceData } from "./data/witcher-reference-data.mjs";
import { WitcherRaceData } from "./data/witcher-race-data.mjs";
import { WitcherOriginData } from "./data/witcher-origin-data.mjs";
import { WitcherFamilyStatusData } from "./data/witcher-family-status-data.mjs";
import { WitcherInfluenceData } from "./data/witcher-influence-data.mjs";
import { registerSheetPreferences } from "./sheets/sheet-preferences.mjs";
import { WitcherItemSheet } from "./sheets/witcher-item-sheet.mjs";
import { WitcherToken } from "./canvas/witcher-token.mjs";
import { renderTokenVisionToggle } from "./combat/token-hud.mjs";
import { migrateVisionDefaults, registerVisionMigration } from "./migrations/vision-defaults.mjs";
import { migrateCompendiumFolders, registerCompendiumFolderMigration } from "./migrations/compendium-folders.mjs";
import { renderDiceTray } from "./chat/dice-tray.mjs";
import { registerStatusEffects, localizeStatusEffects, reportEffectError } from "./combat/status-effects.mjs";
import { prepareResourceUpdate, applyResourceUpdate, prepareInitialResources, applyInitialConditions } from "./combat/resource-updates.mjs";
import { prepareDeathRound, applyDeathRound, syncExistingDeathStates } from "./combat/death-state.mjs";
import { preventIncapacitatedMovement, preventIncapacitatedPositionUpdate } from "./combat/condition-rules.mjs";
import { syncExistingExhaustion } from "./combat/exhaustion.mjs";

Hooks.once("init", async () => {
  await foundry.applications.handlebars.loadTemplates(["profession", "lifepath", "inventory", "structured-fields", "workshop-item", "workshop-actor"].map(name => `systems/${SYSTEM_ID}/templates/${name}.hbs`));
  CONFIG.Token.objectClass = WitcherToken;
  CONFIG.Actor.documentClass = WitcherActor;
  CONFIG.Item.documentClass = WitcherItem;
  CONFIG.ChatMessage.documentClass = WitcherChatMessage;
  CONFIG.Combat.documentClass = WitcherCombat;
  registerCriticalDice();
  CONFIG.Combat.initiative.formula = "1d10wc + @statistics.initiative";
  registerStatusEffects();
  registerOilExpiry();
  CONFIG.time.roundTime = 3;
  registerVisionMigration();
  registerCompendiumFolderMigration();
  registerSheetPreferences();
  for (const type of ACTOR_TYPES) {
    CONFIG.Actor.dataModels[type] = WitcherActorData;
    CONFIG.Actor.trackableAttributes[type] = { bar: ["health", "stamina"], value: [] };
  }
  CONFIG.Item.dataModels.race = WitcherRaceData;
  CONFIG.Item.dataModels.ability = WitcherAbilityData;
  CONFIG.Item.dataModels.profession = WitcherReferenceData;
  CONFIG.Item.dataModels.origin = WitcherOriginData;
  CONFIG.Item.dataModels.familyStatus = WitcherFamilyStatusData;
  CONFIG.Item.dataModels.equipment = WitcherEquipmentData;
  CONFIG.Item.dataModels.weapon = WitcherWeaponData;
  CONFIG.Item.dataModels.armor = WitcherArmorData;
  CONFIG.Item.dataModels.recipe = WitcherRecipeData;
  CONFIG.Item.dataModels.influence = WitcherInfluenceData;
  CONFIG.Item.dataModels.language = WitcherReferenceData;

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor,
    SYSTEM_ID,
    WitcherActorSheet,
    { types: ACTOR_TYPES, makeDefault: true, label: "WITCHER.Sheet.Title" }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Item,
    SYSTEM_ID,
    WitcherItemSheet,
    { types: ITEM_TYPES, makeDefault: true, label: "WITCHER.Sheet.ReferenceTitle" }
  );
});

Hooks.on("preCreateActor", applyActorTokenDefaults);
Hooks.on("preCreateActor", prepareInitialResources);
Hooks.on("createActor", applyInitialConditions);
Hooks.on("preUpdateActor", prepareResourceUpdate);
Hooks.on("updateActor", applyResourceUpdate);
Hooks.on("preUpdateCombat", prepareDeathRound);
Hooks.on("updateCombat", applyDeathRound);
Hooks.on("preMoveToken", preventIncapacitatedMovement);
Hooks.on("preUpdateToken", preventIncapacitatedPositionUpdate);
Hooks.once("i18nInit", localizeStatusEffects);
Hooks.on("renderTokenHUD", renderTokenVisionToggle);
Hooks.on("renderChatInput", renderDiceTray);
Hooks.once("ready", () => {
  syncExistingDeathStates().catch(reportEffectError);
  syncExistingExhaustion().catch(reportEffectError);
  migrateVisionDefaults().catch(error => {
    console.error(`${SYSTEM_ID} | Could not update vision defaults`, error);
    ui.notifications.error(game.i18n.localize("WITCHER.Token.MigrationFailed"));
  });
  migrateCompendiumFolders().catch(error => {
    console.error(`${SYSTEM_ID} | Could not organize compendiums`, error);
    ui.notifications.error(game.i18n.localize("WITCHER.Compendiums.FolderError"));
  });
});
