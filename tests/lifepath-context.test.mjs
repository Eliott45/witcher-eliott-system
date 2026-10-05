import { test } from "node:test";
import assert from "node:assert/strict";
import { lifepathContext, nextRecordAge } from "../scripts/sheets/lifepath-context.mjs";

globalThis.game = { i18n: { localize: key => key } };
const actor = (decades = [], events = []) => ({ system: {
  details: { race: "witcher", age: 110 }, lifepath: { witcher: { decades }, events }
} });

test("both lifepaths sort numerically by age without changing persisted arrays or equal-age order", () => {
  const decades = Object.freeze([30, 40, 20, 100, 20].map((age, i) => Object.freeze({ id: `d${i}`, age, outcome: "nothing" })));
  const events = Object.freeze([40, 20, 100, 30].map((age, i) => Object.freeze({ id: `e${i}`, age, kind: "ally" })));
  const character = actor(decades, events), before = JSON.stringify(character);
  const context = lifepathContext(character);
  assert.deepEqual(context.decades.map(entry => entry.id), ["d2", "d4", "d0", "d1", "d3"]);
  assert.deepEqual(context.decades.map(entry => entry.ageLabel), ["20–29", "20–29", "30–39", "40–49", "100–109"]);
  assert.deepEqual(context.events.map(entry => entry.ageLabel), ["20", "30", "40", "100"]);
  assert.equal(JSON.stringify(character), before);
});

test("ally and enemy details stay in separate sections; hidden outcomes cannot leak into summaries", () => {
  const character = actor([{ id: "history", age: 40, risk: "risky", outcome: "ally", notes: "История\nЕщё строка",
    ally: { name: "Настя", gender: "Женский", occupation: "Друг детства", alive: "Жив", deathCause: "Скрытая причина" },
    hunt: { monster: "Неактивная охота" }, danger: { kind: "enemy" }, enemy: { name: "Враг", gender: "Мужской", cause: "Предательство" }
  }]);
  const entry = lifepathContext(character).decades[0];
  assert.equal(entry.title, "Союзник · Настя");assert.match(entry.subtitle, /Рискованно/);
  assert.deepEqual(entry.groups.map(group => group.key), ["ally", "danger"]);
  assert.equal(entry.groups[1].title, "Опасность · Враг");
  assert.ok(entry.groups[0].fields.some(field => field.value === "Настя"));
  assert.ok(!entry.groups[0].fields.some(field => field.value === "Враг"));
  assert.ok(entry.groups[1].fields.some(field => field.value === "Предательство"));
  assert.ok(!JSON.stringify(entry).includes("Неактивная охота"));assert.ok(!JSON.stringify(entry).includes("Скрытая причина"));
  assert.equal(entry.notes, "История\nЕщё строка");
  const dangerOnly = lifepathContext(actor([{id:"danger",age:20,outcome:"nothing",danger:{kind:"wound"}}])).decades[0];
  assert.equal(dangerOnly.groups[0].showTitle, true, "An unfilled danger still has a visible type");
});

test("editing age repositions the same record and preserves its collapse preference and controls", () => {
  const character = actor([{id:"later",age:40,outcome:"hunt",hunt:{category:"Вампиры"},danger:{kind:"none"}}, {id:"earlier",age:30,outcome:"nothing"}]);
  const preferences = {collapsed:{"lifepath-decade-later":true}};
  assert.equal(lifepathContext(character, preferences).decades[1].open, false);
  character.system.lifepath.witcher.decades[0].age = 20;
  const moved = lifepathContext(character, preferences).decades[0];
  assert.equal(moved.id,"later");assert.equal(moved.open,false);assert.equal(moved.editAction,"editDecade");assert.equal(moved.removeAction,"removeDecade");
  assert.equal(moved.title,"Охота · Вампиры");assert.equal(moved.quiet,"Без опасностей");assert.equal(moved.groups.length,1);
});

test("suggested ages follow the latest saved age rather than the number or order of entries", () => {
  assert.equal(nextRecordAge([]),10);assert.equal(nextRecordAge([],20),20);
  assert.equal(nextRecordAge([{age:30},{age:40},{age:20}],20),50);
  assert.equal(nextRecordAge([{age:100},{age:20}]),110);
});
