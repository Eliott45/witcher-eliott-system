import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { getProfession, professionPrerequisite } from "../scripts/data/professions.mjs";
import { blankCreation, professionSlots, skillState, creationItems, creationUpdate, crownsFormula, PROFESSION_GEAR, professionAllowed, stepErrors } from "../scripts/data/character-creation.mjs";
import { PEASANT_RITUALS, PEASANT_STEWS, harvestBonus, peasantRank, peasantModifiers, peasantImmunity } from "../scripts/data/peasant-rules.mjs";
import { peasantReference } from "../scripts/data/peasant-descriptions.mjs";
import { peasantMaterialPlan } from "../scripts/workshop/peasant-materials.mjs";
import { peasantEffectSource, peasantProduct } from "../scripts/workshop/peasant-products.mjs";
import { deriveStatistics, ATTRIBUTE_KEYS } from "../scripts/data/statistics.mjs";
import { creatureMentalImmunity } from "../scripts/combat/creature-spirits.mjs";
import { butcherDC, organicMaterial } from "../scripts/combat/peasant-targets.mjs";
import { circleEntry } from "../scripts/combat/peasant-circle.mjs";
import { cursedForTotem } from "../scripts/combat/peasant-totems.mjs";

const catalog=JSON.parse(await readFile(new URL("../pack-sources/equipment.json",import.meta.url),"utf8"));
const ability=(slug,level)=>({type:"ability",system:{ruleId:`profession.peasant.${slug}`,level}});
const collection=items=>Object.assign(items,{get:id=>items.find(item=>item.id===id)});
const peasant=(items=[],effects=[])=>({system:{details:{profession:"peasant"}},items:collection(items),effects});
const stock=(id,quantity,extra={})=>{const entry=structuredClone(catalog.find(row=>row.system.ruleId===id));assert.ok(entry,id);return {...entry,id:extra.id??id,system:{...entry.system,quantity,carried:true,...extra}};};
const meal=(recipe,level)=>({...peasantEffectSource(`stew.${recipe}`,recipe,level),statuses:new Set()});

test("peasant creation has eleven slots, an exact 44-point budget, five choices and independent beer options",()=>{
  const profession=getProfession("peasant");
  assert.equal(profession.vigor,0);assert.equal(profession.equipmentChoices,5);
  assert.deepEqual(profession.skills,"athletics brawling courage crafting endurance firstAid gambling physique smallBlades wildernessSurvival".split(" "));
  assert.equal(crownsFormula("peasant"),"20 * 2d6");
  const draft=blankCreation();Object.assign(draft,{name:"Пётр",race:"human",origin:"redania",profession:"peasant",crowns:140});
  draft.attributes={mode:"points",level:"skilled",values:Object.fromEntries(ATTRIBUTE_KEYS.map(id=>[id,["will","luck"].includes(id)?7:8]))};
  assert.equal(professionSlots("peasant").length,11);
  draft.skills.ranks=Object.fromEntries(professionSlots("peasant").map(slot=>[slot.id,4]));
  draft.skills.ranks.crafting=2; // Crafting is difficult: 9 ordinary skills, defining and 2×2 crafting = 44.
  draft.skills.pickup={awareness:6,stealth:6,swordsmanship:4};
  assert.equal(skillState(draft).spent,44);assert.deepEqual(skillState(draft).errors,[]);
  draft.gear.picks=[0,1,4,8,9];
  assert.deepEqual(stepErrors(draft,"gear"),[]);
  const gear=creationItems(draft);
  assert.equal(gear.filter(row=>row.ruleId==="gear.beer").reduce((sum,row)=>sum+row.quantity,0),2);
  for(const id of ["gear.pipe","gear.tobacco","gear.bag","gear.cooking-tools"])assert.ok(gear.some(row=>row.ruleId===id),id);
  for(const option of PROFESSION_GEAR.peasant)for(const item of option.items)assert.ok(catalog.some(row=>row.system.ruleId===item.ruleId),item.ruleId);
  const update=creationUpdate(draft,id=>id);
  assert.equal(update["system.details"].profession,"peasant");assert.equal(update["system.vigor"],0);assert.equal(update["system.crowns"],140);
  for(const race of ["human","elf","dwarf"])assert.equal(professionAllowed(race,"peasant"),true);
  assert.equal(professionAllowed("witcher","peasant"),false);
});

test("three peasant branches follow the printed columns and retain advancement prerequisites",()=>{
  const rows=getProfession("peasant").abilities;
  assert.deepEqual(rows.slice(1).map(row=>row.id.split(".").at(-1)),["harvest","animal-whisper","wisdom","butcher","panacea","stew","digger","grog","ear-bite"]);
  for(const row of rows.filter(row=>row.tier===1))assert.equal(professionPrerequisite(row).id,"profession.peasant.intolerance");
  assert.equal(professionPrerequisite(rows.find(row=>row.id.endsWith(".stew"))).id,"profession.peasant.panacea");
  assert.equal(professionPrerequisite(rows.find(row=>row.id.endsWith(".ear-bite"))).id,"profession.peasant.grog");
});

test("harvesting only adds plants with a learned skill and respects rounding and profession",()=>{
  const plant=stock("material.barley",1),stone=stock("material.sulphur",1);
  assert.equal(harvestBonus(peasant(),plant),0);
  for(const [rank,bonus]of [[1,1],[3,1],[5,2],[10,5]])assert.equal(harvestBonus(peasant([ability("harvest",rank)]),plant),bonus);
  assert.equal(harvestBonus(peasant([ability("harvest",10)]),stone),0);
  const actor=peasant([ability("harvest",10)]);actor.system.details.profession="mage";assert.equal(peasantRank(actor,"harvest"),0);
});

test("digger adds only carry capacity, and harvest meal replaces lower dwarven armor",()=>{
  const system={attributes:Object.fromEntries(ATTRIBUTE_KEYS.map(id=>[id,6])),health:{value:30},details:{profession:"peasant",race:"dwarf"}};
  const items=[ability("digger",5)];
  assert.deepEqual(peasantModifiers(peasant(items)).map(row=>[row.target,row.value]),[["carryMax",10]]);
  const options={items,abilityIds:["dwarf.tough"]};
  const base=deriveStatistics(system,options);
  assert.equal(base.carryMax,95);assert.equal(base.naturalArmor,2);
  const small=deriveStatistics(system,{...options,effects:[meal("harvest",3)]}),large=deriveStatistics(system,{...options,effects:[meal("harvest",9)]});
  assert.equal(small.naturalArmor,Math.max(base.naturalArmor,1));assert.equal(large.naturalArmor,Math.max(base.naturalArmor,3));
});

test("six recipes and seven rituals resolve ingredients and include full clickable references",()=>{
  assert.equal(PEASANT_STEWS.length,6);assert.equal(PEASANT_RITUALS.length,7);
  for(const recipe of [...PEASANT_STEWS,...PEASANT_RITUALS])for(const row of recipe.materials??[])assert.ok(catalog.some(item=>item.system.ruleId===row.id),row.id);
  assert.equal((peasantReference("profession.peasant.stew").match(/<h4>/g)??[]).length,6);
  assert.equal((peasantReference("profession.peasant.wisdom").match(/<h4>/g)??[]).length,7);
  assert.match(peasantReference("profession.peasant.stew"),/@UUID\[Compendium/);
});

test("ingredient ledger cannot reuse material, requires distinct ingredient types and consumes real herbs first",()=>{
  const actor=peasant([stock("material.barley",2),stock("material.barley",3,{id:"barley2"}),stock("material.crows-eye",1),stock("material.sulphur",1),stock("substance.vitriol",4)]);
  assert.equal(peasantMaterialPlan(actor,{materials:[{id:"material.barley",quantity:5}],plants:1}).complete,true,"a different plant can pay the plant requirement");
  assert.equal(peasantMaterialPlan(actor,{materials:[{id:"material.barley",quantity:5}],plants:2}).complete,false);
  assert.equal(peasantMaterialPlan(actor,{distinctIngredients:4}).complete,false,"two barley stacks are one type; pure substance isn't an ingredient type");
  const three=peasantMaterialPlan(actor,{distinctIngredients:3});assert.equal(three.complete,true);assert.equal(three.expenses.reduce((s,row)=>s+row.quantity,0),3);
  const ingredient=actor.items.find(row=>row.system.material.substance==="vitriol"&&!row.system.ruleId.startsWith("substance."));
  assert.ok(ingredient);
  assert.ok(!peasantMaterialPlan(actor,{substances:{vitriol:1}}).expenses.some(row=>row.itemId==="substance.vitriol"));
  actor.items.forEach(item=>item.system.carried=false);assert.equal(peasantMaterialPlan(actor,{ingredients:1}).complete,false);
});

test("grog needs both an ingredient and alcohol; a recipe spends exactly the printed quantities",()=>{
  const recipe=PEASANT_STEWS[0],actor=peasant(recipe.materials.map(row=>stock(row.id,row.quantity)));
  const plan=peasantMaterialPlan(actor,recipe);assert.equal(plan.complete,true);assert.equal(plan.expenses.reduce((s,row)=>s+row.quantity,0),12);
  assert.equal(peasantMaterialPlan(peasant([stock("material.barley",1)]),{ingredients:1,alcohol:true}).complete,false);
  assert.equal(peasantMaterialPlan(peasant([stock("material.barley",1),stock("gear.beer",1)]),{ingredients:1,alcohol:true}).complete,true);
});

test("meal immunities and fear handling stop when the timed effect expires",()=>{
  const actor=peasant([],[meal("winter",5),meal("harvest",5)]);
  assert.equal(peasantImmunity(actor,new Set(["frozen"])),true);
  assert.equal(peasantImmunity(actor,new Set(["poisoned"])),false);
  assert.ok(creatureMentalImmunity(actor,{fear:true}));
  actor.effects.forEach(effect=>effect.duration={expired:true});
  assert.equal(peasantImmunity(actor,new Set(["frozen"])),false);
  assert.equal(creatureMentalImmunity(actor,{fear:true}),"");
});

test("circle tests entry, not exit or movement inside, and honors elevation",()=>{
  const region={shapes:[{type:"ellipse",x:0,y:0,radiusX:20,radiusY:20}],flags:{[SYSTEM_ID]:{peasantCircle:{dc:20,elevation:0}}}};
  assert.equal(circleEntry(region,{x:-30,y:0},{x:0,y:0}),true);
  assert.equal(circleEntry(region,{x:-30,y:0},{x:30,y:0}),true);
  assert.equal(circleEntry(region,{x:0,y:0},{x:30,y:0}),false);
  assert.equal(circleEntry(region,{x:-30,y:0},{x:0,y:0},3),false);
});

test("butcher chooses printed difficulty, excludes inorganic and plant loot; totem detects active hexes",()=>{
  for(const [difficulty,dc]of [["Лёгкие / обычные",12],["Средние / незаурядные",16],["Трудные",20]])assert.equal(butcherDC({system:{creature:{difficulty}}}),dc);
  assert.equal(organicMaterial(stock("material.beast-bones",1)),true);assert.equal(organicMaterial(stock("material.barley",1)),false);assert.equal(organicMaterial(stock("material.sulphur",1)),false);
  assert.equal(cursedForTotem({system:{creature:{category:"cursed"}}}),true);
  const effect={flags:{[SYSTEM_ID]:{hexEffect:"hex.nightmare"}}};assert.equal(cursedForTotem(peasant([],[effect])),true);
  effect.disabled=true;assert.equal(cursedForTotem(peasant([],[effect])),false);
});

test("products store transferable maker rank, portions and perishable deadline; effects last 24 hours",()=>{
  const product=peasantProduct("panacea","Панацея",6,{expires:90000});
  assert.equal(product.system.weight,.5);assert.equal(product.system.consumption.mode,"consume");assert.equal(product.flags[SYSTEM_ID].peasantProduct.expires,90000);
  assert.equal(peasantProduct("stew.spring","Весеннее рагу",5,{quantity:6}).system.quantity,6);
  assert.equal(peasantEffectSource("stew.spring","Весеннее рагу",5).flags[SYSTEM_ID].condition.seconds,86400);
  assert.equal(peasantEffectSource("talisman","Талисман",5,{seconds:0}).flags[SYSTEM_ID].condition.seconds,undefined);
});
