import test from "node:test";
import assert from "node:assert/strict";
import { tokenActorSource } from "../scripts/data/token-actor-source.mjs";
import { dimeritiumState } from "../scripts/magic/dimeritium.mjs";

test("nearby metal is read from lazy token deltas without preparing their actors recursively",()=>{
  const metal={_id:"metal",type:"equipment",name:"Двимерит",system:{quantity:3,carried:true}};
  const base={id:"base",toObject:()=>({name:"Страж",type:"npc",items:[metal,{_id:"deleted",type:"equipment",name:"Двимерит",system:{quantity:20}}],effects:[],system:{creature:{packId:"forest"}}})};
  const token={uuid:"Scene.s.Token.b",x:100,y:0,width:1,height:1,getSize:()=>({width:100,height:100}),baseActor:base,actorLink:false,
    get actor(){throw new Error("Must not instantiate a neighbouring actor during preparation");},
    toObject(){throw new Error("TokenDocument.toObject also materializes its lazy delta");},
    _source:{delta:{name:"Переименован",items:[{...metal,system:{quantity:2,carried:true}},{_id:"deleted",_tombstone:true}],effects:[],system:{creature:{packId:"wolves"}}}}};
  const view=tokenActorSource(token);assert.equal(view.name,"Переименован");assert.equal(view.system.creature.packId,"wolves");assert.equal(view.items.length,1);assert.equal(view.items[0].system.quantity,2);
  const source={x:0,y:0,width:1,height:1,getSize:()=>({width:100,height:100}),parent:{grid:{size:100,distance:1},tokens:[token]}};token.parent=source.parent;
  assert.deepEqual(dimeritiumState({type:"npc",system:{},items:[]},source),{nearby:2,touching:false});
});
