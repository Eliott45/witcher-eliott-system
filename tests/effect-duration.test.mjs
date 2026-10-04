import { test } from 'node:test';
import assert from 'node:assert/strict';
import {formatEffectDuration,effectDurationLabel} from '../scripts/data/effect-duration.mjs';
import {durationRollData,renderEffectDuration} from '../scripts/chat/effect-duration.mjs';
const scope='witcher-eliott-system';
test('effect durations switch after ten rounds, sixty minutes and twenty-four hours',()=>{
 for(const [value,units,expected] of [[1,'rounds','1 раунд'],[4,'rounds','4 раунда'],[10,'rounds','10 раундов'],[11,'rounds','0,55 мин.'],[60,'seconds','1 мин.'],[3599,'seconds','59,98 мин.'],[3600,'seconds','1 ч.'],[36000,'seconds','10 ч.'],[86400,'seconds','1 дн.'],[172800,'seconds','2 дн.']])assert.equal(formatEffectDuration(value,units),expected);
 assert.equal(effectDurationLabel({duration:{value:36000,units:'seconds',secondsRemaining:3600}}),'1 ч.');
 assert.equal(effectDurationLabel({duration:{expired:true,value:4,units:'rounds'}}),'Истёк');
 assert.equal(effectDurationLabel({duration:{value:null}}),'Без ограничения');
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
