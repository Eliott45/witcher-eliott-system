import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { applyGrappleSuccess, grappleState, releaseIncorporealGrapple, rollGrappleAction } from "../scripts/combat/grapple.mjs";

const patch = (owner, changes) => { for (const [path, value] of Object.entries(changes)) { const keys=path.split("."),last=keys.pop();let target=owner;for(const key of keys)target=target[key]??={};target[last]=value; } };
function fixture(t, { spirit = true, infinite = false } = {}) {
  const previous=Object.fromEntries(["game","canvas","foundry","fromUuidSync"].map(key=>[key,globalThis[key]]));
  t.after(()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
  const messages=[],rolls=[],writes=[];
  const actor=id=>({id,uuid:`Actor.${id}`,name:id,type:"npc",isOwner:true,items:[],effects:[],
    system:{creature:{category:"humanoid"},attributes:{},skills:{brawling:5,dodgeEscape:5},stamina:{value:30,max:30},statistics:{effective:{reflex:5,body:5,dexterity:5},modifiers:[]}},
    async update(changes){writes.push({id,changes});patch(this,changes);},
    async createEmbeddedDocuments(type,sources){assert.equal(type,"ActiveEffect");const created=sources.map((source,i)=>({...source,id:`effect${this.effects.length+i}`,statuses:new Set(source.statuses)}));this.effects.push(...created);return created;},
    async deleteEmbeddedDocuments(type,ids){assert.equal(type,"ActiveEffect");this.effects=this.effects.filter(effect=>!ids.includes(effect.id));}});
  const attacker=actor("attacker"),target=actor("target");
  if(spirit)target.items.push({type:"ability",system:{ruleId:"creature.incorporeal"}});
  if(infinite)target.items.push({type:"ability",system:{ruleId:"creature.infinite-stamina"}});
  const scene={id:"scene",tokens:[]};
  const token=subject=>({id:subject.id,uuid:`Scene.scene.Token.${subject.id}`,documentName:"Token",name:subject.name,actor:subject,parent:scene,x:0,y:0,rotation:0,sight:{angle:360},getSize:()=>({width:100,height:100})});
  const from=token(attacker),to=token(target);scene.tokens=[from,to];
  globalThis.fromUuidSync=uuid=>scene.tokens.find(token=>token.uuid===uuid);
  globalThis.canvas={scene,tokens:{controlled:[]}};
  globalThis.game={user:{isGM:true,targets:new Set([to])},i18n:{localize:text=>text},users:{},settings:{get:()=>"public"}};
  globalThis.foundry={dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){this.total=6;rolls.push(this);return this;}}},documents:{ChatMessage:{async create(data){messages.push(data);return data;}}}};
  const message=kind=>({id:`attack-${kind}`,speaker:{},flags:{[SYSTEM_ID]:{weaponAttack:{special:kind,attacker:from.uuid,target:to.uuid,damage:"1d6"}}},async update(changes){patch(this,changes);}});
  return {attacker,target,from,to,message,messages,rolls,writes};
}

test("incorporeal targets reject physical wrestling before a die is rolled",async t=>{
  const f=fixture(t);
  await assert.rejects(rollGrappleAction(f.attacker,"grapple"),/Бесплотная/);
  assert.equal(f.rolls.length,0);assert.equal(f.messages.length,0);assert.equal(f.writes.length,0);
});

test("every physical special rechecks incorporeality at application and does not create a one-sided hold",async t=>{
  const f=fixture(t);
  for(const kind of ["grapple","pin","choke","throw","trip","weapon-trip","disarm","disarm-take","weapon-disarm"]) {
    const message=f.message(kind);await applyGrappleSuccess(message);await applyGrappleSuccess(message);
  }
  assert.equal(f.messages.length,9);assert.ok(f.messages.every(message=>message.content.includes("бесплотен")));
  assert.equal(f.rolls.length,0);assert.equal(f.writes.length,0);
  assert.deepEqual(f.target.effects,[]);assert.deepEqual(f.attacker.effects,[]);
});

test("a materialized spirit can be held, then leaves the old hold when incorporeality returns",async t=>{
  const f=fixture(t);f.target.system.creature.spiritMode="suppressed";
  await applyGrappleSuccess(f.message("grapple"));await applyGrappleSuccess(f.message("choke"));
  assert.equal(grappleState(f.attacker).holding.actor,f.target);assert.equal(grappleState(f.target).heldBy.actor,f.attacker);
  assert.ok(f.target.effects.every(effect=>effect.flags[SYSTEM_ID].condition.physical));
  f.target.effects.push({id:"unrelated",statuses:new Set(["bleeding"]),flags:{}});
  f.target.system.creature.spiritMode="normal";
  assert.equal(grappleState(f.attacker).holding,null,"a spirit cannot serve as a living shield while cleanup is pending");
  assert.equal(grappleState(f.target).heldBy,null);
  await releaseIncorporealGrapple(f.target);
  assert.deepEqual(f.attacker.effects,[]);assert.deepEqual(f.target.effects.map(effect=>effect.id),["unrelated"]);
});

test("throwing a golem preserves infinite stamina while an ordinary victim takes the rolled loss",async t=>{
  const f=fixture(t,{spirit:false,infinite:true});
  await applyGrappleSuccess(f.message("throw"));
  assert.equal(f.target.system.stamina.value,30);assert.equal(f.writes.length,0);assert.match(f.messages.at(-1).content,/бесконечная ВЫН/);
  f.target.items=[];await applyGrappleSuccess(f.message("throw"));
  assert.equal(f.target.system.stamina.value,24);assert.equal(f.writes.length,1);
});
