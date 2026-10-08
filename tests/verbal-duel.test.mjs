import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { duelModifiers, stackDamage, actionById, VERBAL_ATTACKS, VERBAL_DEFENSES, startVerbalDuel, verbalAttack } from "../scripts/combat/verbal-duel.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";

const pairs = obj => ({ round: 2, flags: { [SYSTEM_ID]: { verbalDuel: { pairs: obj } } } });
const a = { uuid: "Actor.a" }, b = { uuid: "Actor.b" };
const key = (x, y) => `${x.uuid.replaceAll(".", "_")}__${y.uuid.replaceAll(".", "_")}`;

test("spirits and constructs cannot be forced into a verbal duel or intimidated by a stale duel",async t=>{
  const old={game:globalThis.game,canvas:globalThis.canvas};t.after(()=>Object.assign(globalThis,old));
  const spirit={uuid:"Actor.spirit",items:[{type:"ability",system:{ruleId:"creature.fearless"}}]};
  globalThis.game={user:{isGM:true,targets:new Set([{actor:spirit}])},combat:{flags:{[SYSTEM_ID]:{verbalDuel:{}}},combatants:[{actor:a},{actor:spirit}]}};
  globalThis.canvas={tokens:{controlled:[{actor:a,name:"Герой"},{actor:spirit,name:"Призрак"}]}};
  await assert.rejects(startVerbalDuel(),/Нельзя договориться/);
  await assert.rejects(verbalAttack(a,"intimidate"),/нельзя запугать/);
});

test("Resolve = (WILL + INT) / 2 × 5 (core p.176)", () => {
  const attributes = { intelligence: 7, reflex: 5, dexterity: 5, body: 6, speed: 5, empathy: 5, craft: 5, will: 6, luck: 5 };
  assert.equal(deriveStatistics({ attributes, health: { value: 30, max: 30 } }).resolveMax, 30);
});

test("the duel tables match pp.176–177", () => {
  assert.deepEqual(VERBAL_ATTACKS.map(entry => [entry.id, entry.skill]), [["seduce", "seduction"], ["persuade", "persuasion"], ["reason", "leadership"], ["befriend", "charisma"], ["deceive", "deceit"], ["ridicule", "socialEtiquette"], ["intimidate", "intimidation"]]);
  assert.deepEqual(VERBAL_DEFENSES.map(entry => entry.id), ["ignore", "topic", "stop", "counter"]);
  assert.equal(actionById("study").fixed, "intelligence");
});

test("accumulating bonuses, levers and torture modify the right checks", () => {
  const combat = pairs({ [key(a, b)]: { seduce: 4, reason: 2, intimidate: 8, study: 3, bribe: 2 }, [key(b, a)]: { love: true, hint: true } });
  assert.deepEqual(stackDamage(combat, a, b, actionById("seduce")).map(part => part.value), [4, 2]);
  assert.deepEqual(stackDamage(combat, a, b, actionById("deceive")).map(part => part.value), []);
  assert.deepEqual(stackDamage(combat, a, b, actionById("intimidate")).map(part => part.value), [8]);
  const own = duelModifiers(combat, a, b, actionById("seduce"), { torture: 1, situational: 3 });
  assert.deepEqual(own.map(part => [part.label, part.value]), [["Ситуация", 3], ["Изучение", 2], ["Подкуп", 2], ["Влюблён", -3], ["Пытки", -3]]);
  assert.deepEqual(duelModifiers(combat, a, b, actionById("intimidate"), { torture: 2 }).map(part => part.value), [2, -3, 10]);
  assert.deepEqual(duelModifiers(combat, a, b, { defense: true }).map(part => part.label), ["Изучение", "Влюблён", "Намёк"]);
});
