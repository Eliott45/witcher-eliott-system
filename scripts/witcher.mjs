import { WitcherSpellData } from "./data/witcher-spell-data.mjs";
import { WitcherEffectItemData } from "./data/witcher-effect-item-data.mjs";
import { registerEffectExpiry } from "./combat/effect-expiry.mjs";
import { registerSystemSettings,applyLoadedLanguage,ensureSystemLanguage } from "./settings.mjs";
import { registerSettingsLayout } from "./settings-layout.mjs";
import { WitcherTokenLayer } from "./canvas/witcher-token-layer.mjs";
import { registerManualCriticalChat } from "./chat/manual-critical.mjs";
import { migrateBestiaryContent,migrateBestiaryCreatures,migrateBestiaryJournalCreatures,registerBestiaryMigration } from "./migrations/bestiary-content.mjs";
import { migrateBestiaryCorrections } from "./migrations/bestiary-corrections.mjs";
import { migrateBestiaryAutomation } from "./migrations/bestiary-automation.mjs";
import { migratePregenContent,registerPregenMigration } from "./migrations/pregen-content.mjs";
import { registerWeaponChat } from "./combat/weapon-rolls.mjs";
import { registerGroupAmbush } from "./chat/group-ambush.mjs";
import { registerCharacterCreation } from "./sheets/character-creation-window.mjs";
import { migrateMacroContent } from "./migrations/macro-content.mjs";
import { registerCombatTactics } from "./combat/combat-tactics.mjs";
import { WitcherPowerPlaceData } from "./data/witcher-power-place-data.mjs";
import { WitcherPowerPlaceSheet } from "./sheets/witcher-power-place-sheet.mjs";
import { WitcherLootData } from "./data/witcher-loot-data.mjs";
import { WitcherLootSheet } from "./sheets/witcher-loot-sheet.mjs";
import { registerLoot } from "./loot/loot.mjs";
import { registerSpellContentMigration,migrateSpellContent } from "./migrations/spell-content.mjs";
import { registerOilExpiry } from "./workshop/upgrades.mjs";
import { registerConsumption } from "./workshop/consumption.mjs";
import { registerForaging } from "./chat/foraging.mjs";
import { registerTraining } from "./sheets/training-window.mjs";
import { registerPersonalBelongings } from "./sheets/personal-belongings-window.mjs";
import { registerDimeritiumResistance } from "./magic/dimeritium.mjs";
import { migratePoisonEffects } from "./migrations/poison-effects.mjs";
import { registerCriticalWoundHooks } from "./combat/critical-wound-effects.mjs";
import { registerHealingRequests } from "./combat/healing.mjs";
import { registerBrawling } from "./combat/brawling.mjs";
import { registerEnvironment } from "./combat/environment.mjs";
import { registerRadolfLight } from "./combat/radolf-light.mjs";
import { registerRadolfMarbles } from "./combat/radolf-marbles.mjs";
import { registerBombs } from "./combat/bombs.mjs";
import { registerSpellStrikes } from "./magic/spell-strikes.mjs";
import { registerSpellAreas } from "./magic/spell-areas.mjs";
import { registerSpellEffects } from "./magic/spell-effects.mjs";
import { registerCadfan } from "./magic/cadfan.mjs";
import { registerMagicFumble } from "./magic/magic-fumble.mjs";
import { registerWitcherElixirs } from "./workshop/witcher-elixirs.mjs";
import { registerVerbalDuel } from "./combat/verbal-duel.mjs";
import { migrateEffectContent, registerEffectContentMigration } from "./migrations/effect-content.mjs";
import { registerEffectDurationChat } from "./chat/effect-duration.mjs";
import { registerStubbornnessChat } from "./chat/stubbornness.mjs";
import { registerRollBreakdown } from "./chat/roll-breakdown.mjs";
import { registerRelicLore } from "./sheets/relic-lore.mjs";
import { registerExperimentalDevices } from "./combat/experimental-traps.mjs";
import { registerAdrenaline } from "./combat/adrenaline.mjs";
import { registerExperimentalAmmunition } from "./combat/experimental-ammunition.mjs";
import { registerAttackExchange } from "./combat/attack-exchange.mjs";
import { registerCreatureSpirits } from "./combat/creature-spirits.mjs";
import { registerHagActions } from "./combat/hag-actions.mjs";
import { registerCreatureActions } from "./combat/creature-actions.mjs";
import { registerCreatureModes } from "./combat/creature-modes.mjs";
import { registerTokenEffectsPanel } from "./canvas/token-effects-panel.mjs";
import { registerCombatEffects } from "./canvas/fx/combat-effects.mjs";
import { registerMovementEffects } from "./combat/movement-effects.mjs";
import { registerQuickDraw } from "./combat/quick-draw.mjs";
import { registerGroupInitiative } from "./combat/group-initiative.mjs";
import { registerGrapple } from "./combat/grapple.mjs";
import { registerConcealedDice } from "./chat/concealment.mjs";
import { registerDebugDice } from "./dice/debug-dice.mjs";
import { WitcherRecipeData } from "./data/witcher-recipe-data.mjs";
import { COMBAT_ACTOR_TYPES, ITEM_TYPES, SYSTEM_ID, ROUND_SECONDS, INITIATIVE_FORMULA } from "./config.mjs";
import { WitcherServicesData } from "./data/witcher-services-data.mjs";
import { WitcherServicesSheet } from "./sheets/witcher-services-sheet.mjs";
import { registerServiceOrders } from "./services/orders.mjs";
import { applyActorTokenDefaults } from "./combat/token-defaults.mjs";
import { WitcherActorData } from "./data/witcher-actor-data.mjs";
import { WitcherActor } from "./documents/witcher-actor.mjs";
import { WitcherActiveEffect } from "./documents/witcher-active-effect.mjs";
import { registerConditionSaves } from "./combat/condition-saves.mjs";
import { WitcherChatMessage } from "./documents/witcher-chat-message.mjs";
import { WitcherCombat } from "./documents/witcher-combat.mjs";
import { registerCriticalDice } from "./dice/critical-chain.mjs";
import { WitcherActorSheet } from "./sheets/witcher-actor-sheet.mjs";
import { WitcherNPCSheet } from "./sheets/witcher-npc-sheet.mjs";
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
import { registerVisorVision } from "./canvas/visor-vision.mjs";
import { renderTokenVisionToggle, renderScatterToggle } from "./combat/token-hud.mjs";
import { migrateVisionDefaults, registerVisionMigration } from "./migrations/vision-defaults.mjs";
import { migrateCompendiumFolders, registerCompendiumFolderMigration } from "./migrations/compendium-folders.mjs";
import { migrateEquipmentContent, registerEquipmentContentMigration } from "./migrations/equipment-content.mjs";
import { migrateSharedEquipment, registerSharedEquipmentMigration } from "./migrations/shared-equipment.mjs";
import { renderDiceTray } from "./chat/dice-tray.mjs";
import { registerStatusEffects, localizeStatusEffects, reportEffectError, registerUniqueStatuses, removeExistingDuplicateStatuses } from "./combat/status-effects.mjs";
import { prepareResourceUpdate, applyResourceUpdate, prepareInitialResources, applyInitialConditions } from "./combat/resource-updates.mjs";
import { prepareDeathRound, applyDeathRound, syncExistingDeathStates } from "./combat/death-state.mjs";
import { preventIncapacitatedMovement, preventIncapacitatedPositionUpdate } from "./combat/condition-rules.mjs";
import { syncExistingExhaustion } from "./combat/exhaustion.mjs";
import { migrateBookReferences, registerBookReferencesMigration } from "./migrations/book-references.mjs";

Hooks.once("init", async () => {
  registerSystemSettings();
  registerSettingsLayout();
  registerManualCriticalChat();
  const templatesReady = foundry.applications.handlebars.loadTemplates(["ambush-card", "combat-actions", "verbal-duel", "effects-list", "learning", "magic", "magic-filters", "magic-spells", "magic-requirements", "profession", "profession-tree", "profession-node", "advancement-controls", "lifepath", "lifepath-entry", "inventory", "inventory-row", "transport", "structured-fields", "workshop-item", "item-reference", "recipe-details", "workshop-actor", "npc-loot", "crafting", "alchemy", "recipe-card"].map(name => `systems/${SYSTEM_ID}/templates/${name}.hbs`));
  CONFIG.Token.objectClass = WitcherToken;
  CONFIG.Canvas.layers.tokens.layerClass = WitcherTokenLayer;
  CONFIG.Actor.documentClass = WitcherActor;
  CONFIG.ActiveEffect.documentClass = WitcherActiveEffect;
  CONFIG.Item.documentClass = WitcherItem;
  CONFIG.ChatMessage.documentClass = WitcherChatMessage;
  CONFIG.Combat.documentClass = WitcherCombat;
  registerCriticalDice();
  registerWeaponChat();
  registerCombatTactics();
  registerGroupAmbush();
  registerCharacterCreation();
  registerForaging();
  registerTraining();
  registerPersonalBelongings();
  registerDimeritiumResistance();
  CONFIG.Combat.initiative.formula = INITIATIVE_FORMULA;
  registerStatusEffects();
  registerUniqueStatuses();
  registerCriticalWoundHooks();
  registerHealingRequests();
  registerBrawling();
  registerEnvironment();
  registerRadolfLight();
  registerRadolfMarbles();
  registerBombs();
  registerSpellStrikes();
  registerSpellAreas();
  registerSpellEffects();
  registerCadfan();
  registerMagicFumble();
  registerWitcherElixirs();
  registerVerbalDuel();
  registerConditionSaves();
  registerEffectExpiry();
  registerOilExpiry();
  registerConsumption();
  registerStubbornnessChat();
  registerRollBreakdown();
  registerAttackExchange();
  registerExperimentalAmmunition();
  registerRelicLore();
  registerExperimentalDevices();
  registerAdrenaline();
  registerCreatureSpirits();
  registerHagActions();
  registerCreatureActions();
  registerCreatureModes();
  registerTokenEffectsPanel();
  registerCombatEffects();
  registerMovementEffects();
  registerQuickDraw();
  registerGroupInitiative();
  registerGrapple();
  registerConcealedDice();
  registerDebugDice();
  registerLoot();
  registerEffectDurationChat();
  registerServiceOrders();
  CONFIG.time.roundTime = ROUND_SECONDS;
  registerVisionMigration();
  registerVisorVision();
  registerCompendiumFolderMigration();
  registerEquipmentContentMigration();
  registerSharedEquipmentMigration();
  registerEffectContentMigration();
  registerSpellContentMigration();
  registerBestiaryMigration();
  registerPregenMigration();
  registerBookReferencesMigration();
  registerSheetPreferences();
  for (const type of COMBAT_ACTOR_TYPES) {
    CONFIG.Actor.dataModels[type] = WitcherActorData;
    CONFIG.Actor.trackableAttributes[type] = { bar: ["health", "stamina"], value: [] };
  }
  CONFIG.Actor.dataModels.services = WitcherServicesData;
  CONFIG.Actor.dataModels.powerPlace = WitcherPowerPlaceData;
  CONFIG.Actor.trackableAttributes.powerPlace = { bar: [], value: [] };
  CONFIG.Actor.dataModels.loot = WitcherLootData;
  CONFIG.Actor.trackableAttributes.loot = { bar: [], value: [] };
  CONFIG.Actor.trackableAttributes.services = { bar: [], value: [] };
  CONFIG.Item.dataModels.race = WitcherRaceData;
  CONFIG.Item.dataModels.ability = WitcherAbilityData;
  CONFIG.Item.dataModels.profession = WitcherReferenceData;
  CONFIG.Item.dataModels.origin = WitcherOriginData;
  CONFIG.Item.dataModels.familyStatus = WitcherFamilyStatusData;
  CONFIG.Item.dataModels.equipment = WitcherEquipmentData;
  CONFIG.Item.dataModels.weapon = WitcherWeaponData;
  CONFIG.Item.dataModels.armor = WitcherArmorData;
  CONFIG.Item.dataModels.recipe = WitcherRecipeData;
  CONFIG.Item.dataModels.spell = WitcherSpellData;
  CONFIG.Item.dataModels.effect = WitcherEffectItemData;
  CONFIG.Item.dataModels.influence = WitcherInfluenceData;
  CONFIG.Item.dataModels.language = WitcherReferenceData;

  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor,
    SYSTEM_ID,
    WitcherActorSheet,
    { types: COMBAT_ACTOR_TYPES, makeDefault: true, label: "WITCHER.Sheet.Title" }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor,
    SYSTEM_ID,
    WitcherServicesSheet,
    { types: ["services"], makeDefault: true, label: "TYPES.Actor.services" }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Item,
    SYSTEM_ID,
    WitcherItemSheet,
    { types: ITEM_TYPES, makeDefault: true, label: "WITCHER.Sheet.ReferenceTitle" }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(foundry.documents.Actor,SYSTEM_ID,WitcherNPCSheet,
    {types:["npc"],makeDefault:true,label:"Лист существа"});
  foundry.applications.apps.DocumentSheetConfig.registerSheet(foundry.documents.Actor,SYSTEM_ID,WitcherPowerPlaceSheet,
    {types:["powerPlace"],makeDefault:true,label:"TYPES.Actor.powerPlace"});
  foundry.applications.apps.DocumentSheetConfig.registerSheet(foundry.documents.Actor,SYSTEM_ID,WitcherLootSheet,
    {types:["loot"],makeDefault:true,label:"TYPES.Actor.loot"});
  await templatesReady;
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
Hooks.once("i18nInit", () => {applyLoadedLanguage();localizeStatusEffects();});
Hooks.on("renderTokenHUD", renderTokenVisionToggle);
Hooks.on("renderTokenHUD", renderScatterToggle);
Hooks.on("renderChatInput", renderDiceTray);
// Action availability and per-round usage follow the tracker. Refresh without Actor writes.
Hooks.on("updateCombat", (_combat,changes) => {
  if (!("round" in changes) && !("turn" in changes)) return;
  for (const app of foundry.applications.instances.values()) {
    if ((app instanceof WitcherActorSheet || app instanceof WitcherNPCSheet) && app.rendered) app.render({force:false});
  }
});
Hooks.once("ready", async () => {
  await ensureSystemLanguage();localizeStatusEffects();
  await migrateMacroContent().catch(error=>console.error(`${SYSTEM_ID} | Macro content`,error));
  await migrateEffectContent().catch(error=>{console.error(`${SYSTEM_ID} | Effect compendium`,error);ui.notifications.error("Не удалось добавить критические ранения в компендиум эффектов. Подробности в консоли.");});
  await migratePoisonEffects().catch(error=>{console.error(`${SYSTEM_ID} | Poison effects`,error);ui.notifications.error("Не удалось обновить эффекты отравления. Подробности в консоли.");});
  // Vision and equipment migrations both repair the pregen pack; do not race its lock.
  await migrateVisionDefaults().catch(error => {
    console.error(`${SYSTEM_ID} | Could not update vision defaults`, error);
    ui.notifications.error(game.i18n.localize("WITCHER.Token.MigrationFailed"));
  });
  await migrateBestiaryContent().then(migrateBestiaryCreatures).then(migrateBestiaryCorrections).then(migrateBestiaryAutomation).then(migrateBestiaryJournalCreatures).catch(error=>{console.error(`${SYSTEM_ID} | Bestiary content`,error);ui.notifications.error("Не удалось обновить содержимое бестиария. Подробности в консоли.");});
  await migrateSpellContent().catch(error=>{
    console.error(`${SYSTEM_ID} | Could not update magic content`,error);
    ui.notifications.error("Не удалось обновить каталог магии. Подробности в консоли.");
  });
  await migrateEquipmentContent().catch(error => {
    console.error(`${SYSTEM_ID} | Could not update equipment content`, error);
    ui.notifications.error("Не удалось обновить каталог предметов. Подробности в консоли.");
  });
  await migrateSharedEquipment().catch(error => {
    console.error(`${SYSTEM_ID} | Could not merge shared equipment`, error);
    ui.notifications.error("Не удалось объединить общие предметы. Обновление повторится при следующем входе мастера.");
  });
  await migratePregenContent().catch(error => {
    console.error(`${SYSTEM_ID} | Could not update pregens`, error);
    ui.notifications.error("Не удалось добавить прегены. Подробности в консоли.");
  });
  await migrateBookReferences().catch(error => {
    console.error(`${SYSTEM_ID} | Book references`, error);
    ui.notifications.error("Не удалось убрать номера страниц из описаний. Обновление повторится при следующем входе мастера.");
  });
  syncExistingDeathStates().catch(reportEffectError);
  syncExistingExhaustion().catch(reportEffectError);
  removeExistingDuplicateStatuses().catch(reportEffectError);
  migrateCompendiumFolders().catch(error => {
    console.error(`${SYSTEM_ID} | Could not organize compendiums`, error);
    ui.notifications.error(game.i18n.localize("WITCHER.Compendiums.FolderError"));
  });
});
