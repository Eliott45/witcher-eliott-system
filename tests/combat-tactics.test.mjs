import test from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { withinFacing, facingModifiers, selectedAttackTarget } from "../scripts/combat/attack-target.mjs";
import { weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { attackModifierMarkup, rollWeaponAttack } from "../scripts/combat/weapon-rolls.mjs";
import { ambushAttack, delayedOrder, tacticsFlags, tacticalEffect } from "../scripts/combat/tactics-rules.mjs";
import { delayTurn, resumeDelayedTurn, cleanupTactics, processTacticRequest, requestTactic, resetTacticalOrder, renderTacticalTracker } from "../scripts/combat/combat-tactics.mjs";
import { ambushCandidates, ambushWindowContext, groupCardContext } from "../scripts/sheets/ambush-context.mjs";
import { createGroupAmbush, groupAmbush, ambushMatrix, claimAmbushRoll, acceptAmbushRoll, releaseAmbushRoll, cancelGroupAmbush, startGroupCombat, requestAmbush, rollGroupParticipant, restoreGroupPreparation } from "../scripts/combat/group-ambush.mjs";
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
  const gm={id:"gm",isSelf:true,isActiveGM:true,isGM:true},player={id:"player",isGM:false},messages=collection([]),operations=[];
  globalThis.game={user:gm,users:Object.assign(collection([gm,player]),{activeGM:gm}),messages,settings:{get:()=>"public"}};
  const combat={id:"combat",uuid:"Combat.combat",round:1,turn:0,started:true,previous:{round:0,turn:0},flags:{},scene:{id:"scene"},
    async update(changes){patch(this,changes);globalThis.Hooks?.callAll?.("updateCombat",this,changes);},
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
    async create(data){const message={id:`message${++counter}`,author:game.user,whisper:[],blind:false,...data};message.speakerActor=tokens.find(token=>token.actor.id===message.speaker?.actor)?.actor;messages.push(message);return message;}};
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

test("blind attacks lose Aim and forbid aimed locations without changing the attack mode",()=>{
  const a=actor("a"),weapon=a.items[0];weapon.system.category="ranged";weapon.system.skill="archery";
  a.effects.push({statuses:new Set(["aiming"]),flags:{[SYSTEM_ID]:{condition:{counter:{initial:3,max:3}}}}});
  const blind={blind:true,parts:[{label:"Blind",value:-3},{label:"Rear",value:3}]};
  assert.equal(weaponAttack(a,weapon).total,13);
  assert.equal(weaponAttack(a,weapon,{targetContext:blind,ambushBonus:5}).total,15);
  assert.match(weaponAttack(a,weapon,{targetContext:blind,location:"head"}).blocked,/Нельзя/);
  weapon.system.skill="swordsmanship";weapon.system.category="melee";
  assert.equal(weaponAttack(a,weapon).attack.count,1);
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


test("legacy opening flags no longer restrict attack count or trigger initiative",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.a.flags[SYSTEM_ID]={ambush:{targets:[f.b.token.uuid],opening:true}};
  game.user.targets.add(f.b.token);
  await rollWeaponAttack(f.a.actor,"sword");
  assert.equal(f.messages[0].rolls.length,1);assert.equal(f.combat.round,0);
  assert.equal(tacticsFlags(f.a).tacticRequest,undefined);
  assert.equal(f.operations.filter(entry=>entry.initiative).length,0);
  assert.equal(ambushAttack(f.combat,f.a.token,f.b.token).bonus,5);
  await processTacticRequest(f.a,{id:"old-request",kind:"initiative",requester:"gm",round:0,current:null,message:f.messages[0].id});
  assert.equal(f.combat.started,false);
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




async function groupFixture(roles=["stealth","stealth","awareness"]) {
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  for (const entry of f.combat.combatants) entry.initiative=null;
  await createGroupAmbush(canvas.scene,f.tokens.map((token,i)=>({tokenId:token.id,role:roles[i]})));
  return f;
}
async function submitGroup(f,entry,total,{user=f.gm,nonce=entry.id}={}) {
  const session=groupAmbush(f.combat);
  await claimAmbushRoll(entry,{session:session.id,nonce,requester:user.id});
  const message={id:`result-${nonce}`,author:user,speakerActor:entry.actor,rolls:[{total}],flags:{[SYSTEM_ID]:{
    groupAmbushRoll:{combat:f.combat.id,session:session.id,combatant:entry.id,nonce}}}};
  f.messages.push(message);await acceptAmbushRoll(message);return message;
}

test("group comparison uses one shared Awareness for all sneaking participants and notices ties",()=>{
  const entries=[18,15,11].map((total,i)=>({id:`s${i}`,role:"stealth",total})).concat([14,17,10].map((total,i)=>({id:`a${i}`,role:"awareness",total})));
  assert.deepEqual(ambushMatrix({entries}).map(row=>row.cells.map(cell=>cell.unseen)),[[true,true,true],[true,false,true],[false,false,true]]);
  entries[0].total=14;assert.equal(ambushMatrix({entries})[0].cells[0].unseen,false);
  entries[0].total=null;assert.equal(ambushMatrix({entries})[0].cells[0].unseen,null);
});

test("Scoiatael archers share only their highest Stealth result, keeping raw dice and pending checks",()=>{
  const entries=[{id:"archer1",role:"stealth",total:12,groupStealth:true},{id:"archer2",role:"stealth",total:19,groupStealth:true},
    {id:"ally",role:"stealth",total:30},{id:"watcher",role:"awareness",total:18},{id:"tie",role:"awareness",total:19}];
  let matrix=ambushMatrix({entries});
  assert.deepEqual(matrix.map(row=>row.effectiveTotal),[19,19,30]);
  assert.deepEqual(matrix.map(row=>row.cells.map(cell=>cell.unseen)),[[true,false],[true,false],[true,true]]);
  assert.equal(matrix[0].total,12);assert.equal(entries[0].total,12);
  entries[1].total=null;matrix=ambushMatrix({entries});
  assert.equal(matrix[0].effectiveTotal,null);assert.equal(matrix[0].cells[0].unseen,null);
  assert.equal(matrix[2].cells[0].unseen,true);
});

test("renamed imported archers receive the shared ambush bonus and the card explains the effective total",async()=>{
  const f=fixture();f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  for(const entry of [f.a,f.b]) {
    entry.actor.type="npc";entry.actor.name="Переименованный лучник";
    entry.actor._stats={compendiumSource:`Compendium.${SYSTEM_ID}.bestiary.Actor.bstr000000000002`};
  }
  await createGroupAmbush(canvas.scene,f.tokens.map((token,i)=>({tokenId:token.id,role:i<2?"stealth":"awareness"})));
  assert.deepEqual(groupAmbush(f.combat).entries.map(row=>row.groupStealth),[true,true,false]);
  await submitGroup(f,f.a,10);await submitGroup(f,f.b,19);await submitGroup(f,f.c,18);
  assert.deepEqual(tacticsFlags(f.a).ambush.targets,[f.c.token.uuid]);
  assert.deepEqual(tacticsFlags(f.b).ambush.targets,[f.c.token.uuid]);
  const context=groupCardContext(f.combat,groupAmbush(f.combat).id,f.gm);
  assert.equal(context.rows[0].total,10);assert.equal(context.matrix[0].total,19);assert.equal(context.matrix[0].sharedStealth,true);
  for(const row of groupAmbush(f.combat).entries)delete row.groupStealth;
  assert.equal(ambushMatrix(groupAmbush(f.combat),f.combat)[0].effectiveTotal,19,"legacy sessions use the current stable creature identity");
});

test("only GM configures group; players post a request and non-rolling participants enter combat",async()=>{
  const f=fixture();game.user=f.player;
  await assert.rejects(()=>createGroupAmbush(canvas.scene,[]),/только мастер/);
  await requestAmbush(f.a.actor);assert.equal(tacticsFlags(f.messages[0]).ambushRequest.scene,"scene");
  assert.equal(f.messages[0].rolls,undefined);
  game.user=f.gm;f.combat.started=false;f.combat.round=0;f.combat.turn=null;
  f.combat.combatants=collection([f.a]);
  f.combat.createEmbeddedDocuments=async(type,sources,options)=>{assert.equal(type,"Combatant");assert.equal(options.turnEvents,false);
    assert.deepEqual(sources.map(s=>s.tokenId),["b","c"]);f.combat.combatants.push(f.b,f.c);};
  await createGroupAmbush(canvas.scene,[{tokenId:"a",role:"stealth"},{tokenId:"b",role:"awareness"},{tokenId:"c",role:"participant"}]);
  assert.equal(groupAmbush(f.combat).entries.length,3);assert.equal(f.combat.started,false);
  await assert.rejects(()=>createGroupAmbush(canvas.scene,[{tokenId:"a",role:"stealth"},{tokenId:"b",role:"awareness"}]),/текущую засаду/);
  await submitGroup(f,f.a,18);await submitGroup(f,f.b,14);
  assert.equal(groupAmbush(f.combat).status,"ready");assert.equal(groupAmbush(f.combat).entries[2].total,null);
});

test("a group rolls each participant once and applies independent bonuses after all results",async()=>{
  const f=await groupFixture();await submitGroup(f,f.a,18);
  assert.equal(tacticsFlags(f.a).ambush,null);await submitGroup(f,f.b,14);
  await submitGroup(f,f.c,14);
  assert.equal(groupAmbush(f.combat).status,"ready");assert.deepEqual(tacticsFlags(f.a).ambush.targets,[f.c.token.uuid]);
  assert.equal(tacticsFlags(f.b).ambush,null);assert.equal(f.a.actor.effects.length,1);assert.equal(f.b.actor.effects.length,0);
  assert.equal(ambushAttack(f.combat,f.a.token,f.c.token).bonus,5);
  await assert.rejects(()=>claimAmbushRoll(f.c,{session:groupAmbush(f.combat).id,nonce:"again",requester:"gm"}),/завершена/);
  f.combat.round=1;f.combat.started=true;await cleanupTactics(f.combat);assert.equal(f.a.actor.effects.length,1);
  f.combat.round=2;await cleanupTactics(f.combat);assert.equal(f.a.actor.effects.length,0);
});

test("roll slots prevent two owners from rerolling, validate author and survive duplicate messages",async()=>{
  const f=await groupFixture();const session=groupAmbush(f.combat).id;
  await claimAmbushRoll(f.a,{session,nonce:"one",requester:"player"});
  await assert.rejects(()=>claimAmbushRoll(f.a,{session,nonce:"two",requester:"gm"}),/уже выполняется/);
  const message={id:"roll",author:f.gm,speakerActor:f.a.actor,rolls:[{total:18}],flags:{[SYSTEM_ID]:{groupAmbushRoll:{combat:f.combat.id,session,combatant:"a",nonce:"one"}}}};
  await acceptAmbushRoll(message);assert.equal(groupAmbush(f.combat).entries[0].total,null);
  message.author=f.player;await acceptAmbushRoll(message);assert.equal(groupAmbush(f.combat).entries[0].total,18);
  message.rolls[0].total=99;await acceptAmbushRoll(message);assert.equal(groupAmbush(f.combat).entries[0].total,18);
  f.b.testUserPermission=user=>user.isGM;
  await processTacticRequest(f.b,{kind:"ambush-claim",id:"forged",requester:"player",session,nonce:"forged",round:0,current:null});
  assert.equal(groupAmbush(f.combat).entries[1].claim,null);assert.match(f.messages.at(-1).content,/Нет прав/);
});

test("GM can release an interrupted check but accepts an already posted result instead of rerolling",async()=>{
  const f=await groupFixture(),session=groupAmbush(f.combat).id;
  await claimAmbushRoll(f.a,{session,nonce:"one",requester:"gm"});
  await releaseAmbushRoll(f.combat,session,"a","wrong");assert.ok(groupAmbush(f.combat).entries[0].claim);
  await releaseAmbushRoll(f.combat,session,"a","one");assert.equal(groupAmbush(f.combat).entries[0].claim,null);
  await claimAmbushRoll(f.a,{session,nonce:"two",requester:"gm"});
  f.messages.push({id:"saved",author:f.gm,speakerActor:f.a.actor,rolls:[{total:19}],flags:{[SYSTEM_ID]:{groupAmbushRoll:{combat:f.combat.id,session,combatant:"a",nonce:"two"}}}});
  await releaseAmbushRoll(f.combat,session,"a");assert.equal(groupAmbush(f.combat).entries[0].total,19);
});

test("chat offers only owned checks, keeps hidden NPCs private, and shows a shared matrix",async()=>{
  const f=await groupFixture();f.c.hidden=true;f.c.testUserPermission=user=>user.isGM;
  const session=groupAmbush(f.combat).id;
  let view=groupCardContext(f.combat,session,f.player);
  assert.deepEqual(view.rows.map(row=>row.id),["a","b"]);assert.equal(view.canManage,false);assert.ok(view.rows.every(row=>row.canRoll));
  view=groupCardContext(f.combat,session,f.gm);assert.equal(view.rows.length,3);assert.equal(view.observers.length,1);
  await submitGroup(f,f.c,14);view=groupCardContext(f.combat,session,f.gm);assert.equal(view.rows[2].canRoll,false);
  assert.ok(view.matrix.every(row=>row.cells[0].pending));
  f.c.hidden=false;assert.equal(groupCardContext(f.combat,session,f.player).rows[2].canRoll,false);
  await cancelGroupAmbush(f.combat);assert.ok(groupCardContext(f.combat,session,f.player).rows.every(row=>!row.canRoll));
});

test("players use ordinary attacks after group checks; only Start Battle begins initiative",async()=>{
  const f=await groupFixture();await submitGroup(f,f.a,18);await submitGroup(f,f.b,17);await submitGroup(f,f.c,14);
  game.user=f.player;f.c.token.object={isVisible:true};
  const message=await rollWeaponAttack(f.a.actor,"sword",{attackerUuid:f.a.token.uuid,targetUuid:f.c.token.uuid});
  assert.equal(message.rolls.length,1);assert.equal(tacticsFlags(message).weaponAttack.parts.find(part=>part.label==="Засада").value,5);
  assert.equal(groupAmbush(f.combat).status,"ready");assert.equal(f.combat.started,false);
  assert.equal(tacticsFlags(f.a).tacticRequest,undefined);assert.equal(f.operations.filter(op=>op.initiative).length,0);
  await assert.rejects(()=>startGroupCombat(f.combat),/только мастер/);
  game.user=f.gm;await startGroupCombat(f.combat);await startGroupCombat(f.combat);
  assert.equal(f.combat.round,1);assert.equal(groupAmbush(f.combat).status,"started");assert.equal(f.operations.filter(op=>op.initiative).length,1);
  assert.deepEqual(f.operations.find(op=>op.initiative).initiative,["a","b","c"]);
  assert.equal(ambushAttack(f.combat,f.b.token,f.c.token).bonus,5);
});

test("cancelling preparation clears bonuses without removing combatants",async()=>{
  const f=await groupFixture();await submitGroup(f,f.a,18);await submitGroup(f,f.b,17);await submitGroup(f,f.c,14);
  await cancelGroupAmbush(f.combat);assert.equal(groupAmbush(f.combat).status,"cancelled");
  assert.equal(f.combat.combatants.length,3);assert.equal(f.a.actor.effects.length,0);assert.equal(tacticsFlags(f.a).ambush,null);
});

test("saved opening step returns to results without an automatic battle, even with an old attack message",async()=>{
  const f=await groupFixture();await submitGroup(f,f.a,18);await submitGroup(f,f.b,17);await submitGroup(f,f.c,14);
  const session=groupAmbush(f.combat);session.status="opening";tacticsFlags(f.a).ambush.opening=true;
  f.messages.push({id:"old-attack",flags:{[SYSTEM_ID]:{weaponAttack:{groupOpening:session.id}}}});
  await restoreGroupPreparation(f.combat);
  assert.equal(groupAmbush(f.combat).status,"ready");assert.equal(f.combat.started,false);
  assert.equal(f.operations.filter(op=>op.initiative).length,0);
  assert.equal(ambushWindowContext(canvas.scene).canStart,true);
  assert.equal(ambushAttack(f.combat,f.a.token,f.c.token).bonus,5);
});

test("GM may start normally when no one remained hidden; interrupted initiative resumes remaining rolls",async()=>{
  const f=await groupFixture();await submitGroup(f,f.a,10);await submitGroup(f,f.b,10);await submitGroup(f,f.c,14);
  assert.equal(tacticsFlags(f.a).ambush,null);f.a.initiative=20;
  await startGroupCombat(f.combat);assert.deepEqual(f.operations.find(op=>op.initiative).initiative,["b","c"]);
  await startGroupCombat(f.combat);assert.equal(f.operations.filter(op=>op.initiative).length,1);
});

test("GM role window retains separate NPC copies and allows starting when all checks finish",async()=>{
  const f=await groupFixture();f.b.token.actor=f.a.actor;f.b.token.name=f.a.token.name;
  assert.equal(ambushCandidates(canvas.scene).length,3);
  let view=ambushWindowContext(canvas.scene);assert.equal(view.locked,true);assert.equal(view.canPublish,false);
  await submitGroup(f,f.a,18);await submitGroup(f,f.b,17);await submitGroup(f,f.c,14);
  view=ambushWindowContext(canvas.scene);assert.equal(view.card.rows.length,3);assert.equal(view.canStart,true);
});

test("owner rolls on their own client after GM grants the slot and sends one native check",async()=>{
  const f=await groupFixture(),listeners=new Map();let sequence=0;
  globalThis.Hooks={on(event,fn){const id=++sequence;listeners.set(id,{event,fn});return id;},off(event,id){listeners.delete(id);},callAll(event,...args){for(const entry of [...listeners.values()])if(entry.event===event)entry.fn(...args);}};
  globalThis.ui={};globalThis.requestAnimationFrame=fn=>fn();
  const update=f.a.update.bind(f.a);
  f.a.update=async changes=>{await update(changes);const request=changes[`flags.${SYSTEM_ID}.tacticRequest`];if(request?.kind==="ambush-claim")await claimAmbushRoll(f.a,request);};
  game.user=f.player;f.totals.push(18);
  try {
    const session=groupAmbush(f.combat).id;
    const [message,duplicate]=await Promise.all([rollGroupParticipant(f.a,session),rollGroupParticipant(f.a,session)]);
    assert.equal(duplicate,undefined);assert.equal(message.author,f.player);assert.equal(message.rolls[0].total,18);
    assert.equal(message.rolls[0].formula,"1d10wc + 10");assert.equal(tacticsFlags(message).groupAmbushRoll.combatant,"a");
    assert.equal(f.messages.filter(message=>tacticsFlags(message).groupAmbushRoll).length,1);
    game.user=f.gm;await acceptAmbushRoll(message);assert.equal(groupAmbush(f.combat).entries[0].total,18);
  } finally {delete globalThis.Hooks;delete globalThis.requestAnimationFrame;delete globalThis.ui;}
});
