import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectItemSource, applyEffectItem } from '../scripts/data/effect-items.mjs';
import { SYSTEM_ID } from '../scripts/config.mjs';
import { activePowerBenefits } from '../scripts/magic/power-place-rules.mjs';
import { effectDurationUpdate } from '../scripts/data/effect-duration.mjs';

test('effect items retain native rules and duration without carrying runtime requests or inventory weight',async()=>{
 const original={_id:'old',name:'Мой эффект',img:'icons/svg/aura.svg',description:'<p>Описание</p>',changes:[{key:'system.attributes.body',mode:2,value:'1'}],statuses:['frozen'],start:{time:5},disabled:true,transfer:true,duration:{value:60,units:'seconds',expired:true},flags:{[SYSTEM_ID]:{condition:{save:{kind:'skill',dc:16}},conditionDurationOverride:true,conditionState:{lastSaveTurn:'old'},conditionRequest:{id:'old'}}}};
 const source=effectItemSource(original),template=source.effects[0];
 assert.equal(source.type,'effect');assert.deepEqual(source.system,{});
 assert.equal(template.start,null);assert.equal(template.transfer,false);assert.equal(template.disabled,false);assert.equal(template.duration.expired,false);
 assert.deepEqual(template.changes,original.changes);assert.equal(template.flags[SYSTEM_ID].conditionState,undefined);assert.equal(original.flags[SYSTEM_ID].conditionState.lastSaveTurn,'old');
 globalThis.game={user:{id:'player'}};
 let written;
 const actor={isOwner:true,async createEmbeddedDocuments(type,data){written={type,data};return data;}};
 const item={...source,uuid:'Item.custom',effects:[template],testUserPermission:()=>true};
 await applyEffectItem(actor,item);
 assert.equal(written.type,'ActiveEffect');assert.equal(written.data[0].origin,'Item.custom');assert.equal(written.data[0].duration.value,60);
 actor.isOwner=false;written=null;await applyEffectItem(actor,item);assert.equal(written,null);
 actor.isOwner=true;item.testUserPermission=()=>false;await applyEffectItem(actor,item);assert.equal(written,null);
});

test('editing an existing place-of-power effect updates its real expiration, including unlimited time',()=>{
 const effect={flags:{[SYSTEM_ID]:{powerPlace:{element:'fire',expiresAt:3600}}}};
 const actor={effects:[effect]};
 assert.equal(activePowerBenefits(actor,100).length,1,'Legacy flag-only benefits still work');
 const change=effectDurationUpdate(1,'minutes',{time:100});
 Object.assign(effect,{duration:change.duration,start:change.start});
 effect.flags[SYSTEM_ID].conditionDurationOverride=true;
 assert.equal(activePowerBenefits(actor,159).length,1);
 assert.equal(activePowerBenefits(actor,160).length,0,'The edited native duration wins over the old expiry flag');
 effect.duration=effectDurationUpdate(0,'unlimited',{time:100}).duration;
 assert.equal(activePowerBenefits(actor,9999).length,1);
 effect.duration.expired=true;assert.equal(activePowerBenefits(actor,9999).length,0);
});
