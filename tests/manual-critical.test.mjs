import test from "node:test";
import assert from "node:assert/strict";
import { witcherCritical } from "../scripts/dice/critical-chain.mjs";
import { continueManualCritical,hasPendingCritical } from "../scripts/chat/manual-critical.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

function environment(onPrompt) {
  const messages=[],animations=[];
  globalThis.game={user:{id:"roller",name:"Roller"},i18n:{localize:key=>key},settings:{get:(_scope,key)=>key==="automaticCriticalDice"?false:"self"},
    dice3d:{async showForRoll(roll,_user,sync,recipients,blind){animations.push(roll.total);assert.equal(sync,true);assert.deepEqual(recipients,["roller"]);assert.equal(blind,false);}}};
  let id=0;
  globalThis.foundry={utils:{randomID:()=>String(++id)},dice:{Roll:{fromData:data=>data}},documents:{ChatMessage:{
    applyMode(data,mode){assert.equal(mode,"self");return {...data,whisper:["roller"],blind:false};},
    async create(data){
      const message={...data,id:`chat-${id}`,isOwner:true,async update(changes){Object.assign(this,changes);this.flags[SYSTEM_ID].manualCritical=changes[`flags.${SYSTEM_ID}.manualCritical`];onPrompt?.(this);return this;}};
      messages.push(message);return message;
    }
  }}};
  return {messages,animations};
}
function dieFor(values) {
  const remaining=values.slice(1);
  return {faces:10,options:{},results:[{result:values[0],active:true}],async roll(){assert.ok(remaining.length);const next={result:remaining.shift(),active:true};this.results.push(next);return next;}};
}

test("manual mode waits for each click and ignores double clicks; only a later ten continues",async()=>{
  let ready;
  const prompt=()=>new Promise(resolve=>{ready=resolve;});
  let shown=prompt();
  const {messages,animations}=environment(message=>{queueMicrotask(()=>ready(message));});
  const die=dieFor([1,10,1]);let completed=false;
  const evaluation=witcherCritical.call(die,"wc").then(()=>{completed=true;});
  let message=await shown;
  assert.equal(completed,false);assert.equal(die.results.length,1);assert.equal(hasPendingCritical(),true);
  assert.equal(message.flags[SYSTEM_ID].skipLuck,true);
  assert.equal(message.flags[SYSTEM_ID].manualCritical.waiting,true);
  assert.equal(continueManualCritical(message),true);assert.equal(continueManualCritical(message),false);
  // The next prompt is published after the first continued face has animated.
  shown=prompt();await shown;
  while(!continueManualCritical(message)){shown=prompt();await shown;}
  await evaluation;
  assert.equal(completed,true);assert.equal(hasPendingCritical(),false);
  assert.deepEqual(die.options[SYSTEM_ID].criticalChains,[{kind:"fumble",results:[1,10,1],total:-11}]);
  assert.deepEqual(animations,[10,1]);assert.equal(messages.length,1);
  assert.ok(die.results.every(result=>result.hidden&&result.active));
  assert.equal(message.flags[SYSTEM_ID].manualCritical.status,"complete");
  assert.equal(message.flags[SYSTEM_ID].manualCritical.waiting,false);
});

test("manual cancellation rejects evaluation before any continuation and removes pending state",async()=>{
  environment(message=>{queueMicrotask(()=>continueManualCritical(message,{cancel:true}));});
  const die=dieFor([10,4]);
  await assert.rejects(witcherCritical.call(die,"wc"),/Cancelled/);
  assert.equal(die.results.length,1);assert.equal(hasPendingCritical(),false);
});

test("manual controls cannot be used by a different author; ordinary dice never create prompts",async()=>{
  let notify;const ready=new Promise(resolve=>notify=resolve);
  const {messages}=environment(message=>notify(message));
  const ordinary=dieFor([8]);await witcherCritical.call(ordinary,"wc");assert.equal(messages.length,0);
  const work=witcherCritical.call(dieFor([10,4]),"wc");const message=await ready;
  game.user.id="other";assert.equal(continueManualCritical(message),false);
  game.user.id="roller";assert.equal(continueManualCritical(message),true);await work;
  assert.equal(message.flags[SYSTEM_ID].manualCritical.total,14);
});

test("manual continuations preserve every documented critical total",async()=>{
  for(const [faces,total] of [[[10,4],14],[[10,10,7],27],[[10,10,10,2],32],[[10,1],11],
    [[1,4],-4],[[1,1],-1],[[1,10,3],-13],[[1,10,10,6],-26],[[1,10,1],-11]]) {
    environment(message=>{queueMicrotask(()=>continueManualCritical(message));});
    const die=dieFor(faces);
    await witcherCritical.call(die,"wc");
    assert.equal(die.options[SYSTEM_ID].criticalChains[0].total,total);
    assert.equal(die.results.reduce((sum,face)=>sum+(face.count??face.result),0),total);
    assert.equal(hasPendingCritical(),false);
  }
});

test("a failed intermediate chat creation releases pending state without another draw",async()=>{
  environment();
  foundry.documents.ChatMessage.create=async()=>{throw new Error("Chat unavailable");};
  const die=dieFor([10,4]);
  await assert.rejects(witcherCritical.call(die,"wc"),/Chat unavailable/);
  assert.equal(die.results.length,1);
  assert.equal(hasPendingCritical(),false);
});
