import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentEntry } from '../scripts/data/equipment-search.mjs';
import { installOwnedUpgrade, installCatalogUpgrade, installUpgrade, canInstall } from '../scripts/workshop/upgrades.mjs';
import { effectiveItem } from '../scripts/data/workshop.mjs';

test('fractional upgrade mass is formatted, without rounding stored calculations', () => {
 const item={type:'armor',system:{weight:2,installations:[{bonuses:[{target:'weight',value:1/6}]}]}};
 const entry=equipmentEntry(item);
 assert(entry.summary.startsWith('2.167 кг'));assert.equal(entry.weight,2+1/6);
});

function catalogFixture(type='weapon') {
 const key=type==='armor'?'stoppingPower':'reliability';
 const target={id:'target',type,name:'Предмет',system:{zone:'head',quantity:1,enhancementSlots:1,weight:2,[key]:{value:5,max:10},installations:[]}};
 const source={id:'source',uuid:'Compendium.witcher-eliott-system.equipment.Item.upgrade',_stats:{},type:'equipment',name:'Улучшение',system:{ruleId:type==='armor'?'armor-upgrade.test':'rune.test',quantity:0,carried:false,weight:3,kind:'upgrade',properties:'Бонус',upgrade:{category:type==='armor'?'armor':'rune',target:type,zones:['head','torso','legs'],bonuses:[{target:key,value:2}]}}};
 const actor={uuid:'Actor.catalog',isOwner:true,items:new Map([[target.id,target]]),
   async updateEmbeddedDocuments(_type,changes){for(const change of changes)for(const [key,value]of Object.entries(change)){if(key==='_id')continue;const parts=key.split('.');let obj=this.items.get(change._id);for(const part of parts.slice(0,-1))obj=obj[part];obj[parts.at(-1)]=value;}},
   async createEmbeddedDocuments(){assert.fail('Manual installation must not create spare parts');}};
 target.actor=actor;
 globalThis.game={user:{isGM:false},settings:{get:()=> 'public'},i18n:{localize:key=>key},packs:new Map([['witcher-eliott-system.equipment',{getDocuments:async()=>[source]}]]),items:[]};
 globalThis.foundry={utils:{randomID:()=> 'new',deepClone:structuredClone,getProperty:(o,p)=>p.split('.').reduce((v,k)=>v[k],o)},documents:{ChatMessage:{getSpeaker:()=>({}),create:async()=>{}}}};
 return {actor,target,source,key};
}

test('catalogue installation needs no inventory source, preserves definitions and applies full bonuses',async()=>{
 for(const type of ['weapon','armor']) {
  const {actor,target,source,key}=catalogFixture(type),before=structuredClone(source);
  assert.equal(canInstall(target,source),false,'Ordinary installation still requires stock');
  await installCatalogUpgrade(target,source);
  assert.deepEqual(source,before);
  assert.equal(actor.items.size,1);
  assert.equal(target.system[key].value,7);
  assert.equal(effectiveItem(target)[key].max,12);
  assert.equal(effectiveItem(target).weight,type==='armor'?3:2);
  assert.equal(target.system.installations[0].ruleId,source.system.ruleId);
  assert.equal(target.system.installations[0].sourceUuid,source.uuid);
 }
});

test('the direct sheet action offers compatible catalogue and world upgrades even with no stock',async()=>{
 const {target,source}=catalogFixture(),world={...structuredClone(source),uuid:'Item.custom',name:'Своя руна'};
 const wrong={...structuredClone(source),uuid:'Item.glyph'};wrong.system.upgrade.target='armor';
 game.items=[world,wrong];
 let picker;
 foundry.applications={handlebars:{renderTemplate:async(_path,data)=>{picker=data;return 'picker';}},api:{DialogV2:{wait:async()=>world.uuid}}};
 await installUpgrade(target,{withoutCheck:true});
 assert.deepEqual(picker.entries.map(entry=>entry.id),[source.uuid,world.uuid]);
 assert.match(picker.hintKey,/не требуются/);
 assert.equal(target.system.installations[0].name,world.name);
 assert.equal(world.system.quantity,0);
});

test('catalogue installation enforces compatibility, zones, ownership, single items and concurrent slot limits',async()=>{
 let f=catalogFixture();f.actor.isOwner=false;await installCatalogUpgrade(f.target,f.source);assert.equal(f.target.system.installations.length,0);
 f=catalogFixture();f.source.system.upgrade.target='armor';await assert.rejects(installCatalogUpgrade(f.target,f.source),/не подходит/);
 f=catalogFixture('armor');f.source.system.upgrade.zones=['legs'];await assert.rejects(installCatalogUpgrade(f.target,f.source),/не подходит/);
 f=catalogFixture();f.target.system.quantity=2;await assert.rejects(installCatalogUpgrade(f.target,f.source),/один экземпляр/);
 f=catalogFixture();const result=await Promise.allSettled([installCatalogUpgrade(f.target,f.source),installCatalogUpgrade(f.target,f.source)]);
 assert.deepEqual(result.map(entry=>entry.status),['fulfilled','rejected']);
 assert.equal(f.target.system.installations.length,1);
 assert.equal(f.source.system.quantity,0);
});

test('cancelling catalogue selection does not change the item or open a second confirmation',async()=>{
 const {target}=catalogFixture();
 foundry.applications={handlebars:{renderTemplate:async()=> 'picker'},api:{DialogV2:{wait:async()=>null}}};
 await installUpgrade(target,{withoutCheck:true});
 assert.equal(target.system.installations.length,0);
});
test('an owning player can install without a roll/tools, while consuming a part and preserving remaining zones', async () => {
 const target={id:'armor',type:'armor',name:'Капюшон',system:{zone:'head',quantity:1,enhancementSlots:1,stoppingPower:{value:5,max:5},installations:[]}};
 const source={id:'upgrade',uuid:'Item.upgrade',_stats:{},type:'equipment',name:'Накладка',system:{quantity:1,weight:3,carried:true,kind:'upgrade',properties:'ПБ +2',upgrade:{category:'armor',target:'armor',zones:['head','torso','legs'],bonuses:[{target:'stoppingPower',value:2}]}}};
 let created=[];
 const actor={uuid:'Actor.test',isOwner:true,items:new Map([[target.id,target],[source.id,source]]),updateEmbeddedDocuments:async(_type,changes)=>{for(const c of changes)for(const [k,v] of Object.entries(c)){if(k==='_id')continue;const parts=k.split('.');let o=actor.items.get(c._id);for(const part of parts.slice(0,-1))o=o[part];o[parts.at(-1)]=v;}},createEmbeddedDocuments:async(_type,data)=>(created=data),update:async()=>{}};
 target.actor=actor;source.actor=actor;
 globalThis.game={user:{isGM:false},items:{fromCompendium:item=>({type:item.type,system:structuredClone(item.system)})},settings:{get:()=> 'public'}};
 globalThis.foundry={utils:{randomID:()=> 'new',deepClone:structuredClone,getProperty:(o,p)=>p.split('.').reduce((v,k)=>v[k],o)},documents:{ChatMessage:{getSpeaker:()=>({}),create:async()=>{}}}};
 await installOwnedUpgrade(target,source,{withoutCheck:true});
 assert.equal(source.system.quantity,0);assert.equal(target.system.stoppingPower.value,7);
 assert.equal(target.system.installations.length,1);assert.equal(target.system.installations[0].weight,1);
 assert.deepEqual(created[0].system.upgrade.zones,['torso','legs']);
 await assert.rejects(installOwnedUpgrade(target,source,{withoutCheck:true}),/недоступна/);
 actor.isOwner=false;await installOwnedUpgrade(target,source,{withoutCheck:true});assert.equal(target.system.installations.length,1);
});
