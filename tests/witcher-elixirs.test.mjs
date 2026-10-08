import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { temporaryHealth, elixirArmor, elixirDamage, criticalLocationBonus, regenerationAtStart, onDamaged, onHit, onKill, checkMedallions } from "../scripts/workshop/witcher-elixirs.mjs";

const doseEffect = (ruleId, extra = {}) => ({ disabled: false, isSuppressed: false, duration: {}, statuses: new Set(), flags: { [SYSTEM_ID]: { consumable: { ruleId }, condition: {}, ...extra } },
  async update(changes) { for (const [path, value] of Object.entries(changes)) { const keys = path.split(".").slice(1); let owner = this.flags; for (const key of keys.slice(0, -1)) owner = owner[key] ??= {}; owner[keys.at(-1)] = value; } } });
const actor = (...effects) => ({ effects, items: [], system: { statistics: { carryMax: 60 }, carriedWeight: 18 } });

test("Full Moon's 30 temporary HP absorb damage first (core p.247)", async () => {
  const a = actor(doseEffect("potion.full-moon"));
  assert.equal(temporaryHealth(a), 30);
  assert.equal((await onDamaged(a, 12)).absorbed, 12); assert.equal(temporaryHealth(a), 18);
  assert.equal((await onDamaged(a, 25)).absorbed, 18); assert.equal(temporaryHealth(a), 0);
});

test("Swallow, Troll and Grave Hag regenerate at the turn start; Swallow pauses after a hit", async () => {
  const swallow = doseEffect("potion.swallow"), a = actor(swallow, doseEffect("decoction.troll"));
  assert.equal(regenerationAtStart(a).total, 8);
  await onDamaged(a, 3);
  assert.equal(regenerationAtStart(a).total, 5);
  const hag = actor(doseEffect("decoction.grave-hag"));
  await onKill(hag); await onKill(hag);
  assert.equal(regenerationAtStart(hag).total, 4);
});

test("Griffin hardens after hits over 5; Arachas counts free carry; Wyvern grows and resets; Katakan +3; Blizzard +4 REF once", async () => {
  const griffin = actor(doseEffect("decoction.griffin"));
  await onDamaged(griffin, 5); assert.deepEqual(elixirArmor(griffin), []);
  await onDamaged(griffin, 6); await onDamaged(griffin, 9);
  assert.equal(elixirArmor(griffin)[0].sp, 4);
  assert.equal(elixirArmor(actor(doseEffect("decoction.arachas")))[0].sp, 8, "(60 − 18) / 10 → 4 × 2");
  const wyvern = actor(doseEffect("decoction.wyvern"));
  await onHit(wyvern); await onHit(wyvern);
  assert.equal(elixirDamage(wyvern)[0].value, 2);
  await onDamaged(wyvern, 1); assert.deepEqual(elixirDamage(wyvern), []);
  assert.equal(criticalLocationBonus(actor(doseEffect("decoction.katakan"))), 3);
  const blizzard = doseEffect("potion.blizzard"), b = actor(blizzard);
  await onKill(b); await onKill(b);
  assert.deepEqual(blizzard.flags[SYSTEM_ID].condition.modifiers, [{ target: "attributes.reflex", value: 4 }]);
});

test("mutation DC and mutagen sources follow p.251", async () => {
  const { mutationDC, mutagenFor } = await import("../scripts/workshop/mutagens.mjs");
  assert.equal(mutationDC({ system: { statistics: { effective: { body: 6, will: 7 } } } }), 22);
  assert.equal(mutagenFor({ type: "npc", name: "Накер-воин" })?.id, "mutagen.nekker");
  assert.equal(mutagenFor({ type: "npc", name: "Скальный тролль" })?.id, "mutagen.troll");
  assert.equal(mutagenFor({ type: "npc", name: "Бандит" }), null);
  assert.equal(mutagenFor({ type: "character", name: "Грифон" }), null);
});

test("medallions cannot sense a katakan even when visible or suppressed, but still sense nearby monsters",async()=>{
  const messages=[],gm={id:"gm",isSelf:true},owner={id:"owner"};
  globalThis.game={users:Object.assign([gm,owner],{activeGM:gm})};
  globalThis.foundry={utils:{escapeHTML:value=>value},documents:{ChatMessage:{getSpeaker:({token})=>({token:token.id}),create:async data=>messages.push(data)}}};
  const scene={id:"medallion-test",grid:{size:100,distance:2},tokens:[]};
  const makeToken=(id,subject,x=0)=>({id,uuid:`Scene.medallion-test.Token.${id}`,name:id,actor:subject,parent:scene,x,y:0,getSize:()=>({width:100,height:100})});
  const wearer={type:"character",items:[{system:{ruleId:"gear.witcher-medallion",quantity:1,carried:true}}],testUserPermission:user=>user.id==="owner"};
  const katakan={type:"npc",name:"Скрытый вампир",items:[{type:"ability",system:{ruleId:"creature.katakan.ability.0"}}],system:{creature:{category:"vampire",invisible:false}}};
  scene.tokens=[makeToken("witcher",wearer),makeToken("katakan",katakan,100)];
  await checkMedallions(scene);assert.equal(messages.length,0);
  katakan.system.creature.invisible=true;await checkMedallions(scene);assert.equal(messages.length,0);
  katakan.system.creature.spiritMode="suppressed";await checkMedallions(scene);assert.equal(messages.length,0);
  const ghoul={type:"npc",name:"Гуль",items:[],system:{creature:{category:"necrophage"}}};
  scene.tokens.push(makeToken("ghoul",ghoul,200));await checkMedallions(scene);
  assert.equal(messages.length,1);assert.deepEqual(messages[0].whisper,["owner"]);
  await checkMedallions(scene);assert.equal(messages.length,1,"an unchanged nearby monster does not repeat the warning");
  scene.tokens[2].x=2000;await checkMedallions(scene);scene.tokens[2].x=200;await checkMedallions(scene);
  assert.equal(messages.length,2,"leaving and returning triggers the medallion again");
});
