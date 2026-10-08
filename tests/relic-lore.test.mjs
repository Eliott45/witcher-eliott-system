import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { relicArmorLore } from "../scripts/data/relic-armor.mjs";
import { chooseRelicScholar, rollRelicLore, relicLoreResult } from "../scripts/sheets/relic-lore.mjs";

function fixture(t) {
  const keys = ["game", "canvas", "foundry", "ui", "Hooks"];
  const previous = keys.map(key => [key, globalThis[key]]);
  t.after(() => { for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  delete globalThis.Hooks;
  const messages = [], evaluated = [], prompts = [];
  const actor = { id: "scholar", uuid: "Actor.scholar", name: "Знаток", type: "character", isOwner: true, items: [], effects: [],
    system: { skills: { education: 6 }, statistics: { effective: { intelligence: 8 }, modifiers: [{ target: "skills.education", value: 2 }] }, stamina: { value: 30 }, combatAction: { extra: false } },
    async update(changes) { for (const [path, value] of Object.entries(changes)) {
      const fields = path.split("."); let node = this;
      for (const field of fields.slice(0, -1)) node = node[field] ??= {};
      node[fields.at(-1)] = value;
    } } };
  const item = { uuid: "Item.relic", name: "Доспехи Ворона", type: "armor", actor, system: { ruleId: "armor.raven" }, testUserPermission: () => true };
  globalThis.game = { user: {}, actors: [actor], settings: { get: () => "blind" } };
  globalThis.canvas = { tokens: { controlled: [], placeables: [] } };
  globalThis.ui = { notifications: { warn: message => { throw new Error(message); } } };
  globalThis.foundry = {
    applications: { api: { DialogV2: { prompt: async options => { prompts.push(options); return null; } } } },
    documents: { ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id }) } },
    dice: { Roll: class {
      constructor(formula) { this.formula = formula; this.total = 14; }
      async evaluate(options) { evaluated.push({ formula: this.formula, options }); return this; }
      async toMessage(data, options) { const message = { ...data, rolls: [this], options }; messages.push(message); return message; }
    } }
  };
  return { actor, item, messages, evaluated, prompts };
}

test("three armor legends retain printed Education difficulties across renames", () => {
  for (const [ruleId, dc] of [["armor.raven", 14], ["armor.mountain-folk", 16], ["armor.draug", 18]]) {
    assert.equal(relicArmorLore({ type: "armor", name: "Переименовано", system: { ruleId } }).dc, dc);
  }
  assert.equal(relicArmorLore({ type: "armor", name: "Доспехи Ворона", system: { ruleId: "custom" } }), null);
});

test("legend check uses current Education modifiers, private mode, extra action and a single coalesced roll", async t => {
  const f = fixture(t); f.actor.system.combatAction.extra = true;
  const first = rollRelicLore(f.item), second = rollRelicLore(f.item);
  assert.equal(first, second);
  const message = await first;
  assert.equal(f.messages.length, 1);
  assert.deepEqual(f.evaluated, [{ formula: "1d10wc + 16 - 3", options: { allowInteractive: false } }]);
  assert.equal(message.options.messageMode, "blind");
  assert.equal(message.flags[SYSTEM_ID].skillCheck.base, 13);
  assert.equal(message.flags[SYSTEM_ID].relicLore.dc, 14);
  assert.equal(f.actor.system.stamina.value, 27);
  assert.equal(f.actor.system.combatAction.extra, false);
  assert.match(relicLoreResult(message), /Легенда вспомнилась/);
  message.rolls[0].total = 13; assert.match(relicLoreResult(message), /Не удалось/);
  message.rolls[0].total = 16; assert.match(relicLoreResult(message), /16 против СЛ 14/);
  message.isContentVisible = false; assert.equal(relicLoreResult(message), "");
});

test("catalog checks choose one controlled actor or the assigned character without changing the item", async t => {
  const f = fixture(t); delete f.item.actor;
  canvas.tokens.controlled = [{ actor: f.actor }];
  assert.equal(await chooseRelicScholar(f.item), f.actor);
  canvas.tokens.controlled = []; game.user.character = f.actor;
  assert.equal(await chooseRelicScholar(f.item), f.actor);
  assert.equal(f.prompts.length, 0);
  assert.equal(Object.hasOwn(f.item, "actor"), false);
});

test("cancelled scholar selection, unreadable items and unowned actors do not roll or spend resources", async t => {
  const f = fixture(t); delete f.item.actor;
  game.actors.push({ ...f.actor, id: "second", uuid: "Actor.second", name: "Другой" });
  await rollRelicLore(f.item);
  assert.equal(f.prompts.length, 1); assert.equal(f.messages.length, 0);
  assert.equal(f.actor.system.stamina.value, 30);
  f.item.testUserPermission = () => false;
  await rollRelicLore(f.item, { actor: f.actor }); assert.equal(f.messages.length, 0);
  f.item.testUserPermission = () => true; f.actor.isOwner = false;
  await assert.rejects(rollRelicLore(f.item, { actor: f.actor }), /Нет права/);
});
