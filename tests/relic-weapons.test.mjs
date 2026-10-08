import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RELIC_WEAPONS, RELIC_WEAPON_LORE } from "../scripts/data/relic-weapons.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "../scripts/data/witcher-special-equipment.mjs";
import { compendiumData } from "../tools/compendium-data.mjs";
import { packRecords, expandPackRecord } from "../tools/pack-records.mjs";
import { equipmentQuote } from "../scripts/data/equipment-purchase.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";

const translations=JSON.parse(await readFile(new URL("../lang/ru.json",import.meta.url),"utf8"));
const catalog=compendiumData(translations).equipment;
const byId=id=>RELIC_WEAPONS.find(item=>item.id===`weapon.${id}`);

test("all fourteen relic weapons reproduce pp.257–263 including projectile ranges and lore difficulties",()=>{
  // id, skill, damage types, accuracy, damage, reliability, hands, range, BODY multiplier, weight, lore DC, page.
  const rows=[
    ["devin","swordsmanship","К/Р",0,"10d6",20,2,0,0,2,18,257],
    ["headtaker","swordsmanship","К/Р",0,"8d6+2",20,2,0,0,3,16,257],
    ["wolf","swordsmanship","Р/К",2,"7d6",15,2,0,0,4,16,258],
    ["caroline","swordsmanship","К/Р",3,"9d6",15,2,0,0,3,20,258],
    ["thorn","smallBlades","К/Р",3,"3d6",15,1,0,2,0.5,15,259],
    ["beheader","melee","Р",0,"10d6",20,2,0,0,4,14,259],
    ["oghyr","melee","Д",0,"10d6",15,2,0,0,5,17,260],
    ["abyss-warden","staffSpear","К/Д",2,"7d6+4",10,2,0,2,4,18,260],
    ["succubus-staff","staffSpear","Д",0,"3d6+2",5,2,0,0,2,20,261],
    ["moon-bow","archery","К",1,"8d6+2",10,2,200,0,2,17,261],
    ["red-death","crossbow","К",2,"10d6",15,2,300,0,2.5,16,262],
    ["fate","swordsmanship","Р/К",3,"2d6+1",10,2,0,0,4,19,262],
    ["moon-blade","swordsmanship","Р/К",1,"3d6",10,2,0,0,4,18,263],
    ["mogrim","swordsmanship","Р/К",0,"2d6",10,2,0,0,6,22,263]
  ];
  assert.equal(RELIC_WEAPONS.length,14);
  for(const [id,skill,damageType,accuracy,damage,reliability,hands,range,rangeBodyMultiplier,weight,dc,page]of rows) {
    const item=byId(id),s=item.system;assert.ok(item,id);
    assert.deepEqual([s.skill,s.damageType,s.accuracy,s.damage,s.reliability,s.hands,s.range,s.rangeBodyMultiplier,s.weight],
      [skill,damageType,accuracy,damage,{value:reliability,max:reliability},hands,range,rangeBodyMultiplier,weight],id);
    assert.equal(s.category,range?"ranged":"melee",id);assert.equal(s.concealment,id==="thorn"?"small":"none",id);
    assert.equal(s.enhancementSlots,3,id);assert.equal(s.rarity,"unique",id);assert.equal(item.type,"weapon",id);
    assert.deepEqual(RELIC_WEAPON_LORE[item.id],{dc,page});assert.match(s.description,new RegExp(`Образования СЛ ${dc}`));
  }
});

test("relic properties retain exact chances, greater-focus elements, one unusual balanced bonus and all passive bonuses",()=>{
  const properties=id=>byId(id).system.properties;
  assert.match(properties("devin"),/магия воздуха/);assert.match(properties("devin"),/Дезориентирующее \(−2\)/);
  assert.match(properties("headtaker"),/Сбалансированное \(\+5\)/);assert.doesNotMatch(byId("headtaker").system.description,/урону при сильной/);
  assert.match(properties("wolf"),/Кровопускающее \(75%\)/);
  assert.match(properties("caroline"),/магия воды/);assert.match(properties("caroline"),/Кровопускающее \(75%\)/);
  assert.match(properties("thorn"),/Кровопускающее \(75%\); Отравление \(100%\)/);
  assert.match(properties("beheader"),/Кровопускающее \(100%\)/);assert.match(properties("oghyr"),/Дезориентирующее \(−4\)/);
  for(const id of ["abyss-warden","moon-bow","mogrim"])assert.match(properties(id),/Замораживание \(75%\)/);
  assert.match(properties("abyss-warden"),/магия воды/);
  assert.match(properties("succubus-staff"),/Горение \(25%\)/);assert.match(properties("succubus-staff"),/магия огня/);assert.match(properties("succubus-staff"),/Фокусирующее \(5\)/);
  assert.match(properties("moon-bow"),/\+3 урона призракам/);assert.match(properties("red-death"),/Отравление \(100%\)/);
  assert.match(properties("fate"),/Серебряное \(6d6\+4\)/);assert.match(properties("fate"),/магия воды и огня/);assert.match(properties("fate"),/Ошеломление \(75%\)/);
  assert.match(properties("moon-blade"),/Серебряное \(7d6\+4\)/);assert.doesNotMatch(properties("moon-blade"),/магия /);
  assert.match(properties("mogrim"),/Серебряное \(6d6\+4\)/);assert.match(properties("mogrim"),/магия земли и воды/);
  assert.deepEqual(byId("caroline").system.wearerBonuses,[{target:"healthMax",value:25}]);
  assert.deepEqual(byId("succubus-staff").system.wearerBonuses,[{target:"skills.seduction",value:2}]);
  assert.deepEqual(byId("red-death").system.wearerBonuses,[{target:"skills.hexWeaving",value:3},{target:"skills.resistMagic",value:3}]);
});

test("relics preserve existing sword identities and export independent unpriced catalogue Items without duplicate IDs",async()=>{
  assert.equal(byId("wolf").documentId,"relicWolf0000001");assert.equal(byId("moon-blade").documentId,"relicMoonBlade01");
  assert.equal(new Set(RELIC_WEAPONS.map(item=>item.id)).size,14);assert.equal(new Set(RELIC_WEAPONS.map(item=>item.documentId)).size,14);
  globalThis.game={user:{}};
  for(const entry of RELIC_WEAPONS) {
    assert.match(entry.documentId,/^[a-zA-Z0-9]{16}$/);assert.equal(WITCHER_SPECIAL_EQUIPMENT.filter(item=>item.id===entry.id).length,1);
    const matches=catalog.filter(item=>item._id===entry.documentId);assert.equal(matches.length,1,entry.name);
    const item=matches[0];assert.equal(item.system.ruleId,entry.id);assert.equal(item.flags[SYSTEM_ID].priceUnavailable,true);assert.equal(item.system.price,0);
    const quote=equipmentQuote({isOwner:true,system:{crowns:10000}},{...item,testUserPermission:()=>true});
    assert.equal(quote.canAdd,true);assert.equal(quote.canBuy,false);assert.match(quote.buyReason,/цена не указана/);
    const records=packRecords("Item",[item]),stored=new Map(records.map(row=>[`${row.sublevel}:${row.key}`,row.value]));
    assert.deepEqual(await expandPackRecord("Item",stored.get(`items:${item._id}`),(level,key)=>stored.get(`${level}:${key}`)),item);
  }
});
