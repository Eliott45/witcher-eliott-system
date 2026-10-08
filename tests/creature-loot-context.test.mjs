import test from "node:test";
import assert from "node:assert/strict";
import { workshopActorContext } from "../scripts/sheets/workshop-actor-context.mjs";
import { harvestMaterial } from "../scripts/workshop/mutagens.mjs";

function fixture() {
  const gm={isGM:true}, recipient={id:"hero",name:"Герой",isOwner:true};
  globalThis.game={user:gm,users:{activeGM:gm},actors:Object.assign([recipient],{get:id=>id===recipient.id?recipient:null})};
  globalThis.foundry={utils:{fromUuid:async()=>({name:"Эссенция воды"})}};
  const actor={id:"npc",type:"npc",name:"Утопец",isOwner:true,items:[],system:{details:{race:""},mutations:[],
    creature:{loot:[],lootGenerated:false},harvest:[{id:"water",uuid:"Item.water",quantity:0,formula:"floor(1d6 / 2)",skill:"",dc:0,attempted:false}]}};
  return {actor,gm};
}

test("inventory shows unresolved harvest dice instead of zero and offers one generation action",async()=>{
  const {actor}=fixture(), context=await workshopActorContext(actor,{editing:true});
  assert.equal(context.harvest[0].amount,"floor(1d6 / 2)");
  assert.equal(context.harvest[0].pendingRoll,true);
  assert.equal(context.harvest[0].canExtract,false);
  assert.equal(context.loot.hasPending,true);
  assert.equal(context.loot.canGenerate,true);
  assert.equal(context.loot.editing,true);
  game.user={isGM:true};
  assert.equal((await workshopActorContext(actor)).loot.canGenerate,false);
});

test("existing rolled materials can be moved without rerolling; skilled or spent rows are not automatic loot",async()=>{
  const {actor}=fixture();actor.system.creature.lootGenerated=true;actor.system.harvest[0].quantity=2;
  let context=await workshopActorContext(actor);
  assert.equal(context.harvest[0].amount,2);assert.equal(context.loot.materialsOnly,true);
  actor.system.harvest[0].skill="alchemy";
  context=await workshopActorContext(actor);
  assert.equal(context.loot.hasPending,false);assert.equal(context.harvest[0].canExtract,true);
  actor.system.harvest[0].attempted=true;
  context=await workshopActorContext(actor);
  assert.equal(context.harvest[0].canExtract,false);assert.equal(context.loot.hasPending,false);
});

test("harvest changed while choosing a recipient cannot award the stale quantity",async()=>{
  const {actor}=fixture();actor.system.creature.lootGenerated=true;actor.system.harvest[0].quantity=2;
  foundry.applications={api:{DialogV2:{prompt:async()=>{actor.system.harvest[0].quantity=9;return "hero";}}}};
  actor.update=()=>assert.fail("A stale harvest must not consume the row");
  await assert.rejects(harvestMaterial(actor,"water"),/Добыча изменилась/);
  assert.equal(actor.system.harvest[0].attempted,false);
});
