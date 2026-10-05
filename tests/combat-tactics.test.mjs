import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { withinFacing, facingModifiers, selectedAttackTarget } from "../scripts/combat/attack-target.mjs";
import { weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { attackModifierMarkup, rollWeaponAttack } from "../scripts/combat/weapon-rolls.mjs";
import { ambushAttack, delayedOrder, tacticsFlags, tacticalEffect } from "../scripts/combat/tactics-rules.mjs";
import { delayTurn, resumeDelayedTurn, cleanupTactics, processTacticRequest, requestTactic, resetTacticalOrder, renderTacticalTracker, prepareAmbush } from "../scripts/combat/combat-tactics.mjs";
import { ambushCandidates, ambushWindowContext, defaultAmbushSelection } from "../scripts/sheets/ambush-context.mjs";
import { startTurnPoison } from "../scripts/combat/poison-damage.mjs";

function patch(target, changes) {
  for (const [path,value] of Object.entries(changes)) {
    const keys=path.split("."),last=keys.pop();let owner=target;
    for(const key of keys)owner=owner[key]??={};owner[last]=value;
  }
}
const collection=entries=>Object.assign(entries,{get(id){return this.find(entry=>entry.id===id);}});
function actor(id) {
  const weapon={id:"sword",type:"weapon",name:"Sword",system:{hands:1,grip:1,category:"melee",skill:"swordsmanship",damage:"2d6",accuracy:0,quantity:1,carried:true,equipped:true,reliability:{value:10,max:10}}};
  return {id,uuid:`Actor.${id}`,isOwner:true,type:"character",name:id,flags:{},items:collection([weapon]),effects:collection([]),
    system:{details:{race:"human"},health:{value:30,max:30},stamina:{value:30,max:30},combatAction:{extra:false},attributes:{},
      skills:{stealth:5,awareness:5,swordsmanship:5,archery:5},abilityState:{},
      statistics:{effective:{intelligence:5,dexterity:5,reflex:5,body:5},modifiers:[]}},
    async update(changes){patch(this,changes);},
    async createEmbeddedDocuments(type,sources){assert.equal(type,"ActiveEffect");const effects=sources.map((source,i)=>({...source,id:`effect${this.effects.length+i}`,statuses:new Set(source.statuses)}));this.effects.push(...effects);return effects;},
    async deleteEmbeddedDocuments(type,ids){assert.equal(type,"ActiveEffect");this.effects=collection(this.effects.filter(effect=>!ids.includes(effect.id)));}};
}
function token(id,x=0,y=0,rotation=0) {
  return {id,uuid:`Scene.scene.Token.${id}`,documentName:"Token",parent:{id:"scene"},actor:actor(id),actorId:id,name:id,x,y,rotation,
    sight:{angle:360},getSize:()=>({width:100,height:100})};
}
function fixture() {
  const gm={id:"gm",isSelf:true,isActiveGM:true,isGM:true},player={id:"player"},messages=collection([]),operations=[];
  globalThis.game={user:gm,users:Object.assign(collection([gm,player]),{activeGM:gm}),messages,settings:{get:()=>"public"}};
  const combat={id:"combat",uuid:"Combat.combat",round:1,turn:0,started:true,previous:{round:0,turn:0},
    get combatant(){return this.turns[this.turn]??null;},
    async updateEmbeddedDocuments(type,changes,options={}){assert.equal(type,"Combatant");operations.push({changes,options});for(const update of changes)patch(this.combatants.get(update._id),update);
      this.turns=[...this.combatants].sort((a,b)=>((tacticsFlags(b).turnOrder??b.initiative)-(tacticsFlags(a).turnOrder??a.initiative))||a.id.localeCompare(b.id));
      if("combatTurn"in options)this.turn=options.combatTurn;},
    async nextTurn(){this.turn++;if(this.turn>=this.turns.length){this.turn=0;this.round++;}},
    async rollInitiative(ids,options){operations.push({initiative:ids,options});for(const id of ids)this.combatants.get(id).initiative=20-ids.indexOf(id);},
    async startCombat(){this.round=1;this.turn=0;this.started=true;operations.push({start:true});}};
  const tokens=[token("a"),token("b",0,-100),token("c",100,100)];
  combat.combatants=collection(tokens.map((token,i)=>({id:token.id,tokenId:token.id,sceneId:"scene",token,actor:token.actor,actorId:token.actor.id,name:token.name,initiative:20-i*5,flags:{},isOwner:true,parent:combat,
    testUserPermission:user=>user.id==="gm"||user.id==="player",
    async update(changes,options={}){operations.push({id:this.id,changes,options});patch(this,changes);}})));
  combat.turns=[...combat.combatants];game.combat=combat;game.combats=collection([combat]);
  game.user.targets=new Set();
  globalThis.canvas={tokens:{controlled:[]},scene:{id:"scene",tokens:collection(tokens)}};
  let counter=0,totals=[];
  const chat={getSpeaker:({actor,token})=>({actor:actor.id,token:token?.id}),applyMode:data=>data,
    async create(data){const message={id:`message${++counter}`,whisper:[],blind:false,...data};message.speakerActor=tokens.find(token=>token.actor.id===message.speaker?.actor)?.actor;messages.push(message);return message;}};
  globalThis.foundry={utils:{randomID:()=>`request${++counter}`},documents:{ChatMessage:chat,ActiveEffect:{registry:{refresh:async()=>{}}}},
    dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){this.total=totals.shift()??15;return this;}async toMessage(data,{messageMode}){return chat.create({...data,rolls:[this],blind:messageMode==="blind",whisper:messageMode==="blind"?["gm"]:data.whisper??[]});}}}};
  globalThis.fromUuid=async uuid=>tokens.find(token=>token.uuid===uuid);
  return {combat,tokens,a:combat.combatants[0],b:combat.combatants[1],c:combat.combatants[2],messages,operations,gm,player,totals};
}

test("facing uses north-clockwise rotation, token centres, inclusive edges, and both independent modifiers",()=>{
  const a=token("a"),front=token("front",0,-100),rear=token("rear",0,100),side=token("side",100,0);
  assert.equal(withinFacing(a,front),true);assert.equal(withinFacing(a,rear),false);assert.equal(withinFacing(a,side),true);
  assert.deepEqual(facingModifiers(a,front).parts.map(part=>part.value),[3]);
  front.rotation=180;assert.deepEqual(facingModifiers(a,front).parts,[]);
  rear.rotation=180;assert.deepEqual(facingModifiers(a,rear).parts.map(part=>part.value),[-3,3]);
  a.rotation=90;assert.equal(withinFacing(a,side),true);assert.equal(withinFacing(a,token("west",-100,0)),false);
  a.rotation=360;assert.equal(withinFacing(a,front),true);
  assert.equal(withinFacing(a,a),true);
});

test("lowered equipped visor narrows to 90° and lifting or removing it restores 180°",()=>{
  const a=token("a"),b=token("b",100,-10);
  const helm={id:"helm",type:"armor",system:{ruleId:"armor.head.6",zone:"head",quantity:1,carried:true,equipped:true,visorDown:true}};
  a.actor.items.push(helm);assert.equal(withinFacing(a,b),false);
  helm.system.visorDown=false;assert.equal(withinFacing(a,b),true);
  helm.system.visorDown=true;helm.system.equipped=false;assert.equal(withinFacing(a,b),true);
  a.sight.angle=60;assert.equal(withinFacing(a,b),false);
});

test("target resolution never guesses between several targets or several copies of an actor",()=>{
  const {tokens}=fixture();const [a,b]=tokens;
  assert.equal(selectedAttackTarget(a.actor),null);
  game.user.targets.add(b);assert.equal(selectedAttackTarget(a.actor).target,b);
  game.user.targets.add(tokens[2]);assert.throws(()=>selectedAttackTarget(a.actor),/одну/);
  game.user.targets.delete(tokens[2]);canvas.scene.tokens.push({...a,id:"copy"});assert.throws(()=>selectedAttackTarget(a.actor),/один токен/);
  canvas.tokens.controlled=[{document:a,actor:a.actor}];assert.equal(selectedAttackTarget(a.actor).attacker,a);
  game.user.targets=new Set([a]);assert.throws(()=>selectedAttackTarget(a.actor),/другое/);
});

test("blind attacks lose Aim, forbid aimed locations, and opening ambush fires exactly once",()=>{
  const a=actor("a"),weapon=a.items[0];weapon.system.category="ranged";weapon.system.skill="archery";
  a.effects.push({statuses:new Set(["aiming"]),flags:{[SYSTEM_ID]:{condition:{counter:{initial:3,max:3}}}}});
  const blind={blind:true,parts:[{label:"Blind",value:-3},{label:"Rear",value:3}]};
  assert.equal(weaponAttack(a,weapon).total,13);
  assert.equal(weaponAttack(a,weapon,{targetContext:blind,ambushBonus:5}).total,15);
  assert.match(weaponAttack(a,weapon,{targetContext:blind,location:"head"}).blocked,/Нельзя/);
  weapon.system.skill="swordsmanship";weapon.system.category="melee";
  assert.equal(weaponAttack(a,weapon).attack.count,2);
  assert.equal(weaponAttack(a,weapon,{opening:true}).attack.count,1);
});

test("a targeted weapon roll snapshots cone and ambush modifiers and posts muted signed rows",async()=>{
  const {combat,a,b,tokens,messages}=fixture();
  a.flags[SYSTEM_ID]={ambush:{targets:[b.token.uuid],opening:false}};
  game.user.targets=new Set([tokens[1]]);
  await rollWeaponAttack(a.actor,"sword");
  const message=messages[0],attack=message.flags[SYSTEM_ID].weaponAttack;
  assert.equal(attack.base,18);assert.equal(message.rolls[0].formula,"1d10wc + 18");assert.equal(attack.target,b.token.uuid);
  assert.match(message.flavor,/is-bonus/);assert.match(message.flavor,/Засада/);
  assert.equal(ambushAttack(combat,a.token,tokens[2]).bonus,0);
  combat.round=2;assert.equal(ambushAttack(combat,a.token,b.token).bonus,0);
  const html=attackModifierMarkup([{label:"<unsafe>",value:-3},{label:"Good",value:3}]);
  assert.match(html,/is-penalty/);assert.match(html,/&lt;unsafe&gt;/);assert.match(html,/−3/);assert.match(html,/\+3/);
});

test("delaying advances the turn; resuming reorders after current without time or initiative changes",async()=>{
  const {combat,a,b,c,operations}=fixture();
  await delayTurn(combat,a);assert.equal(combat.combatant,b);assert.equal(a.actor.effects[0].name,"Отложенный ход");
  combat.turn=2;
  const plan=delayedOrder(combat,a);assert.equal(plan.turn,1);assert.deepEqual(plan.updates.map(entry=>entry._id),[b.id,c.id,a.id]);
  await resumeDelayedTurn(combat,a);
  assert.equal(combat.combatant,c);assert.deepEqual(combat.turns.map(entry=>entry.id),[b.id,c.id,a.id]);assert.equal(a.initiative,20);
  assert.equal(operations.at(-1).options.turnEvents,false);assert.equal(operations.at(-1).options.combatTurn,1);
  assert.equal(a.actor.effects.length,0);assert.equal(tacticsFlags(a).delay,null);
  await combat.nextTurn();assert.equal(combat.combatant,a);
  await delayTurn(combat,a);assert.equal(combat.round,2);
});

test("end of round clears waiting state but preserves original position; used order persists next round",async()=>{
  const f=fixture();await delayTurn(f.combat,f.a);f.combat.round=2;
  await cleanupTactics(f.combat);assert.equal(f.a.actor.effects.length,0);assert.equal(tacticsFlags(f.a).delay,null);
  assert.deepEqual(f.combat.turns.map(c=>c.id),["a","b","c"]);
  await assert.rejects(()=>resumeDelayedTurn(f.combat,f.a),/том же раунде/);
  f.combat.turn=0;await delayTurn(f.combat,f.a);await resumeDelayedTurn(f.combat,f.a);
  const order=f.combat.turns.map(c=>c.id);f.combat.round=3;await cleanupTactics(f.combat);
  assert.deepEqual(f.combat.turns.map(c=>c.id),order);
});

test("delaying the last participant expires at the round boundary and failed advances roll state back",async()=>{
  const f=fixture();f.combat.turn=2;await delayTurn(f.combat,f.c);assert.equal(f.combat.round,2);
  await cleanupTactics(f.combat);assert.equal(f.c.actor.effects.length,0);
  f.combat.nextTurn=async()=>{throw new Error("write failed");};
  await assert.rejects(()=>delayTurn(f.combat,f.a),/write failed/);
  assert.equal(tacticsFlags(f.a).delay,null);assert.equal(f.a.actor.effects.length,0);
});

test("owned native flag requests are resolved only by GM, reject stale turns and deduplicate repeats",async()=>{
  const f=fixture();game.user=f.player;await requestTactic(f.a,"delay");
  const request=tacticsFlags(f.a).tacticRequest;
  f.gm.isSelf=false;await processTacticRequest(f.a,request);assert.equal(f.combat.turn,0);
  f.gm.isSelf=true;game.user=f.gm;await processTacticRequest(f.a,request);assert.equal(f.combat.turn,1);
  await processTacticRequest(f.a,request);assert.equal(f.combat.turn,1);
  const stale={...request,id:"stale",kind:"resume"};await processTacticRequest(f.a,stale);
  assert.deepEqual(f.combat.turns.map(c=>c.id),["a","b","c"]);assert.match(f.messages.at(-1).content,/сменился/);assert.deepEqual(f.messages.at(-1).whisper,["player"]);
  f.a.testUserPermission=()=>false;await processTacticRequest(f.a,{...request,id:"forged",current:f.b.id});assert.match(f.messages.at(-1).content,/Нет прав/);
});

test("ambush compares each defender, ties notice, hidden rolls stay private, expires after round one",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;f.b.token.hidden=true;
  f.messages.push({id:"stealth",speakerActor:f.a.actor,speaker:{actor:"a"},rolls:[{total:18}],whisper:["player"],blind:false,
    flags:{[SYSTEM_ID]:{ambushStealth:{combat:f.combat.id,token:f.a.token.uuid,targets:[f.b.token.uuid,f.c.token.uuid]}}}});
  f.totals.push(12,18);
  const request={id:"ambush",kind:"ambush",round:0,current:null,requester:"player",message:"stealth"};
  await processTacticRequest(f.a,request);
  assert.deepEqual(tacticsFlags(f.a).ambush.targets,[f.b.token.uuid]);assert.equal(f.a.actor.effects[0].name,"Засада");
  assert.equal(f.messages[1].blind,true);assert.deepEqual(f.messages[1].whisper,["gm"]);
  assert.deepEqual(f.messages[2].whisper,["player"]);assert.deepEqual(f.messages[3].whisper,["player"]);
  assert.equal(ambushAttack(f.combat,f.a.token,f.b.token).bonus,5);assert.equal(ambushAttack(f.combat,f.a.token,f.c.token).bonus,0);
  assert.equal(ambushAttack(f.combat,f.a.token,f.b.token).opening,true);
  f.combat.round=1;f.combat.started=true;await cleanupTactics(f.combat);assert.equal(f.a.actor.effects.length,1);
  f.combat.round=2;await cleanupTactics(f.combat);assert.equal(f.a.actor.effects.length,0);assert.equal(tacticsFlags(f.a).ambush,null);
});

test("first ambush attack triggers ordinary initiative once, retaining +5 for round one",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.a.flags[SYSTEM_ID]={ambush:{targets:[f.b.token.uuid],opening:true}};
  game.user.targets.add(f.b.token);f.a.actor.system.combatAction.extra=true;
  await rollWeaponAttack(f.a.actor,"sword");
  assert.equal(f.messages[0].rolls.length,1);assert.equal(f.messages[0].flags[SYSTEM_ID].action.extra,false);
  assert.equal(f.a.actor.system.stamina.value,30);
  const request=tacticsFlags(f.a).tacticRequest;assert.equal(request.kind,"initiative");
  await processTacticRequest(f.a,request);await processTacticRequest(f.a,request);
  assert.equal(f.operations.filter(entry=>entry.initiative).length,1);assert.equal(f.combat.round,1);
  assert.equal(tacticsFlags(f.a).ambush.opening,false);assert.equal(ambushAttack(f.combat,f.a.token,f.b.token).bonus,5);
});

test("reveal removes only that target; cancelled attack never requests initiative",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.a.flags[SYSTEM_ID]={ambush:{targets:[f.b.token.uuid,f.c.token.uuid],opening:true}};
  await processTacticRequest(f.a,{id:"reveal",kind:"reveal",target:f.b.token.uuid,round:0,current:null,requester:"player"});
  assert.deepEqual(tacticsFlags(f.a).ambush.targets,[f.c.token.uuid]);
  game.user.targets.add(f.c.token);foundry.documents.ChatMessage.create=async()=>null;
  await rollWeaponAttack(f.a.actor,"sword");assert.equal(tacticsFlags(f.a).tacticRequest,null);assert.equal(tacticsFlags(f.a).ambush.opening,true);
});

test("reordering or a resumed turn cannot apply poison twice in the same round",async()=>{
  const f=fixture();f.a.actor.effects.push({id:"poison",statuses:new Set(["poisoned"]),flags:{},duration:{expired:false}});
  await startTurnPoison(f.combat,f.a,{round:1,turn:0,skipped:false});assert.equal(f.a.actor.system.health.value,27);
  await delayTurn(f.combat,f.a);await resumeDelayedTurn(f.combat,f.a);await f.combat.nextTurn();
  f.combat.previous={round:1,turn:0};
  await startTurnPoison(f.combat,f.a,{round:1,turn:1,skipped:false});assert.equal(f.a.actor.system.health.value,27);
});

test("resetting explicit order keeps the same active creature and returns to rolled initiative",async()=>{
  const f=fixture();await delayTurn(f.combat,f.a);f.combat.turn=2;await resumeDelayedTurn(f.combat,f.a);
  assert.equal(f.combat.combatant,f.c);await resetTacticalOrder(f.combat);
  assert.equal(f.combat.combatant,f.c);assert.deepEqual(f.combat.turns.map(c=>c.id),["a","b","c"]);
  assert.ok(f.combat.combatants.every(c=>tacticsFlags(c).turnOrder===null));
});

test("deleting combat removes tactical effects but leaves unrelated effects intact",async()=>{
  const f=fixture();await f.a.actor.createEmbeddedDocuments("ActiveEffect",[tacticalEffect("ambush",f.combat,f.a,"Ambush")]);
  f.a.actor.effects.push({id:"other",flags:{},statuses:new Set()});await cleanupTactics(f.combat,{deleted:true});
  assert.deepEqual(f.a.actor.effects.map(effect=>effect.id),["other"]);
});

test("tracker puts a toggle after initiative only for an owned current or delayed combatant",()=>{
  const f=fixture();f.a.isOwner=false;f.b.flags[SYSTEM_ID]={delay:{round:1}};
  const rows=f.combat.combatants.map(c=>({dataset:{combatantId:c.id},children:[],classList:{add(){}},append(child){this.children.push(child);},querySelector(){return {append(){}};}}));
  globalThis.document={createElement:()=>({setAttribute(){},addEventListener(){},dataset:{}})};
  renderTacticalTracker({viewed:f.combat},{querySelectorAll:selector=>selector.startsWith(".combatant[")?rows:[]});
  assert.equal(rows[0].children.length,0);assert.equal(rows[1].children.length,1);assert.equal(rows[2].children.length,0);
  assert.equal(rows[1].children[0].dataset.tooltip,"Действовать после текущего существа");
  assert.equal(rows[1].children[0].disabled,false);
});

test("ambush roster selects several enemies, preserves separate copies and hides concealed tokens from players",()=>{
  const f=fixture();f.a.token.disposition=1;f.b.token.disposition=-1;f.c.token.disposition=-1;
  f.c.token.actor=f.b.token.actor;f.c.token.name=f.b.token.name;
  const rows=ambushCandidates(f.a.token);
  assert.equal(rows.length,2);assert.notEqual(rows[0].uuid,rows[1].uuid);
  assert.deepEqual([...defaultAmbushSelection(f.a.token,rows)],[f.b.token.uuid,f.c.token.uuid]);
  game.user=f.player;f.player.targets=new Set();f.b.token.object={isVisible:true};f.c.token.object={isVisible:false};
  assert.deepEqual(ambushCandidates(f.a.token).map(row=>row.uuid),[f.b.token.uuid]);
  f.b.token.hidden=true;assert.equal(ambushCandidates(f.a.token).length,0);
  game.user=f.gm;assert.equal(ambushCandidates(f.a.token).length,2);
  canvas.scene.id="other";assert.equal(ambushCandidates(f.a.token).length,0);
});

test("reopening ambush restores every checked enemy, including those who noticed, and keeps each result independent",()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.a.flags[SYSTEM_ID]={ambush:{targets:[f.b.token.uuid],opening:true},ambushReport:{targets:[f.b.token.uuid,f.c.token.uuid],message:"test"}};
  const selection=defaultAmbushSelection(f.a.token,ambushCandidates(f.a.token));
  assert.equal(selection.size,2);
  const view=ambushWindowContext(f.a.actor,f.a.token,{selection});
  assert.equal(view.selectedCount,2);assert.equal(view.unnoticedCount,1);assert.equal(view.noticedCount,1);
  assert.equal(view.rows.find(row=>row.uuid===f.b.token.uuid).status,"Не заметил");
  assert.equal(view.rows.find(row=>row.uuid===f.b.token.uuid).bonus,"+5");
  assert.equal(view.rows.find(row=>row.uuid===f.c.token.uuid).status,"Заметил");
  assert.equal(view.rows.find(row=>row.uuid===f.c.token.uuid).bonus,"—");
  assert.ok(view.rows.every(row=>!row.attackDisabled&&row.rollCount===1));
  f.combat.round=2;f.combat.started=true;
  const ended=ambushWindowContext(f.a.actor,f.a.token,{selection});
  assert.equal(ended.unnoticedCount,0);assert.ok(ended.rows.every(row=>row.attackDisabled));assert.equal(ended.canCheck,false);
});

test("one explicit target attacks without clearing the scene's several selected enemies or changing source token",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.a.flags[SYSTEM_ID]={ambush:{targets:[f.b.token.uuid],opening:true}};
  game.user.targets=new Set([f.b.token,f.c.token]);
  await rollWeaponAttack(f.a.actor,"sword",{attackerUuid:f.a.token.uuid,targetUuid:f.b.token.uuid});
  assert.equal(game.user.targets.size,2);assert.ok(game.user.targets.has(f.c.token));
  assert.equal(f.messages[0].rolls.length,1);
  assert.equal(tacticsFlags(f.messages[0]).weaponAttack.target,f.b.token.uuid);
  assert.equal(tacticsFlags(f.messages[0]).weaponAttack.base,18);
  assert.throws(()=>selectedAttackTarget(f.a.actor,{attackerUuid:f.c.token.uuid,targetUuid:f.b.token.uuid}),/атакующего/);
  game.user=f.player;f.b.token.object={isVisible:true};f.b.token.hidden=true;
  assert.throws(()=>selectedAttackTarget(f.a.actor,{attackerUuid:f.a.token.uuid,targetUuid:f.b.token.uuid}),/не виден/);
});

test("roster checks roll Stealth once against all explicit opponents without modifying scene targets",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  game.user.targets=new Set([f.c.token]);
  await prepareAmbush(f.a.actor,{attackerUuid:f.a.token.uuid,targetUuids:[f.b.token.uuid,f.c.token.uuid,f.b.token.uuid]});
  assert.equal(f.messages.length,1);assert.equal(f.messages[0].rolls.length,1);
  assert.deepEqual(tacticsFlags(f.messages[0]).ambushStealth.targets,[f.b.token.uuid,f.c.token.uuid]);
  assert.deepEqual([...game.user.targets],[f.c.token]);
  assert.equal(tacticsFlags(f.a).tacticRequest.kind,"ambush");
  f.totals.push(10,15);
  await processTacticRequest(f.a,tacticsFlags(f.a).tacticRequest);
  assert.deepEqual(tacticsFlags(f.a).ambushReport.targets,[f.b.token.uuid,f.c.token.uuid]);
  assert.deepEqual(tacticsFlags(f.a).ambush.targets,[f.b.token.uuid]);
});

test("preparing from the roster enlists the owned attacker and rejects stale or invisible selection before rolling",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.combat.combatants=collection([f.b,f.c]);let enrolled=0;
  f.a.token.toggleCombatant=async options=>{assert.equal(options.active,true);assert.equal(options.combat,f.combat);enrolled++;f.combat.combatants.push(f.a);};
  await prepareAmbush(f.a.actor,{attackerUuid:f.a.token.uuid,targetUuids:[f.b.token.uuid]});
  assert.equal(enrolled,1);assert.equal(f.messages.length,1);
  tacticsFlags(f.a).tacticRequest=null;
  await assert.rejects(()=>prepareAmbush(f.a.actor,{attackerUuid:f.a.token.uuid,targetUuids:["deleted"]}),/Отметьте/);
  game.user=f.player;f.b.token.object={isVisible:false};
  await assert.rejects(()=>prepareAmbush(f.a.actor,{attackerUuid:f.a.token.uuid,targetUuids:[f.b.token.uuid]}),/не видна/);
  assert.equal(f.messages.length,1);
});

test("revealing one opponent updates the roster but retains all checked opponents and other bonuses",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.a.flags[SYSTEM_ID]={ambush:{targets:[f.b.token.uuid,f.c.token.uuid],opening:true},ambushReport:{targets:[f.b.token.uuid,f.c.token.uuid]}};
  await processTacticRequest(f.a,{id:"reveal",kind:"reveal",target:f.b.token.uuid,round:0,current:null,requester:"player"});
  const view=ambushWindowContext(f.a.actor,f.a.token);
  assert.equal(view.unnoticedCount,1);assert.equal(view.noticedCount,1);assert.equal(view.hasReport,true);
  assert.deepEqual(tacticsFlags(f.a).ambushReport.targets,[f.b.token.uuid,f.c.token.uuid]);
});
