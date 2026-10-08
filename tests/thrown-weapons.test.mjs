import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { thrownWeaponPlan, settleThrownWeapon } from "../scripts/combat/thrown-weapons.mjs";
import { processLootRequest } from "../scripts/loot/loot.mjs";
import { weaponReadiness } from "../scripts/combat/weapon-rules.mjs";

const collection = list => Object.assign(list, { get: id => list.find(row => row.id === id) });
const put=(object,path,value)=>{const keys=path.split(".");for(const key of keys.slice(0,-1))object=object[key]??={};object[keys.at(-1)]=value;};
function fixture() {
  let serial=0;const next=()=>`id${++serial}`,docs=new Map(),notices=[];
  const scene={id:"scene",grid:{size:100,distance:2},tokens:collection([]),
    async createEmbeddedDocuments(_type,data){return data.map(source=>makeToken(makeActor("loot",source.name),source));}};
  function makeItem(actor,source) {
    const item={...structuredClone(source),id:source._id??next(),actor,parent:actor,
      async update(changes){for(const [path,value]of Object.entries(changes))put(this,path,value);return this;},
      async delete(){if(this.failDelete)throw new Error("delete failed");actor.items.splice(actor.items.indexOf(this),1);if(this.failAfterDelete)throw new Error("late delete failed");},
      toObject(){return {_id:this.id,name:this.name,type:this.type,system:structuredClone(this.system),flags:structuredClone(this.flags??{})};}};
    item.uuid=`${actor.uuid}.Item.${item.id}`;docs.set(item.uuid,item);return item;
  }
  function makeActor(type,name) {
    const actor={id:next(),type,name,uuid:`Actor.${next()}`,isOwner:true,flags:{},system:{removeWhenEmpty:type==="loot"},items:collection([]),
      testUserPermission:()=>actor.isOwner,
      async update(changes){for(const [path,value]of Object.entries(changes))put(this,path,value);return this;},
      async createEmbeddedDocuments(_type,sources){const created=sources.map(source=>makeItem(this,source));this.items.push(...created);return created;},
      async deleteEmbeddedDocuments(_type,ids){this.items.splice(0,this.items.length,...this.items.filter(row=>!ids.includes(row.id)));},
      async getTokenDocument(source){return {toObject:()=>source};}};
    return actor;
  }
  function makeToken(actor,source={}) {
    const token={id:next(),uuid:`Scene.scene.Token.${next()}`,name:actor.name,actor,parent:scene,x:0,y:0,...source,getSize:()=>({width:100,height:100}),
      async delete(){scene.tokens.splice(scene.tokens.indexOf(this),1);},async update(changes){Object.assign(this,changes);}};
    scene.tokens.push(token);docs.set(token.uuid,token);return token;
  }
  const actor=makeActor("character","Ведьмак"),attacker=makeToken(actor),target=makeToken(makeActor("npc","Цель"),{x:400,y:100});actor.token=attacker;
  const item=makeItem(actor,{_id:"thorn",name:"Шип",type:"weapon",system:{quantity:1,equipped:true,carried:true,category:"melee",ruleId:"relic.thorn",properties:"Пробивающее броню",
    oil:{sourceUuid:"Item.oil",target:"specter",bonus:5,expiresAt:200},installations:[{ruleId:"rune.perun",category:"rune",bonuses:[]}]}});actor.items.push(item);
  const quote={weapon:{...structuredClone(item.system),category:"thrown"},attack:{count:1}},context={attacker,target};
  const gm={id:"gm",isGM:true},player={id:"player",isGM:false};
  globalThis.game={user:gm,users:{activeGM:gm},time:{worldTime:10},actors:collection([actor]),scenes:collection([scene])};globalThis.canvas={scene};
  globalThis.fromUuidSync=uuid=>docs.get(uuid);
  globalThis.CONST={DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2},TOKEN_DISPOSITIONS:{NEUTRAL:0},TOKEN_DISPLAY_MODES:{HOVER:1}};
  globalThis.ui={notifications:{error:message=>notices.push(message)}};
  globalThis.foundry={utils:{randomID:next},documents:{Actor:{implementation:{create:async source=>{const template=makeActor(source.type,source.name);template.flags=source.flags;game.actors.push(template);return template;}}},ChatMessage:{getSpeaker:()=>({}),create:async data=>data}}};
  const plan=()=>thrownWeaponPlan(actor,item,quote,{targetContext:context});
  const message=()=>{const value={id:next(),uuid:`ChatMessage.${next()}`,speakerActor:actor,flags:{[SYS]:{weaponAttack:{itemId:item.id,thrown:true,...plan()}}},
    async update(changes){for(const [path,value]of Object.entries(changes))put(this,path,value);return this;}};docs.set(value.uuid,value);return value;};
  return {actor,item,quote,context,scene,plan,message,player,gm,makeActor,makeToken,makeItem,docs,notices};
}

test("throwing snapshots oil/runes and uses the aiming point on the actor's scene",()=>{
  const f=fixture(),plan=f.plan();
  assert.deepEqual(plan.thrownDrop.point,{x:450,y:150});assert.equal(plan.thrownDrop.sceneId,"scene");
  f.item.system.oil.bonus=9;f.quote.weapon.oil.bonus=9;
  assert.equal(plan.weaponSnapshot.system.oil.bonus,5);assert.equal(plan.weaponSnapshot.system.installations[0].ruleId,"rune.perun");assert.equal(plan.attackTime,10);
  f.quote.weapon.category="melee";assert.equal(f.plan(),null);
});

test("missing GM, ownership, target point, queued transfers and insufficient quantity fail before a roll",()=>{
  const f=fixture();game.user=f.player;game.users.activeGM=null;
  assert.throws(()=>f.plan(),/мастер/);game.users.activeGM=f.gm;
  f.actor.isOwner=false;assert.throws(()=>f.plan(),/доступа/);f.actor.isOwner=true;
  assert.throws(()=>thrownWeaponPlan(f.actor,f.item,f.quote),/точку/);
  f.actor.flags[SYS]={lootRequest:{itemId:"other"}};assert.throws(()=>f.plan(),/предыдущего/);f.actor.flags={};
  f.quote.attack.count=2;assert.throws(()=>f.plan(),/Недостаточно/);
  assert.equal(f.item.system.equipped,true);assert.equal(f.actor.items.length,1);
});

test("successful throw moves one physical copy, records its UUID and cannot be replayed",async()=>{
  const f=fixture(),message=f.message();
  await Promise.all([settleThrownWeapon(f.actor,f.item,message),settleThrownWeapon(f.actor,f.item,message)]);
  assert.equal(f.actor.items.length,0);assert.equal(f.item.system.equipped,false);
  const pile=f.scene.tokens.find(token=>token.actor.type==="loot");assert.equal(pile.x,425);assert.equal(pile.y,125);assert.equal(pile.actor.items.length,1);
  const dropped=pile.actor.items[0];assert.equal(dropped.system.oil.bonus,5);assert.equal(dropped.system.equipped,false);
  assert.equal(message.flags[SYS].weaponAttack.groundWeaponUuid,dropped.uuid);assert.equal(message.flags[SYS].weaponAttack.thrownDrop.state,"complete");
  await settleThrownWeapon(f.actor,f.item,message);assert.equal(pile.actor.items.length,1);
});

test("a player immediately loses the equipped weapon while the GM processes its single request",async()=>{
  const f=fixture();game.user=f.player;const message=f.message();
  await settleThrownWeapon(f.actor,f.item,message);assert.equal(f.item.system.equipped,false);assert.equal(f.actor.items.length,1);
  // Even a separate equipment update cannot reuse a weapon whose GM transfer is still pending.
  f.item.system.equipped=true;
  assert.match(weaponReadiness(f.actor,f.item),/уже брошено/);
  assert.equal(weaponReadiness(f.actor,{...f.item,id:"different"}),"Возьмите оружие в руки");
  assert.equal(f.actor.flags[SYS].lootRequest.thrownAttack,message.uuid);assert.equal(message.flags[SYS].weaponAttack.thrownDrop.state,"pending");
  const request=f.actor.flags[SYS].lootRequest;
  await settleThrownWeapon(f.actor,f.item,message);assert.equal(f.actor.flags[SYS].lootRequest,request);
  await processLootRequest(f.actor,request,f.player);assert.equal(f.actor.items.length,0);assert.equal(message.flags[SYS].weaponAttack.thrownDrop.state,"complete");
});

test("failed reduction rolls back only its new ground copies; the posted weapon stays unequipped",async()=>{
  const f=fixture(),pile=f.makeToken(f.makeActor("loot","Чужая добыча"),{x:425,y:125});
  const old=f.makeItem(pile.actor,{_id:"old",name:"Монета",type:"equipment",system:{quantity:1}});pile.actor.items.push(old);
  f.item.failDelete=true;const message=f.message();
  await assert.rejects(settleThrownWeapon(f.actor,f.item,message),/delete failed/);
  assert.equal(f.actor.items.length,1);assert.equal(f.item.system.equipped,false);assert.equal(message.flags[SYS].weaponAttack.thrownDrop.state,"failed");
  assert.deepEqual(pile.actor.items.map(item=>item.id),["old"]);
  f.item.failDelete=false;await settleThrownWeapon(f.actor,f.item,message);assert.equal(pile.actor.items.length,2);assert.equal(f.actor.items.length,0);
});

test("late source deletion failures restore the original item and remove a newly created empty pile",async()=>{
  const f=fixture(),message=f.message();f.item.failAfterDelete=true;
  await assert.rejects(settleThrownWeapon(f.actor,f.item,message),/late delete failed/);
  assert.equal(f.actor.items.get("thorn").system.oil.bonus,5);assert.equal(f.actor.items.get("thorn").system.equipped,false);
  assert.equal(f.scene.tokens.some(token=>token.actor.type==="loot"),false);
});

test("failed throw receipts roll back the physical transfer before a retry can spend another item",async()=>{
  const f=fixture();f.item.system.quantity=3;const message=f.message(),update=message.update.bind(message);
  message.update=async changes=>{
    if(Object.hasOwn(changes,`flags.${SYS}.weaponAttack.groundWeaponUuid`))throw new Error("receipt failed");
    return update(changes);
  };
  await assert.rejects(settleThrownWeapon(f.actor,f.item,message),/receipt failed/);
  assert.equal(f.item.system.quantity,3);assert.equal(f.item.system.equipped,false);
  assert.equal(f.scene.tokens.some(token=>token.actor.type==="loot"),false);
  assert.equal(message.flags[SYS].weaponAttack.thrownDrop.state,"failed");
  message.update=update;await settleThrownWeapon(f.actor,f.item,message);
  assert.equal(f.item.system.quantity,2);
  assert.equal(f.scene.tokens.find(token=>token.actor.type==="loot").actor.items[0].system.quantity,1);
});
