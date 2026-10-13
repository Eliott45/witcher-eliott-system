import test from "node:test";
import assert from "node:assert/strict";
import { radolfNPCSource } from "../scripts/data/radolf-npc.mjs";
import { deriveStatistics } from "../scripts/data/statistics.mjs";
import { skillValue } from "../scripts/data/skills.mjs";
import { getProfessionAbility, professionAbilityState } from "../scripts/data/professions.mjs";
import { transportSpeed } from "../scripts/data/transport.mjs";

test("Radolf preserves printed skill bases, languages and derived dwarven statistics without double bonuses",()=>{
  const actor=radolfNPCSource();actor.system.abilityState={};actor.system.parent=actor;
  actor.items=actor.items.map(item=>({...item,id:item._id}));
  actor.system.statistics=deriveStatistics(actor.system,{items:actor.items});
  const stats=actor.system.statistics;
  assert.deepEqual([stats.healthMax,stats.staminaMax,stats.stun,stats.run,stats.leap,stats.recovery,stats.carryMax,stats.naturalArmor],[35,35,7,15,3,7,95,2]);
  const bases={gambling:15,athletics:12,brawling:11,pickLock:9,awareness:13,wildernessSurvival:12,deduction:9,intimidation:13,
    trapCrafting:11,crafting:8,sleightOfHand:14,deceit:16,education:10,streetwise:12,forgery:14,humanPerception:16,
    physique:13,stealth:15,resistMagic:12,resistCoercion:17,endurance:13,business:14,persuasion:17,charisma:17,courage:14,dodgeEscape:13};
  for(const [key,base] of Object.entries(bases))assert.equal(skillValue(actor.system,key).total,base,key);
  for(const language of actor.system.languages)assert.equal(skillValue(actor.system,"language",language.id).total,10);
  for(const [id,base] of [["well-traveled",15],["market",13],["connections",14],["rags",16],["fence",14],["warrior-debt",13]]) {
    const state=professionAbilityState(actor,getProfessionAbility(`profession.merchant.${id}`));
    assert.equal(state.attribute+state.level+state.bonus,base,id);
  }
  const mule=actor.items.find(item=>item.system.ruleId==="transport.mule"),cart=actor.items.find(item=>item.system.ruleId==="transport.cart");
  assert.equal(cart.system.transport.mountId,mule.id);assert.equal(transportSpeed(cart,actor.items),8);
  assert.equal(actor.system.crowns,1250);
  assert.deepEqual(actor.system.creature.loot,[{name:"Обычные предметы",formula:"1d6",currency:false}]);
  assert.deepEqual(actor.items.filter(item=>item.system.kind==="ammunition").map(item=>item.system.quantity),[20,5,5]);
});
