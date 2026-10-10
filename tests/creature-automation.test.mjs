import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { creatureSkillAttribute, immuneToCondition } from "../scripts/data/creatures.mjs";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { poisonDamage, bleedingDamage } from "../scripts/combat/poison-damage.mjs";
import { burningDamage } from "../scripts/combat/burning.mjs";
import { armorAt, resolveDamage } from "../scripts/combat/damage-rules.mjs";
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

test("construct immunity blocks only the printed physical conditions, even without a separate poison trait",()=>{
  const golem=bestiarySources().find(actor=>actor.name==="Голем");
  golem.effects=[];
  golem.items=golem.items.filter(item=>item.system.ruleId!=="creature.poison-immunity");
  for(const status of ["bleeding","burning","poisoned"])assert.equal(immuneToCondition(golem,new Set([status])),true,status);
  for(const status of ["prone","unconscious","stunned","blind"])assert.equal(immuneToCondition(golem,[status]),false,status);
  // Merely calling an Item a construct does not create an immunity.
  const imitation={effects:[],items:[{name:"Конструкция",type:"equipment",system:{ruleId:"creature.construct"}}]};
  assert.equal(immuneToCondition(imitation,["burning"]),false);
});

test("pre-existing poison, bleeding and burning cannot damage a construct with worn-away armor",()=>{
  const golem=bestiarySources().find(actor=>actor.name==="Голем");
  golem.system.creature.naturalArmor=0;
  golem.effects=["poisoned","bleeding","burning"].map(status=>({statuses:new Set([status])}));
  assert.equal(poisonDamage(golem),0);
  assert.equal(bleedingDamage(golem),0);
  assert.equal(burningDamage(golem),null,"no burning tick also prevents the periodic equipment-burning branch");
  // Immunity to the burning condition must not absorb a spell's direct fire damage.
  const direct=resolveDamage({base:20,location:"torso",multiplier:1,traits:{types:["elemental"],piercing:"none",silver:false},
    armor:{sp:0,layers:[],resistances:[],ablate:[]},monster:true});
  assert.equal(direct.total,20);
  golem.items=golem.items.filter(item=>!["creature.construct","creature.poison-immunity"].includes(item.system.ruleId));
  golem.system.creature.resistances="Р, К, кровотечение, яд";
  assert.equal(poisonDamage(golem),1,"the original poison resistance still applies to a non-construct");
  assert.equal(bleedingDamage(golem),1,"bleeding resistance is not immunity");
  assert.ok(burningDamage(golem).total>0,"ordinary monsters with the same states still burn");
});

test("barghests take no fire damage and never burn, but bites and blades still hurt them",()=>{
  const barghest=bestiarySources().find(actor=>actor.name==="Баргест");
  barghest.effects=[{statuses:new Set(["burning"])}];
  assert.equal(burningDamage(barghest),null);
  const armor=armorAt(barghest,"torso"),hit=types=>resolveDamage({base:20,location:"torso",multiplier:1,traits:{types,piercing:"none",silver:false},armor,monster:true});
  assert.equal(armor.fireImmune,true);
  assert.deepEqual([hit(["elemental"]).total,hit(["elemental"]).immune],[0,true]);
  assert.equal(hit(["slashing"]).total,10,"a steel blade is still halved by monster resistance");
  assert.equal(armorAt(bestiarySources().find(actor=>actor.name==="Волк"),"torso").fireImmune,undefined);
});
