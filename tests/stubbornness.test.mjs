import assert from "node:assert/strict";
import { test } from "node:test";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { adjustStubbornness } from "../scripts/data/abilities.mjs";
import { stubbornnessState, stubbornnessMessageMode, rerollStubbornness, renderStubbornness } from "../scripts/chat/stubbornness.mjs";

function fixture({ race = "human", used = 0, original = 14, next = 9, luck = 0 } = {}) {
  const actor = { uuid: "Actor.stubborn", isOwner: true, items: [],
    system: { details: { race }, abilityState: { stubbornnessUsed: used } },
    async update(changes) { this.system.abilityState.stubbornnessUsed = changes["system.abilityState.stubbornnessUsed"]; }
  };
  const source = { id: "original", isOwner: true, isContentVisible: true, speakerActor: actor,
    speaker: { actor: "stubborn", scene: "test", token: "unlinked" }, whisper: [], blind: false,
    rolls: [{ total: original, formula: `1d10wc + 10${luck ? ` + ${luck}` : ""}` }],
    flags: { [SYSTEM_ID]: { skillCheck: { key: "courage", base: 10 }, ...(luck ? { luck: { bonus: luck, rollIndex: 0 } } : {}) } },
    async update(changes) { this.flags[SYSTEM_ID].stubbornness = changes[`flags.${SYSTEM_ID}.stubbornness`]; }
  };
  const posted = [];
  let failure = false;
  globalThis.game = { i18n: { localize: key => key, format: (key, values) => key + JSON.stringify(values) } };
  globalThis.foundry = { utils: { randomID: () => "claim" }, dice: { Roll: class {
    constructor(formula) { this.formula = formula; this.total = next; }
    async evaluate(options) { this.options = options; return this; }
    async toMessage(data, options) {
      if (failure) throw new Error("Chat write rejected");
      const message = { id: "reroll", rolls: [this], ...data, options };
      posted.push(message);
      return message;
    }
  } } };
  return { actor, source, posted, fail: () => { failure = true; } };
}

test("only the two eligible checks with an owned ability and charges offer Stubbornness", () => {
  const { actor, source } = fixture();
  assert.equal(stubbornnessState(source).available, true);
  source.flags[SYSTEM_ID].skillCheck.key = "resistCoercion";
  assert.equal(stubbornnessState(source).available, true);
  source.flags[SYSTEM_ID].skillCheck.key = "resistMagic";
  assert.equal(stubbornnessState(source).available, false);
  source.flags[SYSTEM_ID].skillCheck.key = "courage";
  actor.system.details.race = "elf";
  assert.equal(stubbornnessState(source).available, false);
  actor.items.push({ type: "ability", system: { ruleId: "human.stubbornness" } });
  assert.equal(stubbornnessState(source).available, true, "Granted abilities work independently of race");
  actor.system.abilityState.stubbornnessUsed = 3;
  assert.equal(stubbornnessState(source).available, false);
  actor.system.abilityState.stubbornnessUsed = 0;
  source.isOwner = false;
  assert.equal(stubbornnessState(source).available, false);
  source.isOwner = true;
  actor.isOwner = false;
  assert.equal(stubbornnessState(source).available, false);
  actor.isOwner = true;
  source.isContentVisible = false;
  assert.equal(stubbornnessState(source).available, false);
  assert.doesNotThrow(() => renderStubbornness(source, { querySelector: () => { throw new Error("Private data exposed"); } }));
});

test("rerolls keep the higher total, the original base/Luck and the original audience", async () => {
  for (const [original, next] of [[19, 24], [19, 12], [-8, -13], [12, 12]]) {
    const { actor, source, posted } = fixture({ original, next, luck: 4 });
    source.whisper = ["original-recipient"];
    source.blind = true;
    await rerollStubbornness(source);
    const result = source.flags[SYSTEM_ID].stubbornness;
    assert.equal(result.kept, Math.max(original, next));
    assert.equal(actor.system.abilityState.stubbornnessUsed, 1);
    assert.equal(posted[0].rolls[0].formula, "1d10wc + 10 + 4");
    assert.equal(posted[0].flags[SYSTEM_ID].skipLuck, true);
    assert.equal(posted[0].flags[SYSTEM_ID].luck.bonus, 4);
    assert.deepEqual(posted[0].speaker, source.speaker, "Keep the unlinked token speaker");
    assert.deepEqual(posted[0].whisper, ["original-recipient"]);
    assert.equal(posted[0].options.messageMode, "blind");
    assert.equal(posted[0].rolls[0].options.allowInteractive, false);
    assert.equal(stubbornnessState(source).available, false);
    const reopened = { ...source, flags: JSON.parse(JSON.stringify(source.flags)) };
    assert.equal(stubbornnessState(reopened).available, false, "Persisted history cannot be rerolled again");
  }
  const { source } = fixture();
  assert.equal(stubbornnessMessageMode(source), "public");
  source.whisper = ["owner"];
  assert.equal(stubbornnessMessageMode(source), "gm", "Preserve explicit self/whisper recipient list, not today's mode");
});

test("double clicks spend one charge, and a reroll cannot itself be rerolled", async () => {
  const { actor, source, posted } = fixture();
  await Promise.all([rerollStubbornness(source), rerollStubbornness(source)]);
  assert.equal(posted.length, 1);
  assert.equal(actor.system.abilityState.stubbornnessUsed, 1);
  const followup = { ...source, ...posted[0], speakerActor: actor };
  assert.equal(stubbornnessState(followup).available, false);
  await adjustStubbornness(actor, 0);
  await rerollStubbornness(source);
  assert.equal(posted.length, 1, "Resetting session charges does not reset an old check");
});

test("different checks and sheet corrections share the last charge queue", async () => {
  const { actor, source, posted } = fixture({ used: 2 });
  const other = { ...source, id: "other", flags: structuredClone(source.flags) };
  await Promise.all([rerollStubbornness(source), rerollStubbornness(other), adjustStubbornness(actor, 1)]);
  assert.equal(posted.length, 1);
  assert.equal(actor.system.abilityState.stubbornnessUsed, 3);
});

test("a failed chat write refunds the charge and releases the check; posted results never refund", async () => {
  const first = fixture();
  first.fail();
  await assert.rejects(rerollStubbornness(first.source), /Chat write rejected/);
  assert.equal(first.actor.system.abilityState.stubbornnessUsed, 0);
  assert.equal(stubbornnessState(first.source).available, true);
  const second = fixture();
  const update = second.source.update.bind(second.source);
  second.source.update = async changes => {
    if (changes[`flags.${SYSTEM_ID}.stubbornness`]?.state === "complete") throw new Error("Summary update rejected");
    await update(changes);
  };
  await assert.rejects(rerollStubbornness(second.source), /Summary update rejected/);
  assert.equal(second.posted.length, 1);
  assert.equal(second.actor.system.abilityState.stubbornnessUsed, 1);
  assert.equal(stubbornnessState(second.source).available, false);
});
