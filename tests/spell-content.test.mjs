import {test} from "node:test";
import assert from "node:assert/strict";
import {migrateSpellContent,SPELL_CONTENT_VERSION} from "../scripts/migrations/spell-content.mjs";
import {spellSources,spellFolders} from "../scripts/data/spells.mjs";

function fixture(startVersion=0) {
  let version=startVersion;const writes=[],gm={id:"gm"};
  const index=new Map(spellSources().filter(s=>!s.system.kind&&(startVersion===1||s.system.tradition==="mage")).map(s=>[s._id,structuredClone(s)]));
  const pack={collection:"witcher-eliott-system.spells",locked:true,folders:new Map(spellFolders().filter(f=>f._id.startsWith("spell")).map(f=>[f._id,f])),getIndex:async()=>index,getDocuments:async()=>[...index.values()].map(s=>({...s,id:s._id})),configure:async({locked})=>{pack.locked=locked;writes.push(["lock",locked]);}};
  globalThis.game={user:gm,users:{activeGM:gm},packs:new Map([[pack.collection,pack]]),items:[],actors:[],scenes:[],settings:{get:()=>version,set:async(_s,_k,v)=>{version=v;}}};
  const create=kind=>async(sources)=>{writes.push([kind,sources]);for(const s of sources){if(kind==="folder"){assert.ok(!s.folder||pack.folders.has(s.folder));pack.folders.set(s._id,s);}else index.set(s._id,s);}return sources;};
  globalThis.foundry={documents:{Folder:{implementation:{createDocuments:create("folder")}},Item:{implementation:{createDocuments:create("item"),updateDocuments:async(updates)=>{writes.push(["update",updates]);for(const u of updates)index.get(u._id).system.target=u["system.target"];return updates;}}}}};
  return {pack,index,writes,version:()=>version};
}

test("live catalog migration appends missing magic, preserves edits and restores its lock",async()=>{
  const {pack,index,writes,version}=fixture();
  const old=index.values().next().value;old.system.description="Custom writing";
  await migrateSpellContent();assert.equal(index.size,124);assert.equal(old.system.description,"Custom writing");
  assert.equal(pack.locked,true);assert.equal(version(),SPELL_CONTENT_VERSION);assert.equal(writes.find(w=>w[0]==="item")[1].length,59);
  const size=writes.length;await migrateSpellContent();assert.equal(writes.length,size);
});
test("version one catalog gains only the 31 new entries and retries without duplicates",async()=>{
  const {index,writes,version}=fixture(1);
  assert.equal(index.size,93);
  const old=index.values().next().value;old.system.description="Custom writing";
  await migrateSpellContent();assert.equal(index.size,124);assert.equal(version(),SPELL_CONTENT_VERSION);
  assert.equal(writes.find(w=>w[0]==="item")[1].length,31);
  assert.equal(old.system.description,"Custom writing");
  const size=writes.length;await migrateSpellContent();assert.equal(writes.length,size);
});
test("only active GM migrates and stable ID collisions do not overwrite custom documents",async()=>{
  const {index,writes,version}=fixture();game.user={id:"player"};await migrateSpellContent();assert.equal(writes.length,0);
  game.user=game.users.activeGM;const first=spellSources().find(s=>s.system.tradition!=="mage");index.set(first._id,{_id:first._id,system:{ruleId:"custom.magic"}});
  await assert.rejects(migrateSpellContent(),/ID магии/);assert.equal(version(),0);assert.equal(writes.length,0);
});
test("failed pack creation restores lock and remains eligible for retry",async()=>{
  const {pack,version}=fixture();foundry.documents.Item.implementation.createDocuments=async()=>{throw new Error("write failed");};
  await assert.rejects(migrateSpellContent(),/write failed/);assert.equal(pack.locked,true);assert.equal(version(),0);
});

test("version two catalogs gain the target of stock magic and keep a hand-picked one",async()=>{
  const {index,writes,version,pack}=fixture(2);
  const [stock,edited]=[...index.values()];stock.system.target=[];edited.system.target=["place"];
  await migrateSpellContent();
  assert.deepEqual(stock.system.target.length>0,true);assert.deepEqual(edited.system.target,["place"]);
  assert.equal(writes.filter(w=>w[0]==="update").length,1);assert.equal(writes.find(w=>w[0]==="update")[1].length,1);
  assert.equal(pack.locked,true);assert.equal(version(),SPELL_CONTENT_VERSION);
});
