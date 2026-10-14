import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { pokerHand, pokerScoring, comparePoker, rerollIndices, wagerAmount, requirePokerAction, pokerItemContext } from "../scripts/minigames/poker-rules.mjs";
import { pokerState, pokerReceipt, processPokerRequest, pokerWrite, recoverPokerBank, resumePoker, pokerTables, pokerCard } from "../scripts/minigames/poker-service.mjs";
import { drawGwentCard, settleGwentRound, gwentStart, gwentForgeries, gwentDeckBonus, gwentCard } from "../scripts/minigames/gwent-rules.mjs";

test("dice poker ranks all 7776 outcomes with the printed full-house/straight hierarchy", () => {
  const counts = Array(9).fill(0);
  for (let value = 0; value < 7776; value++) {
    let n = value; const dice = Array.from({ length: 5 }, () => { const face = n % 6 + 1; n = Math.floor(n / 6); return face; });
    const hand = pokerHand(dice); counts[hand.rank]++;
    assert.deepEqual(pokerHand([...dice].reverse()), hand);
  }
  assert.deepEqual(counts, [480, 3600, 1800, 1200, 120, 120, 300, 150, 6]);
  assert.equal(comparePoker([2, 2, 2, 1, 1], [2, 3, 4, 5, 6]), 1);
  assert.equal(comparePoker([1, 1, 1, 1, 1], [6, 6, 6, 6, 5]), 1);
  assert.equal(comparePoker([1, 2, 3, 4, 6], [1, 2, 3, 5, 6]), -1);
});
test("scoring dice highlight exactly the dice that make the combination", () => {
  assert.deepEqual(pokerScoring([1, 2, 3, 4, 6]), []);
  assert.deepEqual(pokerScoring([5, 2, 5, 4, 6]), [0, 2]);
  assert.deepEqual(pokerScoring([5, 2, 5, 2, 6]), [0, 1, 2, 3]);
  assert.deepEqual(pokerScoring([3, 1, 3, 3, 6]), [0, 2, 3]);
  assert.deepEqual(pokerScoring([3, 5, 3, 3, 5]), [0, 1, 2, 3, 4]);
  assert.deepEqual(pokerScoring([6, 2, 4, 3, 5]), [0, 1, 2, 3, 4]);
  assert.deepEqual(pokerScoring([4, 4, 1, 4, 4]), [0, 1, 3, 4]);
});
test("only owned gaming gear offers a dice poker challenge", () => {
  assert.ok(pokerItemContext({ actor: {}, system: { ruleId: "gear.dice-poker-board" } }));
  assert.ok(pokerItemContext({ actor: {}, system: { ruleId: "gear.loaded-dice" } }));
  assert.equal(pokerItemContext({ actor: null, system: { ruleId: "gear.dice-poker-board" } }), null);
  assert.equal(pokerItemContext({ actor: {}, system: { ruleId: "gear.gwent-deck" } }).game, "gwent");
  assert.equal(pokerItemContext({ actor: {}, system: { ruleId: "gear.map" } }), null);
});
test("matching hands compare their groups before kickers and exact ties stay ties", () => {
  assert.equal(comparePoker([3, 3, 1, 2, 4], [2, 2, 4, 5, 6]), 1);
  assert.equal(comparePoker([2, 2, 1, 3, 6], [2, 2, 3, 4, 5]), 1);
  assert.equal(comparePoker([6, 6, 2, 2, 1], [5, 5, 4, 4, 6]), 1);
  assert.equal(comparePoker([3, 3, 3, 2, 2], [3, 3, 3, 1, 1]), 1);
  assert.equal(comparePoker([1, 2, 3, 4, 6], [6, 4, 3, 2, 1]), 0);
  assert.equal(comparePoker([6, 6, 2, 2, 1], [5, 5, 4, 4, 6], "draw"), 0);
});
test("dice selection and stakes reject malformed or duplicate input", () => {
  for (const dice of [[], [1, 2, 3, 4, 7], [1, 2, 3, 4, 1.5]]) assert.throws(() => pokerHand(dice));
  for (const indices of [[1, 1], [-1], [5], [1.2], null, "1"]) assert.throws(() => rerollIndices(indices));
  assert.deepEqual(rerollIndices([4, 1, 0]), [0, 1, 4]); assert.deepEqual(rerollIndices([]), []);
  for (const amount of [-1, Infinity, .5, "bad", 1000001]) assert.throws(() => wagerAmount(amount));
  assert.equal(wagerAmount("50"), 50); assert.equal(wagerAmount(0), 0);
});

function fixture() {
  const gm = { id: "gm", name: "Ведущий", isGM: true, active: true }, a = { id: "a", name: "Первый", active: true }, b = { id: "b", name: "Второй", active: true }, intruder = { id: "x", name: "Посторонний", active: true };
  const users = [gm, a, b, intruder]; users.activeGM = gm; users.get = id => users.find(user => user.id === id);
  const messages = [], actors = [], rolls = []; let sequence = 0, rolled = 0;
  messages.get = id => messages.find(message => message.id === id);
  const apply = (doc, update) => { for (const [key, value] of Object.entries(update)) { const parts = key.split("."); let cursor = doc; for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {}; cursor[parts.at(-1)] = structuredClone(value); } };
  const make = data => {
    const message = { ...structuredClone(data), id: `m${++sequence}`, author: users.get(data.author), isContentVisible: true, async update(update) {
      if (this.failUpdate?.(update)) throw new Error("Simulated persistence failure"); apply(this, update); return this;
    } }; messages.push(message); return message;
  };
  const actor = (owner, name, money) => {
    const value = { uuid: `Actor.${owner.id}`, name, type: "character", isOwner: true, system: { crowns: money }, items: Object.assign([], { get(id) { return this.find(item => item.id === id); } }), flags: {},
      testUserPermission: user => user?.isGM || user?.id === owner.id, async update(update) { if (this.failUpdate?.(update)) throw new Error("Wallet unavailable"); apply(this, update); return this; } };
    actors.push(value); return value;
  };
  const first = actor(a, "Геральт", 100), second = actor(b, "Лютик", 100), host = actor(gm, "Трактирщик", 100);
  globalThis.game = { user: gm, users, actors, messages };
  globalThis.ui = { notifications: { warn() {} } };
  globalThis.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globalThis.foundry = { utils: { deepClone: structuredClone }, documents: { ChatMessage: { implementation: { async create(data) { return make(data); } } } } };
  globalThis.Roll = class { constructor(formula) { this.formula = formula; this.count = Number(formula.split("d")[0]); const sign = formula.match(/([+-])\s*(\d+)\s*$/); this.bonus = sign ? Number(sign[2]) * (sign[1] === "-" ? -1 : 1) : 0; }
    async evaluate() { rolled++; const dice = rolls.shift() ?? Array(this.count).fill(1); assert.equal(dice.length, this.count); this.dice = [{ results: dice.map(result => ({ result, active: true })) }]; this.total = dice.reduce((a, b) => a + b, this.bonus); return this; } };
  const request = async (user, action, table = null, data = {}, changes = {}) => {
    const revision = pokerState(table)?.seats.find(seat => seat.userId === user.id)?.revision ?? 0;
    const message = make({ author: user.id, flags: { [SYS]: { pokerRequest: { action, tableId: table?.id ?? "", revision, data, ...changes } } } });
    await pokerWrite(() => processPokerRequest(message, user.id));
    const response = messages.find(entry => pokerReceipt(entry)?.requestId === message.id);
    return { request: message, response, reply: pokerReceipt(response), table: messages.get(pokerReceipt(response)?.tableId) };
  };
  const start = async (stake = 10, opponent = b, opponentActor = second) => {
    const result = await request(a, "challenge", null, { opponentId: opponent.id, actorUuid: first.uuid, stake });
    assert.ok(result.reply.ok); const table = result.table;
    const accepted = await request(opponent, "accept", table, { actorUuid: opponentActor?.uuid ?? "" }); assert.ok(accepted.reply.ok, accepted.reply.error);
    return table;
  };
  const open = async table => { rolls.push([1, 1, 2, 3, 4], [2, 2, 3, 4, 5]); await request(a, "roll", table); await request(b, "roll", table); };
  return { gm, a, b, intruder, users, messages, actors, rolls, first, second, host, request, start, open, make, rolled: () => rolled };
}
test("accepted challenges escrow both wagers and a full game pays the winner once", async () => {
  const f = fixture(), table = await f.start(); assert.equal(pokerState(table).phase, "opening");
  assert.deepEqual(table.whisper, [], "Open tables are public chat cards that spectators can watch");
  assert.equal(f.first.system.crowns, 90); assert.equal(f.second.system.crowns, 90);
  await f.open(table);
  f.rolls.push([6, 6, 6]); const draw = await f.request(f.a, "reroll", table, { indices: [2, 3, 4] });
  assert.equal(draw.reply.done, true); assert.deepEqual(draw.reply.dice, [1, 1, 6, 6, 6]);
  assert.ok(!draw.response.whisper.includes(f.b.id)); assert.ok(draw.response.whisper.includes(f.gm.id));
  assert.deepEqual(pokerState(table).hands[0], [1, 1, 6, 6, 6], "Rerolled dice are open to the opponent at once");
  assert.deepEqual(pokerState(table).seats[0].rerolled, [2, 3, 4]); assert.equal(pokerState(table).phase, "drawing");
  const finish = await f.request(f.b, "reroll", table, { indices: [] });
  assert.equal(pokerState(table).phase, "finished", "The reroll is final: no extra confirmation"); assert.equal(pokerState(table).winner, 0);
  assert.deepEqual(pokerState(table).hands, [[1, 1, 6, 6, 6], [2, 2, 3, 4, 5]]);
  assert.equal(f.first.system.crowns, 110); assert.equal(f.second.system.crowns, 90);
  await processPokerRequest(finish.request, f.b.id); await recoverPokerBank(table); await resumePoker();
  assert.equal(f.first.system.crowns, 110); assert.equal(f.second.system.crowns, 90); assert.equal(f.rolled(), 3);
});
test("draws return both stakes and playing a GM without an actor works with no stakes", async () => {
  const f = fixture(), table = await f.start(20);
  f.rolls.push([4, 4, 4, 4, 4], [4, 4, 4, 4, 4]);
  for (const user of [f.a, f.b]) await f.request(user, "roll", table);
  for (const user of [f.a, f.b]) await f.request(user, "reroll", table, { indices: [] });
  assert.equal(pokerState(table).winner, null); assert.equal(f.first.system.crowns, 100); assert.equal(f.second.system.crowns, 100);
  const next = await f.start(0, f.gm, null); assert.equal(pokerState(next).phase, "opening");
  await f.request(f.gm, "concede", next); assert.equal(pokerState(next).winner, 0); assert.equal(f.first.system.crowns, 100);
});
test("private tables stay whispered to the players and GMs; spectators cannot act", async () => {
  const f = fixture(), invite = await f.request(f.a, "challenge", null, { opponentId: f.b.id, actorUuid: f.first.uuid, stake: 0, open: false });
  assert.deepEqual([...invite.table.whisper].sort(), [f.a.id, f.b.id, f.gm.id].sort()); assert.equal(pokerState(invite.table).open, false);
  assert.ok(invite.table.content.includes("Закрытая партия"));
  await f.request(f.b, "accept", invite.table, { actorUuid: "" });
  const watcher = await f.request(f.intruder, "concede", invite.table); assert.equal(watcher.reply.ok, false);
  f.rolls.push([6, 6, 6, 6, 6], [1, 2, 3, 4, 6]); await f.request(f.a, "roll", invite.table); await f.request(f.b, "roll", invite.table);
  for (const user of [f.a, f.b]) await f.request(user, "reroll", invite.table, { indices: [] });
  assert.ok(invite.table.content.includes(": Покер") && invite.table.content.includes("Без комбинации"), "The finished card names both hands");
});
test("declining and withdrawing invitations never debit wallets; concurrent invitations cannot double-book", async () => {
  const f = fixture(), invite = await f.request(f.a, "challenge", null, { opponentId: f.b.id, actorUuid: f.first.uuid, stake: 50 });
  assert.equal(f.first.system.crowns, 100);
  const again = await f.request(f.a, "challenge", null, { opponentId: f.gm.id, actorUuid: f.first.uuid, stake: 5 }); assert.equal(again.reply.ok, false);
  await f.request(f.b, "decline", invite.table); assert.equal(pokerState(invite.table).phase, "declined");
  const next = await f.request(f.a, "challenge", null, { opponentId: f.b.id, actorUuid: f.first.uuid, stake: 50 });
  await f.request(f.a, "cancel", next.table); assert.equal(pokerState(next.table).phase, "cancelled"); assert.equal(f.first.system.crowns, 100);
});
test("permissions, spoofed authors, stale moves and premature rerolls are rejected", async () => {
  const f = fixture(), table = await f.start();
  const outside = await f.request(f.intruder, "roll", table); assert.equal(outside.reply.ok, false);
  const early = await f.request(f.a, "reroll", table, { indices: [0] }); assert.equal(early.reply.ok, false);
  const forged = f.make({ author: f.a.id, flags: { [SYS]: { pokerRequest: { action: "roll", tableId: table.id, revision: 0 } } } });
  await processPokerRequest(forged, f.intruder.id); assert.equal(f.rolled(), 0);
  await f.request(f.a, "roll", table); const repeat = await f.request(f.a, "roll", table, {}, { revision: 0 }); assert.equal(repeat.reply.ok, false); assert.equal(f.rolled(), 1);
  assert.throws(() => requirePokerAction(pokerState(table), f.a.id, "finish", 1));
  assert.throws(() => requirePokerAction(pokerState(table), f.a.id, "reroll", 1));
  const abort = await f.request(f.a, "abort", table); assert.equal(abort.reply.ok, false);
});
test("both players can move concurrently but duplicated moves cannot generate more dice", async () => {
  const f = fixture(), table = await f.start(0);
  await Promise.all([f.request(f.a, "roll", table), f.request(f.a, "roll", table), f.request(f.b, "roll", table)]);
  assert.equal(f.rolled(), 2); assert.equal(pokerState(table).phase, "drawing");
  f.rolls.push([2, 3], [4]);
  await Promise.all([f.request(f.a, "reroll", table, { indices: [0, 2] }), f.request(f.b, "reroll", table, { indices: [3] })]);
  assert.equal(f.rolled(), 4); assert.equal(pokerState(table).phase, "finished");
});
test("GM cancellation refunds deposits; conceding awards the bank", async () => {
  const f = fixture(), table = await f.start(40);
  await f.request(f.gm, "abort", table); assert.equal(pokerState(table).phase, "cancelled");
  assert.equal(f.first.system.crowns, 100); assert.equal(f.second.system.crowns, 100);
  const other = await f.start(40); await f.request(f.a, "concede", other);
  assert.equal(f.first.system.crowns, 60); assert.equal(f.second.system.crowns, 140);
});
test("a failed second debit can resume or refund the first without a duplicate transfer", async () => {
  const f = fixture(); f.second.failUpdate = () => true;
  const invited = await f.request(f.a, "challenge", null, { opponentId: f.b.id, actorUuid: f.first.uuid, stake: 30 });
  await f.request(f.b, "accept", invited.table, { actorUuid: f.second.uuid });
  assert.equal(pokerState(invited.table).phase, "funding"); assert.equal(f.first.system.crowns, 70); assert.equal(f.second.system.crowns, 100);
  f.second.failUpdate = null; await recoverPokerBank(invited.table); assert.equal(f.first.system.crowns, 70); assert.equal(f.second.system.crowns, 70);
  await f.request(f.gm, "abort", invited.table); assert.equal(f.first.system.crowns, 100); assert.equal(f.second.system.crowns, 100);
});
test("failed settlement is durable and retries never duplicate the winner payout", async () => {
  const f = fixture(), table = await f.start(30); f.second.failUpdate = () => true;
  await f.request(f.b, "concede", table);
  assert.equal(pokerState(table).phase, "settling"); assert.equal(f.first.system.crowns, 130);
  const cancel = await f.request(f.gm, "abort", table); assert.equal(cancel.reply.ok, false, "An already paid winner must not be followed by a second refund");
  f.second.failUpdate = null; await recoverPokerBank(table); await recoverPokerBank(table);
  assert.equal(pokerState(table).phase, "finished"); assert.equal(f.first.system.crowns, 130); assert.equal(f.second.system.crowns, 70);
});
test("persisted rolls survive failure to update the shared table and reuse the same dice", async () => {
  const f = fixture(), table = await f.start(0); table.failUpdate = update => Boolean(update[`flags.${SYS}.pokerTable`]);
  const attempt = await f.request(f.a, "roll", table); assert.equal(attempt.reply.done, false); assert.equal(f.rolled(), 1);
  table.failUpdate = null; await resumePoker();
  assert.equal(f.rolled(), 1); assert.equal(pokerReceipt(attempt.response).done, true); assert.ok(pokerState(table).seats[0].opening);
});
test("retrying with a new request after a write failure recovers the saved die, never a fresh roll", async () => {
  const f = fixture(), table = await f.start(0); table.failUpdate = () => true;
  await f.request(f.a, "roll", table); assert.equal(f.rolled(), 1);
  table.failUpdate = null; const again = await f.request(f.a, "roll", table);
  assert.equal(f.rolled(), 1); assert.equal(again.reply.ok, false); assert.ok(pokerState(table).seats[0].opening);
});
test("without loaded dice nobody gets an extra step; finish is refused", async () => {
  const f = fixture(), table = await f.start(0); await f.open(table);
  await f.request(f.a, "reroll", table, { indices: [] });
  const early = await f.request(f.a, "finish", table, { cheat: { index: 0, value: 6 } }); assert.equal(early.reply.ok, false);
  await f.request(f.b, "reroll", table, { indices: [] });
  assert.equal(pokerState(table).phase, "finished"); assert.deepEqual(pokerState(table).hands[0], [1, 1, 2, 3, 4]);
});
test("loaded dice: the cheater sees every die, swaps one privately and an unnoticed swap stands", async () => {
  const f = fixture(), table = await f.start(10); await f.open(table);
  f.first.items.push({ system: { ruleId: "gear.loaded-dice", quantity: 1, carried: true } });
  await f.request(f.a, "reroll", table, { indices: [] });
  f.rolls.push([6]); await f.request(f.b, "reroll", table, { indices: [4] });
  const state = pokerState(table); assert.equal(state.phase, "palming");
  assert.equal(state.seats[1].final, state.seats[1].draw, "The honest player is done after the reroll");
  assert.equal(state.seats[0].palm, true); assert.deepEqual(state.hands, [[1, 1, 2, 3, 4], [2, 2, 3, 4, 6]], "The cheater sees every die before swapping");
  const honest = await f.request(f.b, "finish", table); assert.equal(honest.reply.ok, false);
  const swap = await f.request(f.a, "finish", table, { cheat: { index: 4, value: 1 } }); assert.equal(swap.reply.ok, true);
  assert.deepEqual(swap.reply.dice, [1, 1, 2, 3, 1]); assert.ok(!swap.response.whisper.includes(f.b.id));
  const note = f.messages.find(message => message.flags?.[SYS]?.pokerNote); assert.deepEqual(note.whisper, [f.gm.id]);
  assert.equal(pokerState(table).phase, "finished"); assert.equal(pokerState(table).winner, 0, "Unnoticed: the swapped set beats a pair");
  assert.equal(f.first.system.crowns, 110);
  const again = await f.request(f.a, "finish", table, { cheat: { index: 1, value: 6 } }); assert.equal(again.reply.ok, false);
  const fake = f.make({ author: f.a.id, flags: { [SYS]: { pokerTable: { version: 1 }, pokerReceipt: { requestId: "fake", done: true, dice: [6, 6, 6, 6, 6] } } } });
  assert.ok(!pokerTables().includes(fake));
});
test("a spotted swap loses the game and the bank; picking the same value is no swap", async () => {
  const f = fixture(); f.second.system = { crowns: 100, skills: { awareness: 6 }, statistics: { effective: { intelligence: 6 }, modifiers: [], mobilityAttributes: {} } };
  const table = await f.start(10); await f.open(table);
  f.first.items.push({ system: { ruleId: "gear.loaded-dice", quantity: 1, carried: true } });
  for (const user of [f.a, f.b]) await f.request(user, "reroll", table, { indices: [] });
  f.rolls.push([5]); await f.request(f.a, "finish", table, { cheat: { index: 4, value: 1 } });
  const state = pokerState(table); assert.equal(state.reason, "caught"); assert.deepEqual(state.caught, [0]); assert.equal(state.winner, 1); assert.deepEqual(state.swaps, [4, -1]);
  assert.equal(f.first.system.crowns, 90); assert.equal(f.second.system.crowns, 110);
  const fair = await f.start(0); await f.open(fair);
  for (const user of [f.a, f.b]) await f.request(user, "reroll", fair, { indices: [] });
  const rolled = f.rolled(); await f.request(f.a, "finish", fair, { cheat: { index: 0, value: 1 } });
  assert.equal(f.rolled(), rolled, "Choosing the value already on the die is not a swap");
  assert.equal(pokerState(fair).reason, "showdown"); assert.equal(pokerState(fair).winner, 1);
});

const skilled = (actor, skills) => { actor.system = { ...actor.system, skills, statistics: { effective: { intelligence: 5, empathy: 5, craft: 5 }, modifiers: [], mobilityAttributes: {} } }; };
const gwentDeck = (actor, id, gwent = {}) => { const item = { id, name: "Колода Севера", system: { ruleId: "gear.gwent-deck", quantity: 1, carried: true }, flags: { [SYS]: { gwent } } }; actor.items.push(item); return item; };
test("gwent cards follow the printed d10 table, including the sacrifice and the path to victory", async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(face => gwentCard(face).mod), [3, -3, 2, -2, 1, 1, -1, -1, -2, 0]);
  const queue = values => async () => values.shift();
  assert.deepEqual(await drawGwentCard(queue([10, 1]), 1), { faces: [10], key: "path", name: "Путь к победе", mod: 0, path: false, carry: 0 }, "No reroll in the first round");
  const path = await drawGwentCard(queue([10, 10, 3]), 2); assert.deepEqual(path.faces, [10, 10, 3]); assert.equal(path.mod, 2); assert.equal(path.path, true);
  assert.equal((await drawGwentCard(queue([9]), 1)).carry, 3);
  assert.deepEqual(gwentForgeries([14, "x", 9, 20, 11]), { count: 3, dc: 11 }); assert.equal(gwentDeckBonus({ quality: 2, fakes: 5 }), 5);
});
test("gwent rounds: two won rounds end the match, a third round decides, ties and sacrifices carry over", () => {
  const play = (total, carry = 0) => ({ total, carry });
  let state = { phase: "playing", ...gwentStart() };
  state.rounds[0].plays = [play(15, 3), play(12)]; state = settleGwentRound(state);
  assert.equal(state.round, 2); assert.deepEqual(state.score, [1, 0]); assert.deepEqual(state.carry, [3, 0]);
  state.rounds[1].plays = [play(10), play(10)]; state = settleGwentRound(state);
  assert.equal(state.round, 3); assert.deepEqual(state.score, [1, 0]); assert.equal(state.rounds[1].winner, null);
  state.rounds[2].plays = [play(8), play(18)]; state = settleGwentRound(state);
  assert.equal(state.phase, "settling"); assert.equal(state.winner, null, "1 : 1 with a drawn round is a draw");
  let quick = { phase: "playing", ...gwentStart() };
  quick.rounds[0].plays = [play(20), play(5)]; quick = settleGwentRound(quick); quick.rounds[1].plays = [play(20), play(5)]; quick = settleGwentRound(quick);
  assert.equal(quick.phase, "settling"); assert.equal(quick.winner, 0); assert.equal(quick.rounds.length, 2);
});
test("a full gwent match is public to spectators, pays the bank and only the chosen skill counts", async () => {
  const f = fixture(); skilled(f.first, { gambling: 4, tactics: 1 }); skilled(f.second, { gambling: 1, tactics: 2 });
  gwentDeck(f.first, "deckA0000000001", { quality: 1 });
  const invite = await f.request(f.a, "challenge", null, { game: "gwent", opponentId: f.b.id, actorUuid: f.first.uuid, stake: 20, deckId: "deckA0000000001" });
  assert.ok(invite.reply.ok, invite.reply.error); const table = invite.table;
  assert.deepEqual(table.whisper, []); assert.equal(pokerState(table).game, "gwent"); assert.deepEqual(pokerState(table).seats[0].deck, { name: "Колода Севера", quality: 1, fakes: 0, fakeDc: 0 });
  await f.request(f.b, "accept", table, { actorUuid: f.second.uuid }); assert.equal(pokerState(table).phase, "playing");
  const early = await f.request(f.a, "roll", table); assert.equal(early.reply.ok, false, "Poker moves are refused at a gwent table");
  f.rolls.push([1], [5]); await f.request(f.a, "play", table, { skill: "gambling" });
  const first = pokerState(table).rounds[0].plays[0];
  assert.deepEqual([first.card.name, first.skillValue, first.deck, first.die, first.total], ["Карта героя", 9, 1, 5, 18]);
  const twice = await f.request(f.a, "play", table, { skill: "gambling" }); assert.equal(twice.reply.ok, false);
  f.rolls.push([2], [3]); await f.request(f.b, "play", table, { skill: "tactics" });
  assert.equal(pokerState(table).rounds[0].plays[1].total, 7 - 3 + 3); assert.deepEqual(pokerState(table).score, [1, 0]); assert.equal(pokerState(table).round, 2);
  f.rolls.push([5], [6], [9], [2]); await f.request(f.a, "play", table, { skill: "gambling" }); await f.request(f.b, "play", table, { skill: "gambling" });
  assert.equal(pokerState(table).phase, "finished"); assert.equal(pokerState(table).winner, 0); assert.deepEqual(pokerState(table).score, [2, 0]);
  assert.equal(f.first.system.crowns, 120); assert.equal(f.second.system.crowns, 80);
  assert.ok(pokerCard(pokerState(table)).includes("Счёт раундов: 2 : 0"));
});
test("forged gwent cards add their bonus and a spotted forgery loses the match", async () => {
  const f = fixture(); skilled(f.first, { gambling: 2, tactics: 0 }); skilled(f.second, { gambling: 2, tactics: 0, awareness: 6 });
  gwentDeck(f.first, "deckA0000000001", { forgeries: [15, 13] });
  const invite = await f.request(f.a, "challenge", null, { game: "gwent", opponentId: f.b.id, actorUuid: f.first.uuid, stake: 10, deckId: "deckA0000000001", fakes: true });
  const table = invite.table; assert.deepEqual(pokerState(table).seats[0].deck, { name: "Колода Севера", quality: 0, fakes: 2, fakeDc: 13 });
  await f.request(f.b, "accept", table, { actorUuid: f.second.uuid });
  f.rolls.push([5], [4], [1]); await f.request(f.a, "play", table, { skill: "gambling" });
  const play = pokerState(table).rounds[0].plays[0]; assert.equal(play.total, 4 + 7 + 1 + 2); assert.equal(play.spotted, false, "Awareness 1 + 11 misses the weakest forgery (DC 13)");
  const note = f.messages.find(message => message.flags?.[SYS]?.pokerNote); assert.deepEqual(note.whisper, [f.gm.id]);
  f.rolls.push([5], [1]); await f.request(f.b, "play", table, { skill: "gambling" });
  assert.equal(pokerState(table).phase, "playing"); assert.deepEqual(pokerState(table).score, [1, 0]);
  const caught = fixture(); skilled(caught.first, { gambling: 2, tactics: 0 }); skilled(caught.second, { gambling: 2, tactics: 0, awareness: 6 });
  gwentDeck(caught.first, "deckA0000000001", { forgeries: [12] });
  const other = (await caught.request(caught.a, "challenge", null, { game: "gwent", opponentId: caught.b.id, actorUuid: caught.first.uuid, stake: 10, deckId: "deckA0000000001", fakes: true })).table;
  await caught.request(caught.b, "accept", other, { actorUuid: caught.second.uuid });
  caught.rolls.push([1], [10], [1]); await caught.request(caught.a, "play", other, { skill: "gambling" });
  caught.rolls.push([2], [1]); await caught.request(caught.b, "play", other, { skill: "gambling" });
  const state = pokerState(other); assert.equal(state.reason, "caught"); assert.deepEqual(state.caught, [0]); assert.equal(state.winner, 1);
  assert.equal(caught.first.system.crowns, 90); assert.equal(caught.second.system.crowns, 110);
});
test("a gwent deck must belong to the player and be carried", async () => {
  const f = fixture(); gwentDeck(f.second, "deckB0000000001");
  const stolen = await f.request(f.a, "challenge", null, { game: "gwent", opponentId: f.b.id, actorUuid: f.first.uuid, stake: 0, deckId: "deckB0000000001" }); assert.equal(stolen.reply.ok, false);
  gwentDeck(f.first, "deckA0000000001").system.carried = false;
  const stored = await f.request(f.a, "challenge", null, { game: "gwent", opponentId: f.b.id, actorUuid: f.first.uuid, stake: 0, deckId: "deckA0000000001" }); assert.equal(stored.reply.ok, false);
  const tavern = await f.request(f.a, "challenge", null, { game: "gwent", opponentId: f.b.id, actorUuid: "", stake: 0 }); assert.equal(tavern.reply.ok, true);
});
