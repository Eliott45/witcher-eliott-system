import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { creatureVisibilityAllowed, constrainHypnotizedVision, creatureVisionSourceClass, creatureDetectionTest,
  registerCreatureVision, refreshCreatureVision } from "../scripts/combat/creature-actions-vision.mjs";

function setup() {
  globalThis.game={user:{isGM:false}};
  globalThis.canvas={ready:false};
  globalThis.PIXI={Rectangle:class {constructor(x,y,width,height){Object.assign(this,{x,y,width,height});}},Circle:class {constructor(x,y,radius){Object.assign(this,{x,y,radius});}}};
  const documents=new Map(),scene={uuid:"Scene.one"};
  globalThis.fromUuidSync=uuid=>documents.get(uuid);
  const actor=(id,extra={})=>({uuid:`Actor.${id}`,name:id,items:[],effects:[],flags:{},system:{creature:{}},...extra});
  const token=(id,who)=>{const token={uuid:`Scene.one.Token.${id}`,actor:who,parent:scene,x:100,y:200,getSize:()=>({width:80,height:120})};documents.set(token.uuid,token);return token;};
  const source=token=>({object:{document:token},data:{x:25,y:30}});
  const hypnotize=(observer,fiend)=>observer.effects.push({flags:{[SYSTEM_ID]:{creatureHypnosis:{sourceActor:fiend.actor.uuid,sourceToken:fiend.uuid}}}});
  return {actor,token,source,hypnotize};
}

test("hypnosis filters only the affected source and delegates fiend detection to normal walls/range",()=>{
  const {actor,token,source,hypnotize}=setup(),observer=actor("observer"),fiend=token("fiend",actor("fiend")),other=token("other",actor("other"));
  const affected=source(token("observer",observer)),normal=source(token("normal",actor("normal")));
  hypnotize(observer,fiend);
  let calls=0;const receiver={normalResult:false};
  const testVisibility=creatureDetectionTest(function(){calls++;return this.normalResult;});
  assert.equal(testVisibility.call(receiver,affected,{}, {object:{document:other}}),false);assert.equal(calls,0);
  assert.equal(testVisibility.call(receiver,affected,{}, {object:{document:fiend}}),false);assert.equal(calls,1);
  receiver.normalResult=true;
  assert.equal(testVisibility.call(receiver,affected,{}, {object:{document:fiend}}),true);
  assert.equal(testVisibility.call(receiver,normal,{}, {object:{document:other}}),true);
  assert.equal(creatureVisibilityAllowed(affected,null),false);
  game.user.isGM=true;assert.equal(testVisibility.call(receiver,affected,{}, {object:{document:other}}),true);
});

test("hypnosis clips both FOV and light perception to its exact token and respects existing class behavior",()=>{
  const {actor,token,source,hypnotize}=setup(),observer=actor("observer"),fiend=token("fiend",actor("fiend")),vision=source(token("observer",observer));
  hypnotize(observer,fiend);
  const constraints=[],polygon={applyConstraint(shape){constraints.push(shape);return {constrained:shape};}};
  class ExistingVisionSource {
    constructor(){Object.assign(this,vision);}
    _createRestrictedPolygon(){this.customFov=true;return polygon;}
    _createLightPolygon(){this.customLight=true;return polygon;}
  }
  const Custom=creatureVisionSourceClass(ExistingVisionSource),instance=new Custom();
  assert.ok(instance instanceof ExistingVisionSource);
  instance._createRestrictedPolygon();instance._createLightPolygon();
  assert.equal(instance.customFov,true);assert.equal(instance.customLight,true);assert.equal(constraints.length,2);
  assert.deepEqual({...constraints[0]},{x:100,y:200,width:80,height:120});
  fiend.parent={uuid:"Scene.other"};
  constrainHypnotizedVision(vision,polygon);assert.equal(constraints[2].radius,0);
  assert.deepEqual({...constraints[2]},{x:25,y:30,radius:0});
  game.user.isGM=true;assert.equal(instance._createRestrictedPolygon(),polygon);
  game.user.isGM=false;observer.effects[0].disabled=true;assert.equal(instance._createRestrictedPolygon(),polygon);
});

test("invisibility is per observer, successful detection expires on the next disappearance, and cats still obey hypnosis",()=>{
  const {actor,token,source,hypnotize}=setup(),katakan=actor("katakan",{system:{creature:{invisible:true,invisibilityEpoch:"second"}}}),target=token("katakan",katakan);
  const observer=actor("observer"),vision=source(token("observer",observer));
  assert.equal(creatureVisibilityAllowed(vision,target),false);
  const key=encodeURIComponent(katakan.uuid).replaceAll(".","%2E");
  observer.flags[SYSTEM_ID]={detectedCreatures:{[key]:{sourceActor:katakan.uuid,sourceToken:target.uuid,epoch:"first"}}};
  assert.equal(creatureVisibilityAllowed(vision,target),false);
  observer.flags[SYSTEM_ID].detectedCreatures[key].epoch="second";
  assert.equal(creatureVisibilityAllowed(vision,target),true);
  assert.equal(creatureVisibilityAllowed(vision,token("another-katakan-token",katakan)),false);
  const cat=actor("cat",{items:[{type:"ability",system:{ruleId:"creature.cat.magic-attunement"}}]}),catVision=source(token("cat",cat));
  assert.equal(creatureVisibilityAllowed(catVision,target),true);
  hypnotize(cat,token("fiend",actor("fiend")));assert.equal(creatureVisibilityAllowed(catVision,target),false);
  katakan.system.creature.invisible=false;assert.equal(creatureVisibilityAllowed(source(token("new-observer",actor("new"))),target),true);
});

test("registration is idempotent and remote effect or token updates refresh all source geometry once",async()=>{
  setup();const events=new Map(),calls=[];
  class CustomSource {}
  class DetectionMode {testVisibility(){return true;}}
  globalThis.CONFIG={Canvas:{visionSourceClass:CustomSource}};
  globalThis.foundry={canvas:{perception:{DetectionMode}}};
  globalThis.Hooks={on:(event,fn)=>events.set(event,fn)};
  registerCreatureVision();const installed=CONFIG.Canvas.visionSourceClass,wrapped=DetectionMode.prototype.testVisibility;
  registerCreatureVision();assert.equal(CONFIG.Canvas.visionSourceClass,installed);assert.equal(DetectionMode.prototype.testVisibility,wrapped);
  assert.ok(new installed() instanceof CustomSource);assert.ok(events.has("deleteActiveEffect"));assert.ok(events.has("updateActorDelta"));
  globalThis.canvas={ready:true,tokens:{placeables:[{initializeVisionSource:options=>calls.push(options)}]},perception:{update:flags=>calls.push(flags)}};
  events.get("updateActiveEffect")();events.get("updateToken")();refreshCreatureVision();
  await Promise.resolve();
  assert.deepEqual(calls,[undefined,{refreshVision:true,refreshLighting:true}]);
});
