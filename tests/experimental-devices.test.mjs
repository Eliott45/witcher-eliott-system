import test from "node:test";
import assert from "node:assert/strict";
import { EXPERIMENTAL_DEVICES, EXPERIMENTAL_RECIPES } from "../scripts/data/experimental-devices.mjs";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { bombProfile, postDeviceBlast, applyBlast } from "../scripts/combat/bombs.mjs";
import { experimentalEffect, experimentalFrozen, clearExperimentalFreeze, markerBonus, mitigateMarker, furyTargetError } from "../scripts/combat/experimental-effects.mjs";
import { installTrap, triggerTrap, crossesTrap, checkTrap, registerExperimentalDevices } from "../scripts/combat/experimental-traps.mjs";
import { createDragonCloud, setCloudDrift, tickDragonClouds, igniteDragonClouds } from "../scripts/combat/dragon-clouds.mjs";
import { conditionRules } from "../scripts/combat/condition-rules.mjs";
import { deriveStatistics, ATTRIBUTE_KEYS } from "../scripts/data/statistics.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { craftingPreview } from "../scripts/workshop/crafting.mjs";

function patch(object,changes){for(const[path,value]of Object.entries(changes)){const keys=path.split('.'),last=keys.pop();keys.reduce((at,key)=>at[key]??={},object)[last]=value;}}
function merge(a,b){for(const[k,v]of Object.entries(b))a[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(a[k]??{},v):v;return a;}
function fixture(){
  const docs=new Map(),messages=[],totals=[],hooks=new Map(),gm={id:'gm',isGM:true};
  const scene={uuid:'Scene.devices',id:'devices',grid:{size:100,distance:2},regions:[],tokens:[],async createEmbeddedDocuments(type,sources){assert.equal(type,'Region');return sources.map(source=>{
    const region={...structuredClone(source),id:`r${docs.size}`,uuid:`Scene.devices.Region.r${docs.size}`,parent:scene,
      async update(changes){patch(this,changes);return this;},async delete(){scene.regions=scene.regions.filter(entry=>entry!==this);}};
    docs.set(region.uuid,region);scene.regions.push(region);return region;});}};
  docs.set(scene.uuid,scene);
  const actor=(name,x=0)=>{
    const a={name,uuid:`Actor.${name}`,id:name,type:'character',isOwner:true,isToken:true,flags:{},items:[],effects:[],
      system:{attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(key=>[key,8])),health:{value:200,max:200},stamina:{value:40,max:40},details:{},abilityState:{},skills:{endurance:5,physique:5,awareness:5,trapCrafting:5}},
      async update(changes){const {items,...rest}=changes;patch(this,rest);for(const row of items??[])patch(this.items.get(row._id),row);},
      async createEmbeddedDocuments(type,sources){assert.equal(type,'ActiveEffect');const made=sources.map(source=>{const effect={...structuredClone(source),id:`e${this.effects.length}`,parent:this,statuses:new Set(source.statuses),async update(changes){patch(this,changes);},async delete(){a.effects=a.effects.filter(row=>row!==this);}};this.effects.push(effect);return effect;});return made;},
      async deleteEmbeddedDocuments(_type,ids){this.effects=this.effects.filter(effect=>!ids.includes(effect.id));}};
    a.items.get=id=>a.items.find(item=>item.id===id);Object.defineProperty(a.system,'statistics',{get:()=>deriveStatistics(a.system,{items:a.items,effects:a.effects})});
    const token={uuid:`Scene.devices.Token.${name}`,id:name,name,actor:a,parent:scene,x,y:0,width:1,height:1,getSize:()=>({width:100,height:100}),async update(changes){patch(this,changes);}};
    a.token=token;scene.tokens.push(token);docs.set(token.uuid,token);docs.set(a.uuid,a);return a;
  };
  globalThis.game={user:gm,users:{activeGM:gm},scenes:[scene],time:{worldTime:0},settings:{get:()=>"public"},i18n:{localize:key=>key}};
  globalThis.canvas={scene,ping:()=>{},tokens:{controlled:[]}};
  globalThis.ui={notifications:{warn(){},info(){},error(){}}};globalThis.fromUuidSync=id=>docs.get(id);
  globalThis.Hooks={on:(name,fn)=>{hooks.set(name,[...(hooks.get(name)??[]),fn]);}};
  globalThis.foundry={utils:{mergeObject:merge},dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){this.total=totals.shift()??(/d100/.test(this.formula)?1:/d6/.test(this.formula)?10:20);return this;}}},documents:{ActiveEffect:{getEffectStart:()=>({time:game.time.worldTime})},ChatMessage:{getSpeaker:({actor})=>({actor:actor?.id}),applyMode:data=>data,async create(source){const msg={...structuredClone(source),id:`m${messages.length}`,uuid:`ChatMessage.m${messages.length}`,async update(changes){patch(this,changes);}};messages.push(msg);docs.set(msg.uuid,msg);return msg;}}}};
  const item=(a,id)=>{const row=EXPERIMENTAL_DEVICES.find(row=>row.id===id),item={...structuredClone(row),id:`i${a.items.length}`,system:{...structuredClone(row.system),ruleId:id,quantity:1,carried:true},async update(changes){patch(this,changes);}};a.items.push(item);return item;};
  return{scene,actor,item,messages,totals,hooks};
}

test('all 17 experimental recipes use exact existing components, printed 30 minutes and result batches',()=>{
  assert.equal(EXPERIMENTAL_DEVICES.length,10);assert.equal(EXPERIMENTAL_RECIPES.length,17);
  for(const row of EXPERIMENTAL_RECIPES){assert.equal(row.system.recipe.time,1800);assert.equal(row.flags[SYS].priceUnavailable,true);
    for(const component of row.system.recipe.components){assert.equal(component.substance,'');assert.ok(MATERIALS.some(item=>component.uuid.endsWith(item.documentId)),component.uuid);}
    assert.equal(row.system.recipe.quantity,row.id.includes('ammunition.')?5:1);
  }
  assert.equal(EXPERIMENTAL_RECIPES.find(row=>row.id==='formula.bomb.dancing-star').system.recipe.investment,108);
  assert.equal(EXPERIMENTAL_RECIPES.find(row=>row.id==='diagram.trap.talgar-winter').system.recipe.dc,18);
});

test('bomb crafting requires its exact linked ingredients, not interchangeable substances or an invented recipe price',async()=>{
  const f=fixture(),a=f.actor('crafter'),definition=EXPERIMENTAL_RECIPES.find(row=>row.id==='formula.bomb.dancing-star');
  const recipe={...structuredClone(definition),id:'recipe',system:{...structuredClone(definition.system),quantity:1,carried:true}};a.items.push(recipe);
  const references=new Map();
  for(const component of recipe.system.recipe.components){const row=MATERIALS.find(entry=>component.uuid.endsWith(entry.documentId));
    const reference={name:row.name,uuid:component.uuid,type:'equipment',documentName:'Item',system:{...structuredClone(row.system),ruleId:row.id},testUserPermission:()=>true};references.set(component.uuid,reference);
    a.items.push({...reference,id:row.documentId,system:{...reference.system,quantity:component.quantity,carried:true}});
  }
  references.set(recipe.system.recipe.resultUuid,{type:'equipment',system:{kind:'gear'},testUserPermission:()=>true});
  foundry.utils.fromUuid=async uuid=>references.get(uuid);
  assert.equal((await craftingPreview(a,recipe)).plan.complete,true);assert.equal(a.system.money,undefined);
  const flower=a.items.find(item=>item.system.ruleId==='material.hellebore');flower.system.ruleId='material.ginatia';flower.uuid='Actor.crafter.Item.wrong';
  assert.equal((await craftingPreview(a,recipe)).plan.complete,false,'another aether ingredient cannot replace hellebore');
  recipe.system.recipe.components[0].substance='aether';
  await assert.rejects(craftingPreview(a,recipe),/указанные материалы/);
});
test('Dragon Dream is gas, not an immediate 5d6 explosion; traps preserve their distinct conditions',()=>{
  const f=fixture(),a=f.actor('hero');
  const gas=bombProfile(f.item(a,'bomb.dragon-dream'));assert.equal(gas.gas,true);assert.equal(gas.damage,'');assert.equal(gas.burning,0);
  assert.equal(bombProfile(f.item(a,'bomb.dancing-star')).burning,100);
  assert.equal(bombProfile(f.item(a,'trap.claw')).bleeding,60);
  assert.equal(bombProfile(f.item(a,'trap.fury')).fury,true);
});
test('trap installation spends one item, crossing detection catches a pass-through and activation is idempotent',async()=>{
  const f=fixture(),a=f.actor('hero',-500),victim=f.actor('victim',0),item=f.item(a,'trap.biter');
  const region=await installTrap(a,item,{point:{x:50,y:50},triggerRadius:1,noticeDC:17,disarmDC:18});
  assert.equal(item.system.quantity,0);assert.equal(region.visibility,0);
  assert.equal(crossesTrap(region,{x:-100,y:50},{x:200,y:50}),true);
  assert.equal(crossesTrap(region,{x:-100,y:200},{x:200,y:200}),false);
  assert.equal(crossesTrap(region,{x:50,y:50},{x:200,y:50}),false);
  await Promise.all([triggerTrap(region),triggerTrap(region)]);
  assert.equal(region.flags[SYS].experimentalTrap.triggered,true);
  const hp=victim.system.health.value;assert.ok(hp<200);
  await triggerTrap(region);assert.equal(victim.system.health.value,hp);
});
test('GM-selected trap DC governs real detection and disarm checks, success disables the trigger',async()=>{
  const f=fixture(),a=f.actor('hero'),item=f.item(a,'trap.marker');
  const region=await installTrap(a,item,{point:{x:300,y:0},triggerRadius:1,noticeDC:17,disarmDC:18});
  f.totals.push(16);assert.equal(await checkTrap(a,region,'notice'),false);
  f.totals.push(18);assert.equal(await checkTrap(a,region,'disarm'),true);
  await triggerTrap(region);assert.equal(f.messages.filter(message=>message.flags?.[SYS]?.bomb).length,0);
});
test('alchemical freezing immobilizes but leaves actions available, uses DC18 and is removable by an actual hit',async()=>{
  const f=fixture(),a=f.actor('victim');await a.createEmbeddedDocuments('ActiveEffect',[experimentalEffect(a,'freeze')]);
  assert.equal(experimentalFrozen(a),true);assert.equal(a.effects[0].flags[SYS].condition.save.dc,18);assert.equal(a.effects[0].duration.value,8);
  assert.equal(conditionRules(a).canMove,false);assert.equal(conditionRules(a).canAct,true);assert.equal(a.system.statistics.run,0);
  await clearExperimentalFreeze(a);assert.equal(experimentalFrozen(a),false);assert.equal(conditionRules(a).canMove,true);
});
test('Fury rolls Endurance before applying and restricts attacks to the nearest live creature',async()=>{
  const f=fixture(),a=f.actor('victim'),near=f.actor('near',200),far=f.actor('far',700),item=f.item(a,'trap.fury');
  const message=await postDeviceBlast(a,f.scene,{x:50,y:50},{name:item.name,profile:bombProfile(item)});
  f.totals.push(17,18,18);await applyBlast(message);
  assert.equal(a.effects[0].flags[SYS].experimental.kind,'fury');assert.equal(near.effects.length,0);
  assert.equal(furyTargetError(a,near.token),'');assert.match(furyTargetError(a,far.token),/ближайшее/);
});
test('Marker has independent visual and scent mitigation; washing takes three full turns',async()=>{
  const f=fixture(),a=f.actor('victim');await a.createEmbeddedDocuments('ActiveEffect',[experimentalEffect(a,'marker')]);
  assert.equal(markerBonus(a),5);assert.equal(markerBonus(a,'scent'),5);
  for(let i=0;i<3;i++)await mitigateMarker(a,'wash');
  assert.equal(markerBonus(a),2);assert.equal(markerBonus(a,'scent'),5);assert.equal(a.effects[0].duration.value,86400);
  await mitigateMarker(a,'scent');assert.equal(markerBonus(a,'scent'),2);
});
test('gas cloud creates a native-shaped Region, moves by chosen distance and expires after three rounds',async()=>{
  const f=fixture(),a=f.actor('victim');game.combat={id:'c',started:true,round:1};f.totals.push(2);
  const message={uuid:'ChatMessage.gas',speakerActor:a};const region=await createDragonCloud(f.scene,{x:500,y:500},message);
  assert.equal(region.shapes[0].radiusX,400);assert.equal(region.flags[SYS].dragonCloud.drift,0);
  assert.equal(await createDragonCloud(f.scene,{x:500,y:500},message),region);
  await setCloudDrift(region,2);game.combat.round=2;await tickDragonClouds(f.scene,{move:true});
  assert.ok(Math.abs(Math.hypot(region.shapes[0].x-500,region.shapes[0].y-500)-100)<0.0001);
  const pos={x:region.shapes[0].x,y:region.shapes[0].y};await tickDragonClouds(f.scene,{move:true});assert.deepEqual({x:region.shapes[0].x,y:region.shapes[0].y},pos);
  game.combat.round=4;await tickDragonClouds(f.scene,{move:true});assert.equal(f.scene.regions.length,0);
});
test('flame ignites gas exactly once and applies its damage and burning to affected actors',async()=>{
  const f=fixture(),a=f.actor('victim');await createDragonCloud(f.scene,{x:50,y:50},{uuid:'ChatMessage.gas',speakerActor:a});
  await Promise.all([igniteDragonClouds(f.scene,{x:50,y:50}),igniteDragonClouds(f.scene,{x:50,y:50})]);
  assert.equal(f.scene.regions.length,0);assert.ok(a.system.health.value<200);
  assert.equal(a.effects.filter(effect=>effect.statuses.has('burning')).length,1);
});

test('retry after failed condition creation preserves rolled blast damage and private recipients',async()=>{
  const f=fixture(),a=f.actor('victim'),item=f.item(a,'bomb.dancing-star');
  const message=await postDeviceBlast(a,f.scene,{x:50,y:50},{name:item.name,profile:bombProfile(item),messageOptions:{whisper:['gm'],blind:true}});
  assert.deepEqual(message.whisper,['gm']);assert.equal(message.blind,true);
  const create=a.createEmbeddedDocuments.bind(a);let fail=true;
  a.createEmbeddedDocuments=async(...args)=>{if(fail)throw new Error('write interrupted');return create(...args);};
  await assert.rejects(applyBlast(message),/interrupted/);
  const damaged=a.system.health.value;assert.ok(damaged<200);assert.equal(message.flags[SYS].bomb.victims[0].damageApplied,true);
  fail=false;await applyBlast(message);
  assert.equal(a.system.health.value,damaged);assert.equal(a.effects.length,1);
  assert.deepEqual(f.messages.at(-1).whisper,['gm']);assert.equal(f.messages.at(-1).blind,true);
});

test('the token movement hooks automatically activate a hidden trap crossed in one move',async()=>{
  const f=fixture(),a=f.actor('victim',-500),item=f.item(a,'trap.marker');
  const region=await installTrap(a,item,{point:{x:50,y:50},triggerRadius:1,noticeDC:17,disarmDC:18});
  registerExperimentalDevices();const changes={x:200};
  for(const hook of f.hooks.get('preUpdateToken'))await hook(a.token,changes);
  Object.assign(a.token,changes);for(const hook of f.hooks.get('updateToken'))await hook(a.token,changes);
  assert.equal(region.flags[SYS].experimentalTrap.triggered,true);assert.equal(markerBonus(a),5);
});

test('an area hit destroys a noonwraith copy once instead of damaging its template actor',async()=>{
  const f=fixture(),a=f.actor('copy');a.flags[SYS]={noonCopy:{templateActor:a.id}};a.token.actorId=a.id;
  let removed=0;a.delete=async()=>removed++;game.actors=new Map([[a.id,a]]);
  f.scene.deleteEmbeddedDocuments=async(type,ids)=>{assert.equal(type,'Token');f.scene.tokens=f.scene.tokens.filter(token=>!ids.includes(token.id));};
  const message=await postDeviceBlast(a,f.scene,{x:50,y:50},{name:'Explosion',profile:{radius:4,damage:'4d6',stunSave:null,traits:{types:[],piercing:'none'}}});
  await applyBlast(message);await applyBlast(message);
  assert.equal(removed,1);assert.equal(a.system.health.value,200);assert.equal(message.flags[SYS].bomb.victims[0].copyDestroyed,true);
});
