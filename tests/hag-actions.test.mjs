import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { hagCircleActive, hagModifiers } from "../scripts/data/hag-circle.mjs";
import { severHagTongue } from "../scripts/combat/hag-actions.mjs";
import { weaponReadiness } from "../scripts/combat/weapon-rules.mjs";

const hag=()=>({isOwner:true,type:"npc",items:[{type:"ability",system:{ruleId:"creature.grave-hag.1"}}],effects:[],flags:{[SYSTEM_ID]:{hagCircle:{scene:"s",x:50,y:50}}},
  token:{x:0,y:0,width:1,height:1,parent:{id:"s",grid:{size:100,distance:1}}},system:{health:{value:40},skills:{brawling:6,athletics:5}}});
test("a prepared skull circle grants +3 only within its own 100m area without altering base attributes",()=>{
  const actor=hag();assert.equal(hagCircleActive(actor),true);
  assert.deepEqual(hagModifiers(actor).map(row=>[row.target,row.value]),[["skills.brawling",3],["skills.athletics",3],["attributeCheck",3]]);
  actor.token.x=10000;assert.equal(hagCircleActive(actor),true);
  actor.token.x=10001;assert.equal(hagCircleActive(actor),false);
  actor.token.x=0;actor.token.parent.id="elsewhere";assert.equal(hagModifiers(actor).length,0);
});
test("a sharp parry severs a hag tongue once; blunt weapons do not, and the severed attack stays blocked",async t=>{
  const old={game:globalThis.game,foundry:globalThis.foundry};t.after(()=>Object.assign(globalThis,old));
  globalThis.game={settings:{get:()=>"gm"}};globalThis.foundry={documents:{ChatMessage:{getSpeaker:()=>({}),applyMode:data=>data,create:async data=>data}}};
  const actor=hag(),tongue={name:"Язык",system:{natural:true,equipped:true},async update(data){this.system.equipped=data["system.equipped"];}};
  actor.update=async patch=>{actor.system.health.value=patch["system.health.value"];actor.flags[SYSTEM_ID].severedTongue=patch[`flags.${SYSTEM_ID}.severedTongue`];};
  assert.equal(await severHagTongue(actor,tongue,{system:{damageType:"Д"}}),false);
  assert.equal(await severHagTongue(actor,tongue,{system:{damageType:"Р"}}),true);
  assert.equal(actor.system.health.value,35);assert.equal(tongue.system.equipped,false);
  assert.equal(await severHagTongue(actor,tongue,{system:{damageType:"К"}}),false);
  assert.equal(actor.system.health.value,35);assert.match(weaponReadiness(actor,tongue,tongue.system),/отрублен/);
});
