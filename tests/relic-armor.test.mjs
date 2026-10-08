import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compendiumData, compendiumFolders } from "../tools/compendium-data.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { armorZones } from "../scripts/data/physical-items.mjs";
import { equipmentEntry } from "../scripts/data/equipment-search.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";
import { relicArmorContentUpdate } from "../scripts/migrations/relic-armor-content.mjs";
import { EQUIPMENT_CONTENT_VERSION, migrateEquipmentContent } from "../scripts/migrations/equipment-content.mjs";

const translations=JSON.parse(await readFile(new URL("../lang/ru.json",import.meta.url),"utf8"));
const sources=compendiumData(translations).equipment,folders=compendiumFolders(translations).equipment;
const ids=["armor.raven","armor.mountain-folk","armor.draug"];
const canonical=id=>structuredClone(sources.find(item=>item.system.ruleId===id));
const oldLegend="<p>Лёгкий комплект из легенды о ведьмаке Вороне и Чёрном Драконе. Историю можно вспомнить Образованием СЛ 14.</p>";
const legacy=()=>{const item=canonical("armor.raven");item.system.description=item.system.description.replace(/^<p>.*?<\/p>/u,oldLegend);return item;};

test("the three printed relic armor sets preserve stable identity, coverage, slots and all table mechanics",()=>{
  const expected=[
    ["relicRavenArmor1","Доспехи Ворона","light",12,0,12,["torso","legs"],14],
    ["relicMountain001","Доспехи Горного народа","medium",24,0,15,["head","torso","legs"],16],
    ["relicDraugArmor1","Доспехи драуга","heavy",36,3,37,["head","torso","legs"],18]
  ];
  for(const [index,id]of ids.entries()) {
    const item=canonical(id),[documentId,name,armorClass,sp,encumbrance,weight,zones,dc]=expected[index];
    assert.equal(item._id,documentId);assert.equal(item.name,name);assert.equal(item.type,"armor");
    assert.equal(item.system.armorClass,armorClass);assert.deepEqual(item.system.stoppingPower,{value:sp,max:sp});
    assert.equal(item.system.encumbrance,encumbrance);assert.equal(item.system.weight,weight);assert.equal(item.system.enhancementSlots,3);
    assert.equal(item.system.rarity,"unique");assert.deepEqual(armorZones(item),zones);
    assert.match(item.system.description,new RegExp(`Образованием СЛ ${dc}`));
    assert.equal(sources.filter(entry=>entry._id===documentId).length,1);
  }
  assert.deepEqual(canonical(ids[0]).system.wearerBonuses,[{target:"healthMax",value:15},{target:"skills.courage",value:3}]);
  assert.equal(canonical(ids[1]).system.wearerBonuses?.length??0,0);
  assert.deepEqual(canonical(ids[2]).system.wearerBonuses,[{target:"healthMax",value:25},{target:"skills.resistMagic",value:2},{target:"skills.spellCasting",value:2}]);
  assert.equal(canonical(ids[1]).system.resistances,"Р/К/Д; Яд");
  assert.equal(canonical(ids[2]).system.resistances,"Огонь; Кровотечение; Яд");
  assert.match(canonical(ids[0]).system.description,/двадцать дней/);
  assert.match(canonical(ids[1]).system.description,/обрушил штольни/);
  assert.match(canonical(ids[2]).system.description,/Вандергрифта/);
  for(const id of ids)assert.ok(WITCHER_SPECIAL_EQUIPMENT.some(entry=>entry.id===id));
});

test("all relic armor is unpriced and can be granted but never bought for zero crowns",()=>{
  globalThis.game={user:{}};
  for(const id of ids) {
    const item={...canonical(id),testUserPermission:()=>true};
    assert.equal(item.system.price,0);assert.equal(item.flags[SYSTEM_ID].priceUnavailable,true);
    const quote=equipmentQuote({isOwner:true,system:{crowns:1000}},item);
    assert.equal(quote.canAdd,true);assert.equal(quote.canBuy,false);assert.match(quote.buyReason,/цена не указана/);
    assert.match(equipmentEntry(item).summary,/Цена не указана/);
  }
});

test("Raven legend migration replaces only shipped prose while retaining custom paragraphs and every physical field",()=>{
  const item=legacy();item.system.description+="<p>Моя заметка: подарок наставника.</p>";
  item.name="Наследство школы";item.system.stoppingPower={value:7,max:18};item.system.quantity=2;item.system.price=900;
  item.system.wearerBonuses=[{target:"healthMax",value:20}];const before=structuredClone(item);
  const update=relicArmorContentUpdate(item);assert.deepEqual(item,before);assert.deepEqual(Object.keys(update),["system.description"]);
  assert.match(update["system.description"],/двадцать дней/);assert.match(update["system.description"],/Моя заметка/);
  item.system.description=update["system.description"];assert.deepEqual(relicArmorContentUpdate(item),{});
  item.system.description="<p>Моя собственная история этих доспехов.</p>";assert.deepEqual(relicArmorContentUpdate(item),{});
  item.system.ruleId="armor.custom";item.system.description=oldLegend;assert.deepEqual(relicArmorContentUpdate(item),{});
});

function put(item,patch) {
  for(const [path,value]of Object.entries(patch)) {
    if(path==="_id")continue;
    const keys=path.split("."),last=keys.pop(),target=keys.reduce((target,key)=>target[key]??={},item);
    target[last]=structuredClone(value);
  }
}
function migrationFixture() {
  let version=22;const writes=[],index=new Map(sources.filter(item=>!["armor.mountain-folk","armor.draug"].includes(item.system.ruleId)).map(item=>[item._id,structuredClone(item)]));
  const raven=legacy();raven.name="Ворон игрока";raven.system.stoppingPower={value:5,max:19};raven.system.price=1200;raven.system.description+="<p>Запись хозяина.</p>";
  index.set(raven._id,raven);
  const world=legacy();world._id="worldRaven000001";world.system.description="<p>Собственная легенда.</p>";
  const worn=legacy();worn._id="wornRaven0000001";worn.id=worn._id;worn.system.equipped=true;worn.system.stoppingPower.value=4;worn.system.description+="<p>Заметка персонажа.</p>";
  const actor={uuid:"Actor.owner",items:[worn],async updateEmbeddedDocuments(type,updates){assert.equal(type,"Item");for(const update of updates)put(this.items.find(item=>item.id===update._id),update);writes.push(["actor",updates]);}};
  const pack={collection:`${SYSTEM_ID}.equipment`,locked:true,folders:new Map(folders.map(folder=>[folder._id,folder])),getIndex:async()=>index,getDocument:async id=>index.get(id),
    async configure({locked}){this.locked=locked;writes.push(["lock",locked]);}};
  const gm={id:"gm"};globalThis.game={user:gm,users:{activeGM:gm},packs:new Map([[pack.collection,pack]]),items:[world],actors:[actor],scenes:[],
    settings:{get:()=>version,set:async(_scope,_key,value)=>{version=value;}}};
  globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith("folders.json")?folders:sources});
  globalThis.foundry={documents:{Item:{implementation:{
    async createDocuments(items,options){assert.equal(pack.locked,false);assert.equal(options.keepId,true);for(const item of items)index.set(item._id,structuredClone(item));writes.push(["create",items.map(item=>item.system.ruleId)]);return items;},
    async updateDocuments(updates,options){const list=options?.pack?index:new Map(game.items.map(item=>[item._id,item]));for(const update of updates)put(list.get(update._id),update);writes.push([options?.pack?"catalog":"world",updates]);return updates;}
  }}}};
  return {index,pack,writes,raven,world,worn,gm,get version(){return version;}};
}

test("content v23 appends only missing relics and updates stock Raven legends without resetting customized or worn armor",async()=>{
  const state=migrationFixture(),ravenBefore=structuredClone(state.raven),worldBefore=structuredClone(state.world),wornBefore=structuredClone(state.worn);
  game.user={id:"another-gm"};await migrateEquipmentContent();assert.equal(state.writes.length,0);
  game.user=state.gm;await migrateEquipmentContent();
  assert.deepEqual(state.writes.filter(row=>row[0]==="create").map(row=>row[1]),[["armor.mountain-folk","armor.draug"]]);
  assert.equal(state.version,EQUIPMENT_CONTENT_VERSION);assert.equal(state.pack.locked,true);
  assert.deepEqual({...state.raven,system:{...state.raven.system,description:ravenBefore.system.description}},ravenBefore);
  assert.match(state.raven.system.description,/Запись хозяина/);assert.match(state.raven.system.description,/двадцать дней/);
  assert.deepEqual(state.world,worldBefore);
  assert.deepEqual({...state.worn,system:{...state.worn.system,description:wornBefore.system.description}},wornBefore);
  assert.match(state.worn.system.description,/Заметка персонажа/);
  const count=state.writes.length;await migrateEquipmentContent();assert.equal(state.writes.length,count);
});
