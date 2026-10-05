import test from "node:test";
import assert from "node:assert/strict";
import {packRecords,expandPackRecord} from "../tools/pack-records.mjs";
import {bestiarySources} from "../scripts/data/bestiary.mjs";
import {migrateBestiaryContent} from "../scripts/migrations/bestiary-content.mjs";

test("bestiary LevelDB records round-trip embedded weapons, armor and abilities by ID",async()=>{
  const sources=bestiarySources(),records=packRecords("Actor",sources),stored=new Map(records.map(row=>[`${row.sublevel}:${row.key}`,row.value]));
  const read=(collection,key)=>stored.get(`${collection}:${key}`);
  for(const source of sources) {
    const root=read("actors",source._id);
    assert.deepEqual(root.items,source.items.map(item=>item._id));
    assert.deepEqual(await expandPackRecord("Actor",root,read),source);
  }
  const id=sources[0]._id,itemId=sources[0].items[0]._id;
  stored.delete(`actors.items:${id}.${itemId}`);
  await assert.rejects(expandPackRecord("Actor",read("actors",id),read),/Missing embedded/);
});
test("embedded Item effects use the full ancestor key while prototype token stays inline",async()=>{
  const source={_id:"a",prototypeToken:{texture:{src:"art.svg"}},items:[{_id:"w",effects:[{_id:"fx",name:"Effect"}]}],effects:[{_id:"af",name:"Actor effect"}]};
  const records=packRecords("Actor",[source]);
  assert.ok(records.some(row=>row.sublevel==="actors.items.effects"&&row.key==="a.w.fx"));
  assert.deepEqual(await expandPackRecord("Actor",records.at(-1).value,(collection,key)=>records.find(row=>row.sublevel===collection&&row.key===key)?.value),source);
});
test("live bestiary repair restores only empty canonical actors, relocks pack and is idempotent",async()=>{
  const sources=bestiarySources(),gm={isGM:true},locks=[];let version=0,calls=0;
  const actors=sources.map((source,index)=>({id:source._id,items:{size:index?1:0},async createEmbeddedDocuments(type,items,options){assert.equal(type,"Item");assert.equal(options.keepId,true);calls++;this.items.size=items.length;return items;}}));
  const pack={locked:true,getDocuments:async()=>actors,configure:async({locked})=>{locks.push(locked);pack.locked=locked;}};
  globalThis.game={user:gm,users:{activeGM:gm},packs:new Map([["witcher-eliott-system.bestiary",pack]]),settings:{get:()=>version,set:async(_ns,_key,value)=>version=value}};
  await migrateBestiaryContent();assert.equal(calls,1);assert.deepEqual(locks,[false,true]);assert.equal(version,1);
  await migrateBestiaryContent();assert.equal(calls,1);
});
