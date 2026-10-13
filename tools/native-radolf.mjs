import assert from "node:assert/strict";
import { RADOLF_EQUIPMENT, SHARED_TORCH } from "../scripts/data/radolf-equipment.mjs";
import { sharedEquipmentUpdate, prepareSharedActorEquipment } from "../scripts/migrations/shared-equipment.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { useRadolfItem } from "../scripts/combat/radolf-actions.mjs";
import { scatterMarbles } from "../scripts/combat/radolf-marbles.mjs";
import { torchLightSource } from "../scripts/combat/radolf-light.mjs";
import { WitcherItemSheet } from "../scripts/sheets/witcher-item-sheet.mjs";
import { WitcherActorSheet } from "../scripts/sheets/witcher-actor-sheet.mjs";
import { WitcherNPCSheet } from "../scripts/sheets/witcher-npc-sheet.mjs";

export async function checkNativeRadolf(itemTemplate, documents) {
  const saved = { canvas: globalThis.canvas, user: game.user, users: game.users, combat: game.combat };
  try {
    const gm = { id: "radolfGM00000001", isGM: true, can: () => true }; game.user = gm; game.users = { activeGM: gm }; game.combat = null;
    const items = [...documents.values()].filter(item => [...RADOLF_EQUIPMENT, SHARED_TORCH].some(entry => entry.id === item.system?.ruleId)).map(item => item.toObject());
    assert.equal(items.length, 8);
    const actor = new foundry.documents.BaseActor({ _id: "radolfActor00001", name: "Radolf native QA", type: "character", items,
      system: { attributes: { intelligence: 6, reflex: 6, dexterity: 6, body: 6, speed: 6, empathy: 6, craft: 6, will: 6, luck: 6 }, health: { value: 30, max: 30 }, stamina: { value: 30, max: 30 } } });
    Object.defineProperty(actor, "isOwner", { value: true });
    // BaseItem is the server model; the client Item adds this parent convenience getter.
    for (const item of actor.items) Object.defineProperty(item, "actor", { get: () => actor });
    actor.update = async changes => { const { items, ...rest } = changes; for (const row of items ?? []) actor.items.get(row._id).updateSource(row); actor.updateSource(rest); return actor; };
    const scene = { id: "radolfNative", grid: { size: 100, distance: 2 }, tokens: [], regions: [],
      async createEmbeddedDocuments(type, sources) {
        assert.equal(type, "Region"); return sources.map(source => {
          const region = new foundry.documents.BaseRegion(source, { strict: true });
          assert.equal(region.validate({ strict: true }), true); this.regions.push(region); return region;
        });
      } };
    const token = { id: "radolfToken00001", parent: scene, actor, x: 0, y: 0, elevation: 0, getSize: () => ({ width: 100, height: 100 }) };
    scene.tokens.push(token); Object.defineProperty(actor, "isToken", { value: true }); Object.defineProperty(actor, "token", { value: token });
    globalThis.canvas = { ready: true, scene, tokens: { controlled: [] } };
    actor.system.prepareDerivedData();
    const sheet = new WitcherItemSheet(); sheet.isEditable = true;
    for (const item of actor.items) {
      sheet.item = item; sheet.tabGroups.item = "description";
      const context = await sheet._prepareContext({}), html = itemTemplate(context);
      if (context.radolf) {
        assert.ok(html.includes(context.radolf.label));
        assert.ok(html.includes('data-action="useRadolfItem"'));
        assert.ok(!html.match(/<button[^>]*data-action="useRadolfItem"[^>]*>/)[0].includes("disabled"));
      }
      assert.ok(html.includes("Фургончик Родольфа"));
      sheet.isEditable = false;
      const readonly = itemTemplate(await sheet._prepareContext({}));
      if (context.radolf) assert.ok(readonly.match(/<button[^>]*data-action="useRadolfItem"[^>]*>/)[0].includes("disabled"));
      sheet.isEditable = true;
    }
    for (const Sheet of [WitcherItemSheet, WitcherActorSheet, WitcherNPCSheet]) assert.equal(typeof Sheet.DEFAULT_OPTIONS.actions.useRadolfItem, "function");
    const torch = actor.items.find(item => item.system.ruleId === "gear.torch");
    const legacy = new foundry.documents.BaseItem({ _id: "legacyTorch00001", name: "Факел", type: "equipment", system: { ruleId: "gear.torch", quantity: 3, description: "Мои заметки" } });
    legacy.updateSource(sharedEquipmentUpdate(legacy));
    assert.equal(legacy.type, "weapon"); assert.equal(legacy.system.damage, "1d6");
    assert.equal(legacy.system.quantity, 3); assert.equal(legacy.system.description, "Мои заметки");
    assert.equal(legacy.validate({ strict: true }), true);
    const imported = new foundry.documents.BaseActor({name:"Старый преген",type:"character",items:[{_id:"legacyActorTorch",name:"Факел",type:"equipment",system:{ruleId:"gear.torch",quantity:4}}]});
    prepareSharedActorEquipment(imported);
    const persisted = new foundry.documents.BaseActor(JSON.parse(JSON.stringify(imported.toObject())));
    assert.equal(persisted.items.get("legacyActorTorch").type,"weapon");
    assert.equal(persisted.items.get("legacyActorTorch").system.quantity,4);
    assert.equal(persisted.items.get("legacyActorTorch").system.reliability.max,5);
    torch.updateSource({ "system.equipped": true });
    await useRadolfItem(torch); assert.equal(torch.flags[SYS].torchLit, true);
    const light = new foundry.documents.BaseAmbientLight(torchLightSource(token), { strict: true });
    assert.equal(light.validate({ strict: true }), true); assert.equal(light.config.dim, 5); assert.equal(light.config.animation.type, "torch");
    const bag = actor.items.find(item => item.system.ruleId === "radolf.marbles");
    const region = await scatterMarbles(actor, bag, { point: { x: 250, y: 50 }, diameter: 2 });
    assert.equal(region.visibility, CONST.REGION_VISIBILITY.ALWAYS); assert.equal(region.shapes[0].radiusX, 50);
    assert.equal(bag.system.quantity, 0);
    console.log("Radolf DLC: 8 native items, editable/read-only actions, torch light and marble Region validate in installed Foundry");
  } finally { globalThis.canvas = saved.canvas; game.user = saved.user; game.users = saved.users; game.combat = saved.combat; }
}
