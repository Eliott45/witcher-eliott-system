import assert from "node:assert/strict";
import { test } from "node:test";
import { CORE_SERVICES, defaultServices, applyServicePreset } from "../scripts/data/core-services.mjs";
import { SKILLS } from "../scripts/data/skills.mjs";
import { getProfession } from "../scripts/data/professions.mjs";
import { serviceQuote, validateServiceEntries } from "../scripts/services/quotes.mjs";
import { requestService, resolveServiceOrder, serviceOrder, orderCard } from "../scripts/services/orders.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";
const entry = id => defaultServices().find(row=>row.id===id);

test("book service catalogue is unique, references existing skills and keeps editable presets independent",()=>{
  const first=defaultServices(), second=defaultServices();
  assert.equal(first.length,24);assert.equal(new Set(first.map(row=>row.id)).size,24);
  assert.equal(first.filter(row=>row.group==="lodging").length,7);
  first[0].price=100;assert.equal(second[0].price,8);
  for(const service of CORE_SERVICES)for(const skill of service.rules.skillBases??[]) {
    if(skill.skill)assert.ok(SKILLS.some(row=>row.key===skill.skill),skill.skill);
    else assert.ok(getProfession("doctor").abilities.some(row=>row.id===skill.professionAbility));
  }
  const custom={...entry("hot-bath"),id:"custom",ruleId:"",enabled:true};
  const changed=applyServicePreset([...first,custom],"medic");
  assert.deepEqual(changed.filter(row=>row.enabled).map(row=>row.id),["medic","custom"]);
  assert.equal(changed[0].price,100);assert.equal(first[0].enabled,true);
  assert.equal(validateServiceEntries(changed),changed);
  assert.throws(()=>validateServiceEntries([...first,first[0]]),/уникальный/);
  assert.throws(()=>validateServiceEntries([{...custom,pricing:"percent",price:101}]),/цена/);
});

test("service quotes apply nights, critical fees, item value, fence commission and sea routes exactly once",()=>{
  assert.equal(serviceQuote(entry("standard-room"),{quantity:3}).total,48);
  assert.equal(serviceQuote(entry("medic"),{quantity:2,wounds:{simple:1,complex:1,difficult:1,deadly:1}}).total,285);
  assert.equal(serviceQuote(entry("craftsman"),{quantity:2,craftValue:125}).total,320);
  assert.equal(serviceQuote(entry("fence"),{revenue:300}).total,75);
  assert.equal(serviceQuote(entry("sea-passage"),{route:"skellige",quantity:2}).total,340);
  assert.equal(serviceQuote(entry("sea-passage"),{route:"north-nilfgaard"}).total,127.5);
  assert.equal(serviceQuote({...entry("laundry"),price:.1},{quantity:3}).total,.3);
  assert.equal(serviceQuote({...entry("laundry"),price:0}).total,0);
  for(const quantity of [0,-1,1.5,Infinity,NaN,101])assert.throws(()=>serviceQuote(entry("hot-bath"),{quantity}));
  assert.throws(()=>serviceQuote(entry("fence"),{quantity:2,revenue:200}));
  assert.throws(()=>serviceQuote(entry("medic"),{wounds:{simple:-1}}));
  assert.throws(()=>serviceQuote(entry("sea-passage"),{route:"missing"}));
  assert.throws(()=>serviceQuote({...entry("hot-bath"),enabled:false}));
});

function fixture(balance=100) {
  const player={id:"player",isGM:false},gm={id:"gm",isGM:true},otherGM={id:"otherGM",isGM:true};
  const users=[player,gm,otherGM];users.activeGM=gm;users.get=id=>users.find(user=>user.id===id);
  globalThis.game={user:player,users};globalThis.CONST={CHAT_MESSAGE_STYLES:{OTHER:0}};
  const customer={uuid:"Actor.customer",name:"Customer",type:"character",isOwner:true,system:{crowns:balance},flags:{},writes:0,
    testUserPermission:user=>user?.id===player.id||user?.isGM,
    async update(data){this.writes++;this.system.crowns=data["system.crowns"];
      for(const [key,value] of Object.entries(data))if(key.startsWith("flags.")) {
        this.flags[SYSTEM_ID]??={servicePayments:{}};this.flags[SYSTEM_ID].servicePayments[key.split(".").at(-1)]=structuredClone(value);
      }return this;}
  };
  const provider={uuid:"Actor.provider",name:"Provider",type:"services",system:{closed:false,services:defaultServices()},testUserPermission:()=>true};
  const docs=new Map([[customer.uuid,customer],[provider.uuid,provider]]),messages=[];
  globalThis.foundry={utils:{fromUuid:async uuid=>docs.get(uuid)},documents:{ChatMessage:{getSpeaker:({actor})=>({actor:actor.uuid}),implementation:{
    async create(data){const message={...structuredClone(data),id:`message${messages.length}`,author:player,
      async update(changes){this.content=changes.content;this.flags[SYSTEM_ID].serviceOrder=structuredClone(changes[`flags.${SYSTEM_ID}.serviceOrder`]);return this;}};
      messages.push(message);return message;}
  }}}};
  return {customer,provider,messages,player,gm,otherGM,docs};
}

test("players send a private request without paying and concurrent clicks produce one request",async()=>{
  const {provider,customer,messages}=fixture();
  const [a,b]=await Promise.all([requestService(provider,customer,"hot-bath",{quantity:2},"<img src=x>"),requestService(provider,customer,"hot-bath",{quantity:2})]);
  assert.equal(a,b);assert.equal(messages.length,1);assert.equal(customer.system.crowns,100);assert.equal(customer.writes,0);
  assert.deepEqual(a.whisper,["gm","otherGM","player"]);assert.equal(serviceOrder(a).total,32);
  assert.equal(a.flags[SYSTEM_ID].skipLuck,true);assert.ok(a.content.includes("&lt;img"));assert.ok(!a.content.includes("<img"));
  await assert.rejects(resolveServiceOrder(a,true),/активный мастер/);
});

test("approval charges once, repeated approval and accept/reject races cannot spend twice",async()=>{
  const {provider,customer,gm}=fixture();
  const message=await requestService(provider,customer,"hot-bath",{quantity:2});game.user=gm;
  await Promise.all([resolveServiceOrder(message,true),resolveServiceOrder(message,false)]);
  await resolveServiceOrder(message,true);
  assert.equal(customer.system.crowns,68);assert.equal(customer.writes,1);assert.equal(serviceOrder(message).status,"accepted");
});

test("approval revalidates balance, ownership, service access and changed terms",async()=>{
  const {provider,customer,gm,player,otherGM}=fixture();
  const message=await requestService(provider,customer,"hot-bath",{});game.user=otherGM;
  await assert.rejects(resolveServiceOrder(message,true),/активный мастер/);game.user=gm;
  customer.system.crowns=0;await assert.rejects(resolveServiceOrder(message,true),/хватает крон/);customer.system.crowns=100;
  const service=provider.system.services.find(row=>row.id==="hot-bath");service.unit="новая единица";
  await assert.rejects(resolveServiceOrder(message,true),/Условия/);service.unit=entry("hot-bath").unit;
  provider.system.closed=true;await assert.rejects(resolveServiceOrder(message,true),/закрыто/);provider.system.closed=false;
  customer.testUserPermission=user=>user!==player;await assert.rejects(resolveServiceOrder(message,true),/своего персонажа/);
  assert.equal(customer.writes,0);assert.equal(serviceOrder(message).status,"pending");
  await resolveServiceOrder(message,false);assert.equal(serviceOrder(message).status,"rejected");assert.equal(customer.system.crowns,100);
});

test("two different orders share the inventory balance queue",async()=>{
  const {provider,customer,gm}=fixture(20);
  const first=await requestService(provider,customer,"hot-bath",{}),second=await requestService(provider,customer,"hot-bath",{});game.user=gm;
  const outcomes=await Promise.allSettled([resolveServiceOrder(first,true),resolveServiceOrder(second,true)]);
  assert.deepEqual(outcomes.map(row=>row.status),["fulfilled","rejected"]);assert.equal(customer.system.crowns,4);assert.equal(customer.writes,1);
});

test("chat failure after payment is recoverable even when retrying reject; no second debit",async()=>{
  const {provider,customer,gm}=fixture();const message=await requestService(provider,customer,"hot-bath",{});game.user=gm;
  const update=message.update;message.update=async()=>{throw new Error("chat unavailable");};
  await assert.rejects(resolveServiceOrder(message,true),/chat unavailable/);assert.equal(customer.system.crowns,84);
  assert.equal(serviceOrder(message).status,"pending");message.update=update;
  await resolveServiceOrder(message,false);assert.equal(serviceOrder(message).status,"accepted");assert.equal(customer.writes,1);
});

test("failed payment leaves order pending and deleted characters can still be rejected",async()=>{
  const {provider,customer,gm,docs}=fixture();const message=await requestService(provider,customer,"hot-bath",{});game.user=gm;
  customer.update=async()=>{throw new Error("write failed");};
  await assert.rejects(resolveServiceOrder(message,true),/write failed/);assert.equal(customer.system.crowns,100);assert.equal(serviceOrder(message).status,"pending");
  docs.delete(customer.uuid);await assert.rejects(resolveServiceOrder(message,true),/удалён/);
  await resolveServiceOrder(message,false);assert.equal(serviceOrder(message).status,"rejected");
});

test("unaffordable requests and foreign characters cannot submit; custom services support free jobs",async()=>{
  const {provider,customer}=fixture(0);
  await assert.rejects(requestService(provider,customer,"hot-bath",{}),/Недостаточно/);
  customer.testUserPermission=()=>false;await assert.rejects(requestService(provider,customer,"hot-bath",{}),/своего персонажа/);
  customer.testUserPermission=()=>true;
  provider.system.services.push({...entry("laundry"),id:"custom",ruleId:"",price:0,name:"Поручение"});
  const message=await requestService(provider,customer,"custom",{});assert.equal(serviceOrder(message).total,0);
  assert.ok(orderCard(serviceOrder(message)).includes("Поручение"));
});

test("cancelled Foundry create/update hooks do not report a false success",async()=>{
  const {provider,customer,gm}=fixture();
  const create=foundry.documents.ChatMessage.implementation.create;
  foundry.documents.ChatMessage.implementation.create=async()=>undefined;
  await assert.rejects(requestService(provider,customer,"hot-bath",{}),/отправить заказ/);
  foundry.documents.ChatMessage.implementation.create=create;
  const message=await requestService(provider,customer,"hot-bath",{});game.user=gm;
  const update=message.update;message.update=async()=>undefined;
  await assert.rejects(resolveServiceOrder(message,true),/статус заказа/);
  assert.equal(customer.system.crowns,84);
  message.update=update;await resolveServiceOrder(message,true);
  assert.equal(customer.writes,1);assert.equal(serviceOrder(message).status,"accepted");
});
