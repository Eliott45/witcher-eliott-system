import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { setStatus, hasStatus, STUNNED, EXHAUSTED_STUN, UNCONSCIOUS, DEAD } from "../scripts/combat/status-effects.mjs";
import { conditionRules, preventIncapacitatedMovement, preventIncapacitatedPositionUpdate } from "../scripts/combat/condition-rules.mjs";
import { applyExhaustion, regainConsciousness, recoverStamina, syncExistingExhaustion } from "../scripts/combat/exhaustion.mjs";
import { rollStun } from "../scripts/combat/stun-roll.mjs";
import { rollAttribute } from "../scripts/combat/attribute-roll.mjs";

let id = 0, rolled, total, posted, pause, message;
globalThis.game = { user: { isGM: false }, settings: { get: () => "public" },
  i18n: { localize: key => key, format: (key, data) => `${key}: ${JSON.stringify(data)}` } };
globalThis.ui = { notifications: { warn() {}, error(error) { throw new Error(error); } } };
globalThis.foundry = { documents: { ChatMessage: { getSpeaker: () => ({}) } }, dice: { Roll: class {
  constructor(formula) { assert.equal(formula, "1d10"); }
  async evaluate() { rolled++; this.total = total; if (pause) await pause; return this; }
  async toMessage(data) { message = data; return posted ? { flags: data.flags } : null; }
} } };

function actor({ value = 0, max = 50, recovery = 10 } = {}) {
  return { uuid: `Actor.${++id}`, type: "character", isOwner: true, effects: [],
    system: { stamina: { value, max }, exhaustionEpisode: `episode${++id}`, luckPending: 4,
      statistics: { recovery, stun: 10, adjusted: { body: 10, will: 10 }, effective: { intelligence: 10 } } },
    async toggleStatusEffect(status) { this.effects.push({ id: `effect${++id}`, statuses: new Set([status]), disabled: false }); },
    async deleteEmbeddedDocuments(_type, ids) { this.effects = this.effects.filter(effect => !ids.includes(effect.id)); },
    async update(changes) {
      const previous = this.system.stamina.value;
      if ("system.stamina.value" in changes) this.system.stamina.value = Math.max(0, Math.min(this.system.stamina.max, changes["system.stamina.value"]));
      if (previous > 0 && this.system.stamina.value === 0) {
        this.system.exhaustionEpisode = `episode${++id}`;
        await applyExhaustion(this);
      } else if (previous === 0 && this.system.stamina.value > 0) await regainConsciousness(this);
    }
  };
}
function reset() { rolled = 0; total = 9; posted = true; pause = null; message = null; game.user.isGM = false; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test("zero STA applies both conditions; positive STA wakes; only threshold plus success clears exhaustion", async () => {
  reset();
  const owner = actor({ value: 10 });
  await setStatus(owner, STUNNED, true);
  await owner.update({ "system.stamina.value": -4 });
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), true);
  assert.equal(hasStatus(owner, UNCONSCIOUS), true);
  assert.equal(hasStatus(owner, STUNNED), false, "Exhaustion replaces the weaker ordinary stun");
  assert.equal(conditionRules(owner).canRecover, true);
  assert.equal(conditionRules(owner).canDefend, false);
  await rollStun(owner);
  await rollAttribute(owner, "intelligence");
  assert.equal(rolled, 0);
  await recoverStamina(owner);
  assert.equal(owner.system.stamina.value, 10);
  assert.equal(hasStatus(owner, UNCONSCIOUS), false);
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), true);
  assert.equal(conditionRules(owner).canAct, false);
  await owner.update({ "system.stamina.value": 19 });
  await rollStun(owner);
  assert.equal(rolled, 0, "19 STA cannot remove exhaustion");
  await owner.update({ "system.stamina.value": 20 });
  assert.equal(conditionRules(owner).canStunSave, true);
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), true, "20 STA by itself does not remove exhaustion");
  total = 10;
  await rollStun(owner);
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), true);
  total = 9;
  posted = false;
  await rollStun(owner);
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), true);
  posted = true;
  await rollStun(owner);
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), false);
  assert.equal(conditionRules(owner).canAct, true);
  assert.equal(conditionRules(owner).canDefend, true);
  assert.equal(message.flags[SYSTEM_ID].skipLuck, true);
  assert.equal(owner.system.luckPending, 4);
});

test("low maxima replace the 20 STA requirement; Recovery caps and coalesces double clicks", async () => {
  reset();
  const owner = actor({ max: 12, recovery: 5 });
  await applyExhaustion(owner);
  const first = recoverStamina(owner), duplicate = recoverStamina(owner);
  assert.equal(first, duplicate);
  await first;
  assert.equal(owner.system.stamina.value, 5);
  assert.equal(conditionRules(owner).required, 12);
  await recoverStamina(owner);
  await rollStun(owner);
  assert.equal(rolled, 0);
  await recoverStamina(owner);
  assert.equal(owner.system.stamina.value, 12);
  await recoverStamina(owner);
  assert.equal(owner.system.stamina.value, 12);
  await rollStun(owner);
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), false);
  owner.isOwner = false;
  owner.system.stamina.value = 1;
  await recoverStamina(owner);
  assert.equal(owner.system.stamina.value, 1);
});

test("ordinary stun and unrelated unconsciousness retain their own recovery rules", async () => {
  reset();
  const owner = actor({ value: 5 });
  await setStatus(owner, STUNNED, true);
  assert.equal(conditionRules(owner).canRecover, false);
  await recoverStamina(owner);
  assert.equal(owner.system.stamina.value, 5);
  assert.equal(conditionRules(owner).canStunSave, true, "Ordinary stun does not require 20 STA");
  await rollStun(owner);
  assert.equal(hasStatus(owner, STUNNED), false);
  await setStatus(owner, UNCONSCIOUS, true);
  await rollStun(owner);
  await recoverStamina(owner);
  assert.equal(rolled, 1);
  await owner.update({ "system.stamina.value": 25 });
  assert.equal(hasStatus(owner, UNCONSCIOUS), true, "STA does not cure unconsciousness from an unrelated cause");
  await setStatus(owner, DEAD, true);
  assert.equal(conditionRules(owner).canRecover, false);
});

test("a new exhaustion episode or insufficient STA invalidates an older successful save", async () => {
  for (const repeat of [false, true]) {
    reset();
    const owner = actor();
    await applyExhaustion(owner);
    await owner.update({ "system.stamina.value": 20 });
    let resume;
    pause = new Promise(resolve => { resume = resolve; });
    const work = rollStun(owner);
    await tick();
    await owner.update({ "system.stamina.value": repeat ? 0 : 19 });
    if (repeat) await owner.update({ "system.stamina.value": 20 });
    resume();
    await work;
    assert.equal(hasStatus(owner, EXHAUSTED_STUN), true);
  }
});

test("conditions stop player token movement/rotation; the GM can move incapacitated characters", async () => {
  reset();
  const owner = actor({ value: 20 });
  const token = { actor: owner, x: 10, y: 10, rotation: 0, elevation: 0 };
  assert.equal(preventIncapacitatedMovement(token), undefined);
  for (const status of [STUNNED, EXHAUSTED_STUN, UNCONSCIOUS]) {
    owner.effects = [];
    await setStatus(owner, status, true);
    assert.equal(preventIncapacitatedMovement(token), false);
    assert.equal(preventIncapacitatedPositionUpdate(token, { rotation: 45 }), false);
    assert.equal(preventIncapacitatedPositionUpdate(token, { x: 50 }), false);
    assert.equal(preventIncapacitatedPositionUpdate(token, { x: 10, name: "Unchanged position" }), undefined);
    game.user.isGM = true;
    assert.equal(preventIncapacitatedMovement(token), undefined);
    game.user.isGM = false;
  }
});

test("startup converts legacy zero-STA stun, preserves blank sheets and avoids duplicate conditions", async () => {
  reset();
  const owner = actor(), synthetic = actor(), blank = actor({ max: 0 });
  await setStatus(owner, STUNNED, true);
  game.actors = [owner, blank];
  game.scenes = [{ tokens: [{ actorLink: false, actor: synthetic }] }];
  game.user.isActiveGM = true;
  await syncExistingExhaustion();
  await syncExistingExhaustion();
  assert.equal(owner.effects.length, 2);
  assert.equal(hasStatus(owner, STUNNED), false);
  assert.equal(hasStatus(owner, EXHAUSTED_STUN), true);
  assert.equal(hasStatus(synthetic, UNCONSCIOUS), true);
  assert.equal(blank.effects.length, 0);
});

test("a stun test (critical wound, fumble, dimeritium) makes a failure stunned and leaves a success unchanged", async () => {
  reset(); game.user.isGM = true;
  const tested = actor({ value: 30 });
  total = 10;
  await rollStun(tested, { test: true });
  assert.equal(hasStatus(tested, STUNNED), true, "10 is not below STUN 10");
  total = 3;
  await rollStun(tested, { test: true });
  assert.equal(hasStatus(tested, STUNNED), true, "a passed test is not a recovery save");
  const steady = actor({ value: 30 });
  await rollStun(steady, { test: true });
  assert.equal(hasStatus(steady, STUNNED), false);
});
