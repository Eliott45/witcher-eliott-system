import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentEntry } from '../scripts/data/equipment-search.mjs';
import { installOwnedUpgrade } from '../scripts/workshop/upgrades.mjs';

test('fractional upgrade mass is formatted, without rounding stored calculations', () => {
 const item={type:'armor',system:{weight:2,installations:[{bonuses:[{target:'weight',value:1/6}]}]}};
 const entry=equipmentEntry(item);
 assert(entry.summary.startsWith('2.167 кг'));assert.equal(entry.weight,2+1/6);
});
test('an owning player can install without a roll/tools, while consuming a part and preserving remaining zones', async () => {
 const target={id:'armor',type:'armor',name:'Капюшон',system:{zone:'head',quantity:1,enhancementSlots:1,stoppingPower:{value:5,max:5},installations:[]}};
 const source={id:'upgrade',uuid:'Item.upgrade',_stats:{},type:'equipment',name:'Накладка',system:{quantity:1,weight:3,carried:true,kind:'upgrade',properties:'ПБ +2',upgrade:{category:'armor',target:'armor',zones:['head','torso','legs'],bonuses:[{target:'stoppingPower',value:2}]}}};
 let created=[];
 const actor={uuid:'Actor.test',isOwner:true,items:new Map([[target.id,target],[source.id,source]]),updateEmbeddedDocuments:async(_type,changes)=>{for(const c of changes)for(const [k,v] of Object.entries(c)){if(k==='_id')continue;const parts=k.split('.');let o=actor.items.get(c._id);for(const part of parts.slice(0,-1))o=o[part];o[parts.at(-1)]=v;}},createEmbeddedDocuments:async(_type,data)=>(created=data),update:async()=>{}};
 target.actor=actor;
 globalThis.game={user:{isGM:false},items:{fromCompendium:item=>({type:item.type,system:structuredClone(item.system)})},settings:{get:()=> 'public'}};
 globalThis.foundry={utils:{randomID:()=> 'new',deepClone:structuredClone,getProperty:(o,p)=>p.split('.').reduce((v,k)=>v[k],o)},documents:{ChatMessage:{getSpeaker:()=>({}),create:async()=>{}}}};
 await installOwnedUpgrade(target,source,{withoutCheck:true});
 assert.equal(source.system.quantity,0);assert.equal(target.system.stoppingPower.value,7);
 assert.equal(target.system.installations.length,1);assert.equal(target.system.installations[0].weight,1);
 assert.deepEqual(created[0].system.upgrade.zones,['torso','legs']);
 await assert.rejects(installOwnedUpgrade(target,source,{withoutCheck:true}),/недоступна/);
 actor.isOwner=false;await installOwnedUpgrade(target,source,{withoutCheck:true});assert.equal(target.system.installations.length,1);
});
