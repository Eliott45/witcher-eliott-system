import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { CONDITION_BY_ID, effectRules } from "../scripts/data/condition-definitions.mjs";
import { proneContentUpdate, migrateEffectContent, EFFECT_CONTENT_VERSION } from "../scripts/migrations/effect-content.mjs";

const oldEffect = () => ({ id: "prone", name: "Сбит с ног", statuses: new Set(["prone"]),
  description: "<p>−2 к атаке и защите, пока персонаж не потратит перемещение, чтобы встать. Стр. 163.</p>",
  duration: {value:2, units:"rounds"}, start: {time:123}, disabled: true,
  flags: {[SYSTEM_ID]: {condition: {action:"Встать — потратить перемещение", modifiers:[{target:"combat.attack",value:-2}]}, conditionState:{lastSaveTurn:"old"}}} });
function patch(target, changes) {
  for (const [path, value] of Object.entries(changes)) {
    const keys=path.split("."), key=keys.pop(); let parent=target;
    for (const part of keys) parent=parent[part]??={};
    parent[key]=value;
  }
}

test("existing prone effects get the new name and movement text without losing timers or custom rules", () => {
  const effect=oldEffect();
  patch(effect,proneContentUpdate(effect));
  assert.equal(effect.name,"Ничком");
  assert.match(effect.description,/всё передвижение за текущий ход/);
  assert.equal(effectRules(effect).action,"Встать — всё передвижение");
  assert.deepEqual(effect.duration,{value:2,units:"rounds"});
  assert.deepEqual(effect.start,{time:123});
  assert.equal(effect.disabled,true);
  assert.deepEqual(effectRules(effect).modifiers,[{target:"combat.attack",value:-2}]);
  assert.equal(effect.flags[SYSTEM_ID].conditionState.lastSaveTurn,"old");
  assert.deepEqual(proneContentUpdate(effect),{});
  effect.name="Моё состояние";effect.description="Заметки игрока";effect.flags[SYSTEM_ID].condition.action="Поднять союзником";
  assert.deepEqual(proneContentUpdate(effect),{});
});

test("legacy prone effects without rule flags retain both combat penalties after migration", () => {
  const effect=oldEffect(); delete effect.flags;
  patch(effect,proneContentUpdate(effect));
  assert.deepEqual(effectRules(effect).modifiers,CONDITION_BY_ID.prone.rules.modifiers);
  assert.equal(effectRules(effect).action,"Встать — всё передвижение");
  assert.deepEqual(proneContentUpdate({statuses:new Set(["stunned"])}),{});
});

test("migration updates actor, unlinked token and effect-item copies once",async()=>{
  let version=7,writes=0;
  const owner=uuid=>({uuid,effects:[oldEffect()],items:[],async updateEmbeddedDocuments(type,updates){
    assert.equal(type,"ActiveEffect");writes++;for(const update of updates)patch(this.effects[0],update);
  }});
  const actor=owner("Actor.a"),token=owner("Scene.s.Token.t.Actor.a"),item=owner("Item.i"),ownedItem=owner("Actor.a.Item.i");
  actor.items=[ownedItem];
  const gm={};globalThis.game={user:gm,users:{activeGM:gm},actors:[actor],items:[item],
    scenes:[{tokens:[{actorLink:false,actor:token}]}],i18n:{localize:key=>key},
    settings:{get:()=>version,async set(_system,_key,value){version=value;}},
    packs:new Map([[`${SYSTEM_ID}.effects`,{collection:`${SYSTEM_ID}.effects`,locked:false,async getIndex(){return new Map();}}]])};
  globalThis.foundry={documents:{ActiveEffect:{implementation:{async createDocuments(sources){return sources;},async updateDocuments(){}}}}};
  await migrateEffectContent();
  assert.equal(version,EFFECT_CONTENT_VERSION);assert.equal(writes,4);
  for(const parent of [actor,token,item,ownedItem])assert.equal(parent.effects[0].name,"Ничком");
  await migrateEffectContent();assert.equal(writes,4);
});
