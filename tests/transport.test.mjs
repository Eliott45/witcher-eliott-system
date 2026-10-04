import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CORE_TRANSPORT, CORE_TACK} from '../scripts/data/core-transport.mjs';
import {isCarried,canContain} from '../scripts/data/containers.mjs';
import {carriedWeight,itemWeight} from '../scripts/data/physical-items.mjs';
import {inventoryContext} from '../scripts/sheets/inventory-context.mjs';
import {transportContext,fitTack,hitchTransport} from '../scripts/sheets/transport-context.mjs';
import {transportSpeed,canHitch} from '../scripts/data/transport.mjs';
import {available} from '../scripts/data/workshop.mjs';
const clone=(catalog,id,key)=>{const entry=structuredClone(catalog.find(item=>item.id===key));return {...entry,id,system:{...entry.system,quantity:1,carried:true,equipped:false,containerId:'',containerSection:''}}};
function fixture(){
 const horse=clone(CORE_TRANSPORT,'horse','transport.horse'),cart=clone(CORE_TRANSPORT,'cart','transport.cart'),bags=clone(CORE_TACK,'bags','tack.saddlebags'),saddle=clone(CORE_TACK,'saddle','tack.racing-saddle');
 const ore={id:'ore',name:'Груз',type:'equipment',system:{kind:'gear',quantity:1,weight:20,carried:true,containerId:'bags'}};
 bags.system.containerId=horse.id;
 const items=[horse,cart,bags,saddle,ore];items.get=id=>items.find(item=>item.id===id);
 const actor={uuid:'Actor.transport',isOwner:true,items,system:{statistics:{carryMax:100}},updateEmbeddedDocuments:async(_type,changes)=>{for(const c of changes)await items.get(c._id).update(c);}};
 for(const item of items){item.actor=actor;item.update=async changes=>{for(const [k,v]of Object.entries(changes)){if(!k.startsWith('system.'))continue;const path=k.split('.');let o=item;for(const p of path.slice(0,-1))o=o[p];o[path.at(-1)]=v;}};}
 return {actor,items,horse,cart,bags,saddle,ore};
}
test('catalog capacities are independent of mass, saddlebag halves and all eighteen stable entries are present',()=>{
 assert.equal(CORE_TRANSPORT.length,9);assert.equal(CORE_TACK.length,9);
 assert.equal(new Set([...CORE_TRANSPORT,...CORE_TACK].map(item=>item.documentId)).size,18);
 for(const item of CORE_TRANSPORT)assert.equal(itemWeight(item),0);
 assert.equal(CORE_TRANSPORT.find(item=>item.id==='transport.horse').system.capacity,100);
 assert.equal(CORE_TACK.find(item=>item.id==='tack.saddlebags').system.capacity,50);
});
test('horse, bag and nested cargo are absent from character load/crafting; cart load is independent',()=>{
 const {actor,items,horse,cart,bags,saddle,ore}=fixture();
 assert.equal(carriedWeight(items),3);assert.equal(isCarried(ore,items),false);assert.equal(available(ore),false);
 assert.equal(canContain(horse,bags,items),false);assert.equal(canContain(bags,horse,items),true);
 let inv=inventoryContext(actor), view=transportContext(actor,inv,horse.id);
 assert.equal(view.selected.contentsWeight,21.5);assert.equal(inv.groups.flatMap(g=>g.items).length,1);
 assert.deepEqual(inv.items.find(i=>i.id==='bags').cargoSections.map(s=>s.weight),[20,0]);
 ore.system.containerSection='right';ore.system.weight=30;
 inv=inventoryContext(actor);assert.equal(inv.items.find(i=>i.id==='bags').overloaded,true);
 ore.system.containerId=cart.id;
 inv=inventoryContext(actor);assert.equal(transportContext(actor,inv,horse.id).selected.contentsWeight,1.5);assert.equal(transportContext(actor,inv,cart.id).selected.contentsWeight,30);
 ore.system.containerId='';assert.equal(carriedWeight(items),33);
});
test('mount equipment and hitching use existing items, enforce one mount per wagon and ownership',async()=>{
 const {actor,items,horse,cart,saddle}=fixture();
 await fitTack(actor,horse.id,saddle.id,'saddle');assert.equal(saddle.system.equipped,true);assert.equal(carriedWeight(items),0);assert.equal(transportSpeed(horse,items),13);
 await hitchTransport(actor,cart.id,horse.id);assert.equal(transportSpeed(cart,items),12);
 const other=clone(CORE_TRANSPORT,'other','transport.carriage');items.push(other);
 assert.equal(canHitch(other,horse,items),false);await assert.rejects(hitchTransport(actor,cart.id,saddle.id),/подходит/);
 await fitTack(actor,horse.id,'','saddle');assert.equal(saddle.system.equipped,false);assert.equal(transportSpeed(cart,items),11);
 actor.isOwner=false;await hitchTransport(actor,cart.id,'');assert.equal(cart.system.transport.mountId,horse.id);
});
test('importing vehicles clears foreign hitches and deleting a mount preserves all cargo',async()=>{
 globalThis.foundry={documents:{Item:class{async _preUpdate(){} async _preDelete(){}}}};
 globalThis.ui={notifications:{warn(){}}};
 const {WitcherItem}=await import('../scripts/documents/witcher-item.mjs');
 const {actor,horse,cart,bags,ore}=fixture();cart.system.transport.mountId=horse.id;
 const doc=Object.assign(new WitcherItem(),horse);
 const update={'system.transport.health.value':200};await doc._preUpdate(update,{},{});assert.equal(update['system.transport.health.value'],40);
 await doc._preDelete({},{});assert.equal(cart.system.transport.mountId,'');assert.equal(bags.system.containerId,'');assert.equal(bags.system.carried,false);assert.equal(ore.system.containerId,bags.id);
});
