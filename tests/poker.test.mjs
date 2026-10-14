import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { pokerHand, comparePoker, rerollIndices, wagerAmount, requirePokerAction } from "../scripts/minigames/poker-rules.mjs";
import { pokerState, pokerReceipt, processPokerRequest, pokerWrite, recoverPokerBank, resumePoker, pokerTables } from "../scripts/minigames/poker-service.mjs";

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
    const value = { uuid: `Actor.${owner.id}`, name, type: "character", isOwner: true, system: { crowns: money }, items: [], flags: {},
      testUserPermission: user => user?.isGM || user?.id === owner.id, async update(update) { if (this.failUpdate?.(update)) throw new Error("Wallet unavailable"); apply(this, update); return this; } };
    actors.push(value); return value;
  };
  const first = actor(a, "Геральт", 100), second = actor(b, "Лютик", 100), host = actor(gm, "Трактирщик", 100);
  globalThis.game = { user: gm, users, actors, messages };
  globalThis.ui = { notifications: { warn() {} } };
  globalThis.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0 } };
  globalThis.foundry = { utils: { deepClone: structuredClone }, documents: { ChatMessage: { implementation: { async create(data) { return make(data); } } } } };
  globalThis.Roll = class { constructor(formula) { this.count = Number(formula.split("d")[0]); } async evaluate() { rolled++; const dice = rolls.shift() ?? Array(this.count).fill(1); assert.equal(dice.length, this.count); this.dice = [{ results: dice.map(result => ({ result, active: true })) }]; return this; } };
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
  assert.equal(f.first.system.crowns, 90); assert.equal(f.second.system.crowns, 90);
  await f.open(table);
  f.rolls.push([6, 6, 6]); const draw = await f.request(f.a, "reroll", table, { indices: [2, 3, 4] });
  assert.equal(draw.reply.done, true); assert.deepEqual(draw.reply.dice, [1, 1, 6, 6, 6]);
  assert.ok(!draw.response.whisper.includes(f.b.id)); assert.ok(draw.response.whisper.includes(f.gm.id));
  assert.deepEqual(pokerState(table).hands[0], [1, 1, 2, 3, 4], "The opponent sees the opening hand until both finish");
  await f.request(f.b, "reroll", table, { indices: [] });
  await f.request(f.a, "finish", table); const finish = await f.request(f.b, "finish", table);
  assert.equal(pokerState(table).phase, "finished"); assert.equal(pokerState(table).winner, 0);
  assert.equal(f.first.system.crowns, 110); assert.equal(f.second.system.crowns, 90);
  await processPokerRequest(finish.request, f.b.id); await recoverPokerBank(table); await resumePoker();
  assert.equal(f.first.system.crowns, 110); assert.equal(f.second.system.crowns, 90); assert.equal(f.rolled(), 3);
});
test("draws return both stakes and playing a GM without an actor works with no stakes", async () => {
  const f = fixture(), table = await f.start(20);
  f.rolls.push([4, 4, 4, 4, 4], [4, 4, 4, 4, 4]);
  for (const user of [f.a, f.b]) await f.request(user, "roll", table);
  for (const user of [f.a, f.b]) { await f.request(user, "reroll", table, { indices: [] }); await f.request(user, "finish", table); }
  assert.equal(pokerState(table).winner, null); assert.equal(f.first.system.crowns, 100); assert.equal(f.second.system.crowns, 100);
  const next = await f.start(0, f.gm, null); assert.equal(pokerState(next).phase, "opening");
  await f.request(f.gm, "concede", next); assert.equal(pokerState(next).winner, 0); assert.equal(f.first.system.crowns, 100);
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
  const abort = await f.request(f.a, "abort", table); assert.equal(abort.reply.ok, false);
});
test("both players can move concurrently but duplicated moves cannot generate more dice", async () => {
  const f = fixture(), table = await f.start(0);
  await Promise.all([f.request(f.a, "roll", table), f.request(f.a, "roll", table), f.request(f.b, "roll", table)]);
  assert.equal(f.rolled(), 2); assert.equal(pokerState(table).phase, "drawing");
  f.rolls.push([2, 3], [4]);
  await Promise.all([f.request(f.a, "reroll", table, { indices: [0, 2] }), f.request(f.b, "reroll", table, { indices: [3] })]);
  assert.equal(f.rolled(), 4);
  await Promise.all([f.request(f.a, "finish", table), f.request(f.b, "finish", table)]); assert.equal(pokerState(table).phase, "finished");
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
test("loaded dice change one result privately, require the actual item, and cannot be used twice", async () => {
  const f = fixture(), table = await f.start(0); await f.open(table);
  await f.request(f.a, "reroll", table, { indices: [] });
  const denied = await f.request(f.a, "finish", table, { cheat: { index: 0, value: 6 } }); assert.equal(denied.reply.ok, false);
  f.first.items.push({ system: { ruleId: "gear.loaded-dice", quantity: 1, carried: true } });
  const accepted = await f.request(f.a, "finish", table, { cheat: { index: 0, value: 6 } }); assert.equal(accepted.reply.ok, true);
  assert.deepEqual(accepted.reply.dice, [6, 1, 2, 3, 4]); assert.ok(!accepted.response.whisper.includes(f.b.id));
  const again = await f.request(f.a, "finish", table, { cheat: { index: 1, value: 6 } }); assert.equal(again.reply.ok, false);
  assert.deepEqual(pokerState(table).hands[0], [1, 1, 2, 3, 4]);
  const fake = f.make({ author: f.a.id, flags: { [SYS]: { pokerTable: { version: 1 }, pokerReceipt: { requestId: "fake", done: true, dice: [6, 6, 6, 6, 6] } } } });
  assert.ok(!pokerTables().includes(fake));
});
