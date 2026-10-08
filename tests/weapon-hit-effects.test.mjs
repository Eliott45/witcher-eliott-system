import test from "node:test";
import assert from "node:assert/strict";
import { weaponHitTraits, weaponConditionChances, rollWeaponConditions, applyWeaponConditions } from "../scripts/combat/weapon-hit-effects.mjs";
import { ammunitionWeapon, chooseArrow } from "../scripts/combat/bow-ammo.mjs";
import { bestiarySources } from "../scripts/data/bestiary.mjs";
import { armorAt } from "../scripts/combat/damage-rules.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

test("natural attack types and separate worn archer armor are ready before any loot is generated",()=>{
  const sources=bestiarySources();
  for(const actor of sources) for(const item of actor.items.filter(item=>item.type==="weapon"&&item.system.natural)) assert.ok(/[РКДС]/u.test(item.system.damageType),`${actor.name}: ${item.name}`);
  const archer=sources.find(actor=>actor.name.startsWith("Лучник"));
  assert.equal(archer.system.creature.naturalArmor,0);
  const armor=archer.items.filter(item=>item.type==="armor");
  assert.equal(armor.length,3);
  for(const item of armor){item.id=item._id;assert.equal(item.system.equipped,true);assert.equal(item.system.stoppingPower.value,5);}
  armor.find(item=>item.system.zone==="head").system.stoppingPower.value=4;
  assert.equal(armorAt(archer,"head").sp,4);assert.equal(armorAt(archer,"torso").sp,5);assert.equal(armorAt(archer,"leftLeg").sp,5);
  assert.ok(!archer.system.harvest.some(row=>armor.some(item=>row.uuid.endsWith(item.flags.core.sourceId.split('.').at(-1)))));
});

test("bleed and poison need penetrating injury; burning can ignite armor; incorporeality prevents all three",()=>{
  const traits=weaponHitTraits({properties:"Кровопускающее (25%); Отравление (75%); Горение (100%)"});
  assert.deepEqual(weaponConditionChances(traits,{total:0,penetrated:false}).map(row=>row.id),["burning"]);
  assert.deepEqual(weaponConditionChances(traits,{total:5,penetrated:false}).map(row=>row.id),["burning"],"critical bonus alone does not poison through intact armor");
  assert.equal(weaponConditionChances(traits,{total:5,penetrated:true}).length,3);
  assert.equal(weaponConditionChances(traits,{total:5,penetrated:true},{nonLethal:true}).length,1);
  assert.deepEqual(weaponConditionChances(traits,{total:0,penetrated:false,immune:true}),[]);
  assert.deepEqual(weaponHitTraits({properties:"Разрушающее; нельзя парировать; двойной урон оружию, щиту или броне"}),{bleeding:0,poisoned:0,burning:0,ablating:true,noParry:true,wearMultiplier:2});
});

test("percentile effects respect chance boundaries, immunity, blind dice and guaranteed elf bleeding",async t=>{
  const old=globalThis.foundry;t.after(()=>{globalThis.foundry=old;});
  const rolls=[25,76],options=[];
  globalThis.foundry={dice:{Roll:class{constructor(formula){assert.equal(formula,"1d100");} async evaluate(option){options.push(option);this.total=rolls.shift();return this;}}}};
  const actor={items:[],effects:[]};
  const result=await rollWeaponConditions(actor,{bleeding:25,poisoned:75,burning:100},{total:9,penetrated:true},{blind:true});
  assert.deepEqual(result.effects.map(effect=>effect.applied),[true,false,true]);assert.equal(result.rolls.length,2);
  assert.ok(options.every(option=>option.allowInteractive===false));
  actor.items=[{type:"ability",system:{ruleId:"creature.poison-immunity"}}];
  const immune=await rollWeaponConditions(actor,{poisoned:75},{total:9,penetrated:true});
  assert.equal(immune.effects[0].immune,true);assert.equal(immune.rolls.length,0);
  const elf=await rollWeaponConditions(actor,{bleeding:100},{total:9,penetrated:true},{ammunition:{ruleId:"ammunition.elven-burrowing"}});
  assert.equal(elf.effects[0].burrowing,true);
});

test("bow ammunition is validated before rolling and supplies the damage type and effects",async()=>{
  const bow={type:"weapon",system:{skill:"archery"}},ammo={id:"arrows",name:"Стрелы",type:"equipment",system:{kind:"ammunition",quantity:2,damageType:"К",properties:"Кровопускающее (100%)",ruleId:"ammunition.elven-burrowing"}};
  const actor={items:[ammo]},selected=await chooseArrow(actor,bow,2,"arrows");
  assert.equal(selected.count,2);assert.equal(ammo.system.quantity,2,"selection does not consume before a successful attack message");
  assert.deepEqual(ammunitionWeapon({damageType:"Д",properties:"Длинное"},selected),{damageType:"К",properties:"Длинное; Кровопускающее (100%)"});
  await assert.rejects(chooseArrow(actor,bow,3,"arrows"),/Недостаточно/);
  await assert.rejects(chooseArrow(actor,bow,1,"gone"),/недоступны/);
  assert.equal(await chooseArrow(actor,{type:"weapon",system:{skill:"crossbow"}},1),null);
});

test("burrowing arrows create the DC16 First Aid bleeding variant and upgrade existing ordinary bleeding",async()=>{
  const sources=[],actor={effects:[],async createEmbeddedDocuments(_type,data){sources.push(...data);}};
  await applyWeaponConditions(actor,[{id:"bleeding",applied:true,burrowing:true}]);
  assert.equal(sources[0].flags[SYSTEM_ID].condition.save.dc,16);assert.equal(sources[0].flags[SYSTEM_ID].condition.save.skill,"firstAid");
  let update;actor.effects=[{statuses:new Set(["bleeding"]),async update(data){update=data;}}];
  await applyWeaponConditions(actor,[{id:"bleeding",applied:true,burrowing:true}]);
  assert.equal(sources.length,1);assert.equal(update.flags[SYSTEM_ID].condition.save.dc,16);
});
