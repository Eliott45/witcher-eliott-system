import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { creatureSkillAttribute } from "../scripts/data/creatures.mjs";
import { deriveStatistics, ATTRIBUTE_KEYS } from "../scripts/data/statistics.mjs";
import { actorEnvironment } from "../scripts/combat/environment.mjs";
import { creatureRegeneration } from "../scripts/data/creature-regeneration.mjs";
import { regenerationAtStart } from "../scripts/workshop/witcher-elixirs.mjs";

test("wild creatures use their printed instinct INT only for awareness and survival, including wounds",()=>{
  for(const intelligence of [6,7,8]) {
    const system={parent:{items:[{type:"ability",system:{ruleId:"creature.wild"},flags:{[SYSTEM_ID]:{wildIntelligence:intelligence}}}]},statistics:{}};
    for(const key of ["awareness","wildernessSurvival"])assert.equal(creatureSkillAttribute(system,key).value,intelligence);
    assert.equal(creatureSkillAttribute(system,"education"),null);
    system.statistics.wounded=true;assert.equal(creatureSkillAttribute(system,"awareness").value,Math.floor(intelligence/2));
    system.statistics.dying=true;assert.equal(creatureSkillAttribute(system,"awareness").value,Math.floor(intelligence/3));
    delete system.parent.items[0].flags;system.statistics={};assert.equal(creatureSkillAttribute(system,"awareness").value,7);
  }
});

test("creature night vision removes dim-light penalties but does not grant vision in darkness",()=>{
  const system={attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,7])),health:{value:35,max:35}};
  const vision={type:"ability",system:{ruleId:"creature.night-vision"}};
  const penalties=(light,items=[])=>deriveStatistics(system,{items,environment:actorEnvironment({statuses:new Set()},{flags:{[SYSTEM_ID]:{environment:{light}}}})}).modifiers.filter(modifier=>modifier.source==="environment");
  assert.equal(penalties("dim").find(modifier=>modifier.target==="skills.awareness").value,-2);
  assert.deepEqual(penalties("dim",[vision]),[]);
  assert.deepEqual(penalties("dark",[vision]),penalties("dark"));
});

test("creature regeneration respects suppression, katakan sunlight and death without suppressing unrelated potion healing",()=>{
  const actor={effects:[],items:[{type:"ability",flags:{[SYSTEM_ID]:{regeneration:5,regenerationSunlight:3}}}],system:{creature:{regenerationMode:"normal"}}};
  assert.equal(regenerationAtStart(actor).total,5);
  assert.deepEqual(creatureRegeneration(actor).options.map(option=>option.id),["normal","suppressed","sunlight"]);
  actor.system.creature.regenerationMode="sunlight";assert.equal(regenerationAtStart(actor).total,3);
  actor.system.creature.regenerationMode="suppressed";assert.equal(regenerationAtStart(actor).total,0);
  actor.effects.push({statuses:new Set(),flags:{[SYSTEM_ID]:{consumable:{ruleId:"decoction.troll"}}}});
  assert.equal(regenerationAtStart(actor).total,5);
  actor.effects.push({statuses:new Set(["dead"])});assert.equal(regenerationAtStart(actor).total,0);
  actor.effects.at(-1).disabled=true;assert.equal(regenerationAtStart(actor).total,5);
  delete actor.items[0].flags[SYSTEM_ID].regenerationSunlight;
  assert.equal(creatureRegeneration(actor).options.some(option=>option.id==="sunlight"),false);
  actor.items=[];assert.equal(creatureRegeneration(actor).available,false);
});
