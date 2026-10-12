import assert from "node:assert/strict";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { combatContext } from "../scripts/sheets/combat-context.mjs";
import { moveCombatWeapon } from "../scripts/sheets/combat-weapon-order.mjs";

/** Both sheets share the menu, including the branch which used to require a live duel. */
export async function checkNativeCombatMenu(template) {
  const saved = { user: game.user, combat: game.combat, combats: game.combats, canvas: globalThis.canvas };
  const previews = [];
  try {
    game.user = { id: "menuGM0000000001", isGM: true, targets: new Set() };
    game.combat = null; game.combats = []; globalThis.canvas = null;
    for (const type of ["character", "npc"]) {
      const weapon = (id, name, skill, damage, equipped) => ({ _id: id, name, type: "weapon", img: "icons/svg/sword.svg",
        system: { category: "melee", skill, damage, equipped, carried: true, quantity: 1, hands: 1, grip: 1,
          reliability: { value: 10, max: 10 }, ...(skill === "staffSpear" ? { properties: "Длинное; Фокусирующее (1)" } : {}) } });
      const actor = new foundry.documents.BaseActor({ _id: `combatMenu${type === "npc" ? "NPC001" : "Hero01"}`, name: "Проверка меню", type,
        system: { attributes: { intelligence: 7, reflex: 7, dexterity: 6, body: 6, speed: 6, empathy: 7, craft: 5, will: 7, luck: 5 },
          health: { value: 30, max: 30 }, stamina: { value: 30, max: 30 }, resolve: { value: 12, max: 35 },
          skills: { swordsmanship: 4, staffSpear: 2, brawling: 2 } },
        items: [weapon("combatStaff00001", "Посох", "staffSpear", "1d6+2", true), weapon("combatSword00001", "Рыцарский меч", "swordsmanship", "2d6+4", false)] });
      Object.defineProperty(actor, "isOwner", { value: true });
      actor.update = async changes => { actor.updateSource(changes); return actor; };
      const initial = combatContext(actor);
      assert.equal(initial.duel, null);
      assert.equal(initial.weapons[0].canMoveUp, false); assert.equal(initial.weapons[0].canMoveDown, true);
      await moveCombatWeapon(actor, "combatSword00001", "up");
      const context = combatContext(actor);
      assert.equal(context.weapons[0].name, "Рыцарский меч"); assert.equal(context.weapons[0].equipped, false);
      const combatHTML = template({ combat: context, editable: true, compact: false, editing: false });
      assert.ok(combatHTML.indexOf("Рыцарский меч") < combatHTML.indexOf("Посох"));
      assert.ok(!combatHTML.includes("Сравните атаку с защитой"));
      assert.match(combatHTML, /data-view="combat" aria-pressed="true"/);
      const preview = combatContext(actor, { view: "verbal" });
      assert.equal(preview.duel.active, false);
      assert.ok(preview.duel.groups.flatMap(group => group.actions).every(action => action.disabled));
      const verbalHTML = template({ combat: preview, editable: true });
      assert.match(verbalHTML, /data-view="verbal" aria-pressed="true"/);
      assert.ok(verbalHTML.includes('data-action="startSheetVerbalDuel"'));
      const resolve = actor.system.resolve.value;
      const duel = { id: "menuDuel", round: 3, combatants: [{ actor }], flags: { [SYS]: { verbalDuel: { pairs: { saved: {} } } } } };
      game.combats = [duel];
      assert.equal(combatContext(actor).duel.active, true);
      assert.equal(combatContext(actor, { view: "combat" }).duel, null);
      const active = template({ combat: combatContext(actor, { view: "verbal" }), editable: true });
      assert.ok(!active.includes('data-action="startSheetVerbalDuel"'));
      assert.ok(!active.match(/data-action="verbalAttack"[^>]*disabled/));
      assert.equal(duel.round, 3); assert.equal(actor.system.resolve.value, resolve);
      game.user = { ...game.user, isGM: false };
      const observer = template({ combat: combatContext(actor, { view: "verbal" }), editable: false });
      assert.match(observer, /data-action="verbalAttack"[^>]*disabled/);
      assert.ok(!observer.match(/data-action="setCombatView"[^>]*disabled/));
      const readOnly = template({ combat: combatContext(actor, { view: "combat" }), editable: false });
      const moveButtons = Array.from(readOnly.matchAll(/<button\b[^>]*data-action="moveCombatWeapon"[^>]*>/g), match => match[0]);
      assert.equal(moveButtons.length, 4); assert.ok(moveButtons.every(button => button.includes("disabled")));
      game.combats = [];
      const notStarted = template({ combat: combatContext(actor, { view: "verbal" }), editable: true });
      assert.ok(!notStarted.includes('data-action="startSheetVerbalDuel"'));
      previews.push({ type, combatHTML, verbalHTML, activeHTML: active });
      game.user = { ...game.user, isGM: true };
    }
  } finally { game.user = saved.user; game.combat = saved.combat; game.combats = saved.combats; globalThis.canvas = saved.canvas; }
  console.log("Combat menu: native character/NPC modes, inactive duels, saved weapon order and observer controls OK");
  return previews;
}
