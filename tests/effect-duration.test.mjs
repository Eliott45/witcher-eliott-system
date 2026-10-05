import { test } from 'node:test';
import assert from 'node:assert/strict';
import {formatEffectDuration,effectDurationLabel,durationEditValues,effectDurationUpdate} from '../scripts/data/effect-duration.mjs';
import {durationRollData,renderEffectDuration} from '../scripts/chat/effect-duration.mjs';
const scope='witcher-eliott-system';
test('effect durations use twenty three-second rounds per minute, then hours and days',()=>{
 for(const [value,units,expected] of [[1,'rounds','1 раунд'],[4,'rounds','4 раунда'],[10,'rounds','10 раундов'],[11,'rounds','11 раундов'],[20,'rounds','20 раундов'],[21,'rounds','1,05 мин.'],[60,'seconds','20 раундов'],[3599,'seconds','59,98 мин.'],[3600,'seconds','1 ч.'],[36000,'seconds','10 ч.'],[86400,'seconds','1 дн.'],[172800,'seconds','2 дн.']])assert.equal(formatEffectDuration(value,units),expected);
 assert.equal(effectDurationLabel({duration:{value:36000,units:'seconds',secondsRemaining:3600}}),'1 ч.');
 assert.equal(effectDurationLabel({duration:{expired:true,value:4,units:'rounds'}}),'Истёк');
 assert.equal(effectDurationLabel({duration:{value:null}}),'Без ограничения');
});
test('remaining-time edits restart only the clock, retain units and support unlimited durations',()=>{
 assert.deepEqual(durationEditValues({duration:{value:120,units:'seconds',secondsRemaining:60}}),{value:20,units:'rounds'});
 assert.deepEqual(durationEditValues({duration:{value:4,units:'seconds',secondsRemaining:4}}),{value:4,units:'seconds'});
 const start={time:123,round:8};
 const patch=effectDurationUpdate(1,'minutes',start);
 assert.equal(patch.duration.value,60);assert.equal(patch.duration.units,'seconds');assert.equal(patch.start,start);
 assert.equal(patch[`flags.${scope}.conditionDurationOverride`],true);
 assert.equal(patch.flags,undefined);assert.equal(patch.disabled,undefined);
 assert.equal(effectDurationUpdate(20,'rounds',start).duration.value,20);
 assert.equal(effectDurationUpdate(1,'days',start).duration.value,86400);
 assert.equal(effectDurationUpdate(NaN,'unlimited',start).duration.value,null);
 assert.throws(()=>effectDurationUpdate(-1,'seconds',start));assert.throws(()=>effectDurationUpdate(1.5,'rounds',start));assert.throws(()=>effectDurationUpdate(1,'wrong',start));
});
test('new and old system duration rolls are readable without changing native totals or private data',()=>{
 const old={isContentVisible:true,flags:{[scope]:{skipLuck:true}},flavor:'Длительность: Ароматное зелье',rolls:[{formula:'1d10 * 3600',total:36000}]};
 assert.deepEqual(durationRollData(old),{value:36000,units:'seconds'});
 const node={classList:{add(){}},textContent:'36000'},html={querySelector:()=>node};
 renderEffectDuration(old,html);assert.equal(node.textContent,'10 ч.');assert.equal(old.rolls[0].total,36000);assert.equal(node.title,'36000 секунд');
 assert.equal(durationRollData({...old,flavor:'Damage'}),null);
 node.textContent='???';renderEffectDuration({...old,isContentVisible:false},html);assert.equal(node.textContent,'???');
 const fresh={...old,flags:{[scope]:{effectDuration:{value:8,units:'rounds'}}}};renderEffectDuration(fresh,html);assert.equal(node.textContent,'8 раундов');
});
