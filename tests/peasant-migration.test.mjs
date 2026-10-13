import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";
import { migratePeasantContent } from "../scripts/migrations/peasant-content.mjs";

const files=Object.fromEntries(await Promise.all(["abilities","abilities.folders","professions"].map(async name=>[name,JSON.parse(await readFile(new URL(`../pack-sources/${name}.json`,import.meta.url),"utf8"))])));
function fixture(){
  const gm={},packs=new Map();let version=0;
  const state={writes:0,fail:false,partial:false};
  for(const name of ["abilities","professions"]){
    const index=new Map(),folders=new Map(),pack={collection:`${SYS}.${name}`,locked:true,folders,index,getIndex:async()=>index,configure:async options=>Object.assign(pack,options)};
    packs.set(pack.collection,pack);
  }
  globalThis.game={user:gm,users:{activeGM:gm},packs,settings:{get:()=>version,set:async(_scope,_key,value)=>{version=value;}}};
  globalThis.fetch=async url=>({ok:true,json:async()=>structuredClone(files[url.split("/").at(-1).replace(/\.json$/u,"")])});
  globalThis.foundry={documents:{Folder:{implementation:{createDocuments:async(rows,{pack})=>{rows.forEach(row=>packs.get(pack).folders.set(row._id,row));return rows;}}},Item:{implementation:{createDocuments:async(rows,{pack,keepId})=>{
    assert.equal(keepId,true);assert.equal(packs.get(pack).locked,false);state.writes++;
    if(state.fail)throw new Error("write failed");
    const created=state.partial?rows.slice(0,3):rows;created.forEach(row=>packs.get(pack).index.set(row._id,row));return created;
  }}}}};
  return {...state,get version(){return version;},state,packs,abilities:packs.get(`${SYS}.abilities`),professions:packs.get(`${SYS}.professions`)};
}
test("peasant migration appends one profession and ten abilities, preserves edits and restores locks",async()=>{
  const f=fixture(),custom={_id:"customPeasant001",name:"Мой крестьянин",system:{ruleId:"peasant",description:"Заметки"}};
  f.professions.index.set(custom._id,custom);
  await migratePeasantContent();
  assert.equal(f.version,1);assert.equal(f.abilities.index.size,10);assert.equal(f.abilities.folders.size,1);
  assert.equal(f.professions.index.size,1);assert.equal(f.professions.index.get(custom._id),custom);
  assert.equal(f.abilities.locked,true);assert.equal(f.professions.locked,true);
  const writes=f.state.writes;await migratePeasantContent();assert.equal(f.state.writes,writes);
});
test("failed and partial peasant migrations resume only missing documents",async()=>{
  const f=fixture();f.state.fail=true;
  await assert.rejects(migratePeasantContent(),/write failed/);assert.equal(f.abilities.locked,true);assert.equal(f.version,0);
  f.state.fail=false;f.state.partial=true;
  await assert.rejects(migratePeasantContent(),/Не все/);assert.equal(f.abilities.index.size,3);assert.equal(f.version,0);assert.equal(f.abilities.locked,true);
  f.state.partial=false;await migratePeasantContent();assert.equal(f.abilities.index.size,10);assert.equal(f.professions.index.size,1);assert.equal(f.version,1);
});
test("peasant migration rejects incomplete sources and occupied IDs without overwriting data",async()=>{
  const f=fixture();const unrelated={_id:files.abilities.find(row=>row.system.ruleId==="profession.peasant.intolerance")._id,system:{ruleId:"custom"}};
  f.abilities.index.set(unrelated._id,unrelated);
  await assert.rejects(migratePeasantContent(),/ID/);assert.equal(f.state.writes,0);assert.equal(f.abilities.index.get(unrelated._id),unrelated);
  f.abilities.index.clear();globalThis.fetch=async()=>({ok:true,json:async()=>[]});
  await assert.rejects(migratePeasantContent(),/Неполные/);assert.equal(f.version,0);
});
test("only the active GM updates profession compendiums",async()=>{
  const f=fixture();game.user={};await migratePeasantContent();assert.equal(f.state.writes,0);assert.equal(f.version,0);
});
