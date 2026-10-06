import test from "node:test";
import assert from "node:assert/strict";
import { recipeMemory, recipeAccess, requireMemorySlot, salvagedComponents, craftingDuration } from "../scripts/data/crafting.mjs";
import { memorizeRecipe } from "../scripts/workshop/recipe-memory.mjs";
import { craftDialog } from "../scripts/workshop/crafting.mjs";
import { inventoryTransaction, copyPhysical } from "../scripts/workshop/transaction.mjs";
import { craftingContext } from "../scripts/sheets/crafting-context.mjs";
import { RECIPES } from "../scripts/data/workshop-recipes.mjs";
import { CORE_EQUIPMENT } from "../scripts/data/core-equipment.mjs";
import { MATERIALS } from "../scripts/data/workshop-materials.mjs";
import { equipmentUuid } from "../scripts/data/workshop.mjs";

function fixture() {
  const notices = [], rolls = [], dialogs = [], totals = [20], references = new Map();
  let serial = 0;
  const get = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
  const set = (object, path, value) => { const keys = path.split("."), last = keys.pop(); keys.reduce((o, k) => o[k] ??= {}, object)[last] = value; };
  const item = (id, type = "equipment", extra = {}) => ({ id, uuid: `Item.${id}`, documentName: "Item", name: id, type,
    system: { ruleId: id, quantity: 8, carried: true, price: 1, weight: 1, ...extra }, testUserPermission: () => true,
    toObject() { return { name: this.name, type: this.type, system: structuredClone(this.system) }; }
  });
  const iron = item("iron"), wood = item("wood"), result = item("result", "weapon"), tools = item("gear.crafting-tools");
  for (const i of [iron, wood, result]) references.set(i.uuid, i);
  const recipe = item("recipe", "recipe", { recipe: { category: "diagram", resultUuid: result.uuid, quantity: 2, dc: 10, time: 18000, grade: "novice", memorized: false, forge: false, tools: [tools.id], components: [{uuid:iron.uuid,quantity:3,substance:""},{uuid:wood.uuid,quantity:1,substance:""}] } });
  const items = [iron, wood, tools, recipe];
  items.get = id => items.find(i => i.id === id);
  const actor = { uuid: "Actor.craft", isOwner: true, items, effects: [], statuses: new Set(), system: { statistics: {effective:{intelligence:1,craft:6},modifiers:[]},skills:{crafting:4,alchemy:2}, details:{} },
    async updateEmbeddedDocuments(_type, updates) { for (const update of updates) for (const [key, value] of Object.entries(update)) if (key !== "_id") set(items.get(update._id),key,value); return updates.map(update=>items.get(update._id)); },
    async createEmbeddedDocuments(_type, data) { const created = data.map(source=>item(`created${serial++}`, source.type, structuredClone(source.system))); for(let i=0;i<created.length;i++){created[i].name=data[i].name;created[i].flags=data[i].flags;} items.push(...created); return created; },
    async deleteEmbeddedDocuments(_type, ids) { for(const id of ids)items.splice(items.findIndex(i=>i.id===id),1); },
    async update() {}
  };
  globalThis.game = { user: {}, settings:{get:()=>"private"}, items:{fromCompendium:source=>source.toObject()} };
  delete globalThis.Hooks;
  globalThis.foundry = {utils:{fromUuid:async uuid=>references.get(uuid),deepClone:structuredClone,getProperty:get},
    applications:{api:{DialogV2:{prompt:async config=>{dialogs.push(config);return {time:"on",borrowTools:"on",forge:"on"};},confirm:async config=>{dialogs.push(config);return true;}}}},
    documents:{ChatMessage:{getSpeaker:()=>({actor:"craft"}),create:async data=>{notices.push(data);return data;}}},
    dice:{Roll:class{constructor(formula){this.formula=formula;}async evaluate(){this.total=totals.shift();return this;}async toMessage(data){rolls.push({...data,formula:this.formula}); const message={...data,rolls:[this],update:async change=>Object.assign(message,change)};return message;}}}
  };
  return { actor, recipe, iron, wood, result, tools, totals, notices, rolls, dialogs, references, item };
}

test("printed ammunition recipes consume one set of materials and create ten/five individual projectiles", async () => {
  for (const [id, quantity] of [["armor-piercing", 10], ["broadhead", 10], ["dwarven-impact", 5], ["elven-burrowing", 5]]) {
    const f = fixture();
    const source = RECIPES.find(item => item.id === `diagram.ammunition.${id}`);
    const result = CORE_EQUIPMENT.find(item => item.id === `ammunition.${id}`);
    f.recipe.system.ruleId = source.id;
    f.recipe.system.recipe = structuredClone(source.system.recipe);
    Object.assign(f.result, { type: result.type, name: result.name, system: structuredClone(result.system) });
    f.result.system.ruleId = result.id;
    f.references.set(source.system.recipe.resultUuid, f.result);
    f.actor.system.details.profession = "craftsman";
    f.actor.items.push(f.item("profession.craftsman.master-crafting", "ability", { level: 1 }));
    const stocks = source.system.recipe.components.map(component => {
      const material = MATERIALS.find(item => equipmentUuid(item.documentId) === component.uuid);
      const stock = f.item(material.id, "equipment", { quantity: component.quantity + 1 });
      f.references.set(component.uuid, stock);
      f.actor.items.push(stock);
      return stock;
    });
    f.totals[0] = 50;
    await craftDialog(f.actor, f.recipe);
    const created = f.actor.items.filter(item => item.id.startsWith("created"));
    assert.equal(created.length, 1, id);
    assert.equal(created[0].system.ruleId, result.id);
    assert.equal(created[0].system.quantity, quantity);
    assert.ok(stocks.every(item => item.system.quantity === 1), id);
  }
});

test("master and grandmaster diagrams require Master Crafting, and allow a trained craftsman", async () => {
  for (const grade of ["master", "grandmaster"]) {
    const f = fixture();
    f.recipe.system.recipe.grade = grade;
    await assert.rejects(craftDialog(f.actor, f.recipe), /Мастерская работа/);
    assert.equal(f.dialogs.length, 0);
    assert.equal(f.iron.system.quantity, 8);
    f.actor.system.details.profession = "craftsman";
    f.actor.items.push(f.item("profession.craftsman.master-crafting", "ability", { level: 1 }));
    await craftDialog(f.actor, f.recipe);
    assert.equal(f.actor.items.filter(item => item.id.startsWith("created")).length, 1);
  }
});

test("memory uses one INT pool across formulas and diagrams, deduplicates copies and survives losing the paper", async () => {
  const {actor,recipe,item}=fixture();
  await memorizeRecipe(actor,recipe);
  const formula=item("formula","recipe",{recipe:{...recipe.system.recipe,category:"formula",memorized:false}});
  actor.items.push(formula);
  assert.deepEqual(recipeMemory(actor),{used:1,capacity:1,free:0,full:true});
  assert.throws(()=>requireMemorySlot(actor,formula),/Лимит/);
  await assert.rejects(memorizeRecipe(actor,formula),/Лимит/);
  const copy=item("copy","recipe",{ruleId:"recipe",recipe:{...recipe.system.recipe,memorized:true}});actor.items.push(copy);
  assert.equal(recipeMemory(actor).used,1);
  recipe.system.quantity=0;copy.system.carried=false;
  assert.equal(recipeAccess(actor,recipe).physical,false);
  assert.equal(recipeAccess(actor,recipe).memorized,true);
  await memorizeRecipe(actor,recipe,false);
  assert.equal(recipeMemory(actor).used,0);
  assert.equal(actor.items.get(recipe.id),undefined,"Forgotten record without paper is removed");
  assert.equal(actor.items.get(copy.id),copy,"Paper left elsewhere must not be deleted");
  assert.equal(copy.system.recipe.memorized,false);
  await memorizeRecipe(actor,formula);
  assert.equal(recipeMemory(actor).used,1);
});

test("catalog memorization creates knowledge with no weight/copy and racing additions respect capacity",async()=>{
  const {actor,recipe,item}=fixture();
  const sources=["a","b"].map(id=>item(id,"recipe",{recipe:{...recipe.system.recipe}}));
  const results=await Promise.allSettled(sources.map(source=>memorizeRecipe(actor,source)));
  assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
  assert.equal(recipeMemory(actor).used,1);
  const learned=actor.items.find(i=>i.system.recipe?.memorized);
  assert.equal(learned.system.quantity,0);assert.equal(learned.system.carried,false);
});

test("salvage rounds up per component, never per stack or repeated row; durations stay readable",()=>{
  assert.deepEqual(salvagedComponents([{uuid:"iron",quantity:1},{uuid:"iron",quantity:2},{uuid:"wood",quantity:1}]),[{uuid:"iron",quantity:2},{uuid:"wood",quantity:1}]);
  assert.equal(craftingDuration(5400),"1 ч. 30 мин.");assert.equal(craftingDuration(90000),"1 дн. 1 ч.");assert.equal(craftingDuration(27),"9 раунд.");
});

test("forgetting a catalog-only recipe removes its record and frees memory without leaving a recipe group",async()=>{
  const f=fixture();
  const source=f.item('known-only','recipe',{recipe:{...f.recipe.system.recipe}});
  await memorizeRecipe(f.actor,source);
  const learned=f.actor.items.find(item=>item.system.recipe?.memorized);
  assert.equal(learned.system.quantity,0);
  await memorizeRecipe(f.actor,learned,false);
  assert.equal(f.actor.items.get(learned.id),undefined);
  assert.equal(recipeMemory(f.actor).used,0);
  assert.equal((await craftingContext(f.actor)).groups.some(group=>group.id==='unavailable'),false);
});

test("legacy forgotten records stay hidden, but stored physical copies still appear under their own ID",async()=>{
  const f=fixture();f.recipe.system.quantity=0;
  assert.equal((await craftingContext(f.actor)).empty,true);
  const stored=f.item('stored','recipe',{ruleId:f.recipe.system.ruleId,carried:false,quantity:1,recipe:{...f.recipe.system.recipe}});
  f.actor.items.push(stored);
  const view=await craftingContext(f.actor);
  assert.equal(view.groups.length,1);
  assert.equal(view.groups[0].id,'unavailable');
  assert.equal(view.groups[0].recipes[0].id,stored.id);
});

test("custom world recipes keep identity without a ruleId and transferring paper cannot transfer memory",async()=>{
  const f=fixture();f.actor.system.statistics.effective.intelligence=6;
  const source=f.item('world-recipe','recipe',{ruleId:'',recipe:{...f.recipe.system.recipe,memorized:true}});
  assert.equal(copyPhysical(source).system.recipe.memorized,false);
  await memorizeRecipe(f.actor,source);await memorizeRecipe(f.actor,source);
  assert.equal(recipeMemory(f.actor).used,1);
  assert.equal(f.actor.items.filter(item=>item.system.recipe?.memorized).length,1);
  assert.equal(recipeAccess(f.actor,source).memorized,true);
});

test("successful crafting consumes exact components, awards output and uses physical +2 only once",async()=>{
  const f=fixture();await craftDialog(f.actor,f.recipe);
  assert.equal(f.iron.system.quantity,5);assert.equal(f.wood.system.quantity,7);
  assert.equal(f.actor.items.find(i=>i.type==="weapon").system.quantity,2);
  assert.equal(f.rolls[0].formula,"1d10wc + 10 + 2");
  assert.equal(f.rolls.length,1);assert.match(f.notices[0].content,/создано ×2/);
});

test("memorized crafting without paper has no +2; unread external recipes cannot be used",async()=>{
  const f=fixture();f.recipe.system.quantity=0;f.recipe.system.recipe.memorized=true;
  await craftDialog(f.actor,f.recipe);assert.equal(f.rolls[0].formula,"1d10wc + 10 + 0");
  const external=f.item("external","recipe",{recipe:{...f.recipe.system.recipe}});
  await assert.rejects(craftDialog(f.actor,external),/инвентаре/);
});

test("failed crafting offers exactly one immediate salvage at the same DC and returns ceil(half)",async()=>{
  const f=fixture();f.totals.splice(0,1,9,10);
  await craftDialog(f.actor,f.recipe);
  assert.equal(f.rolls.length,2);
  assert(f.rolls.every(roll=>roll.flags['witcher-eliott-system'].workshop.dc===10));
  assert.equal(f.actor.items.filter(i=>i.type==="weapon").length,0);
  assert.equal(f.actor.items.filter(i=>i.system.ruleId==="iron").reduce((n,i)=>n+i.system.quantity,0),7);
  assert.equal(f.actor.items.filter(i=>i.system.ruleId==="wood").reduce((n,i)=>n+i.system.quantity,0),8);
  assert.match(f.notices[1].content,/Возвращено в инвентарь/);
});

test("declining or failing salvage never returns materials or rolls again",async()=>{
  for(const decline of [true,false]){
    const f=fixture();f.totals.splice(0,1,1,1);
    if(decline)foundry.applications.api.DialogV2.confirm=async()=>false;
    await craftDialog(f.actor,f.recipe);
    assert.equal(f.iron.system.quantity,5);assert.equal(f.wood.system.quantity,7);
    assert.equal(f.actor.items.length,4);assert.equal(f.rolls.length,decline?1:2);
  }
});

test("cancelled, unaffordable, stale and parallel crafting requests cannot consume inventory",async()=>{
  let f=fixture();foundry.applications.api.DialogV2.prompt=async()=>null;
  await craftDialog(f.actor,f.recipe);assert.equal(f.rolls.length,0);assert.equal(f.iron.system.quantity,8);
  f=fixture();f.iron.system.quantity=1;await craftDialog(f.actor,f.recipe);assert.equal(f.rolls.length,0);
  f=fixture();foundry.applications.api.DialogV2.prompt=async()=>{f.recipe.system.recipe.dc=15;return {time:'on'};};
  await assert.rejects(craftDialog(f.actor,f.recipe),/изменился/);assert.equal(f.iron.system.quantity,8);
  f=fixture();let release;foundry.applications.api.DialogV2.prompt=()=>new Promise(resolve=>{release=resolve;});
  const first=craftDialog(f.actor,f.recipe);
  await assert.rejects(craftDialog(f.actor,f.recipe),/открытую/);
  while(!release)await new Promise(resolve=>setImmediate(resolve));release(null);await first;
  assert.equal(f.rolls.length,0);
});

test("cancelled dice and vanished tools preserve components",async()=>{
  let f=fixture();foundry.dice.Roll.prototype.toMessage=async()=>null;
  await assert.rejects(craftDialog(f.actor,f.recipe),/отменён/);assert.equal(f.iron.system.quantity,8);
  f=fixture();const send=foundry.dice.Roll.prototype.toMessage;
  foundry.applications.api.DialogV2.prompt=async()=>({time:'on'});
  foundry.dice.Roll.prototype.toMessage=async function(data){f.tools.system.carried=false;return send.call(this,data);};
  await assert.rejects(craftDialog(f.actor,f.recipe),/недоступны/);assert.equal(f.iron.system.quantity,8);
});

test("partial output creation rolls back components and any already-created output",async()=>{
  const f=fixture();foundry.utils.deepClone=structuredClone;
  const create=f.actor.createEmbeddedDocuments.bind(f.actor);
  f.actor.createEmbeddedDocuments=async(type,data)=>create(type,data.slice(0,1));
  await assert.rejects(inventoryTransaction(f.actor,{expenses:[{itemId:'iron',quantity:3}],creates:[f.result.toObject(),f.result.toObject()]}),/все предметы/);
  assert.equal(f.iron.system.quantity,8);assert.equal(f.actor.items.length,4);
});

test("crafting context separates known/carried recipes, exposes shortages and keeps broken references local",async()=>{
  const f=fixture();f.recipe.system.recipe.memorized=true;f.iron.system.quantity=1;
  f.actor.items.push(f.item('broken','recipe',{recipe:{...f.recipe.system.recipe,memorized:false,resultUuid:'',components:[]}}));
  const view=await craftingContext(f.actor);
  assert.equal(view.groups[0].id,'memory');assert.equal(view.groups[0].recipes[0].materials[0].missing,2);
  assert.equal(view.groups[0].recipes[0].unavailable,true);
  assert.equal(view.groups[1].recipes[0].error,true);
});
