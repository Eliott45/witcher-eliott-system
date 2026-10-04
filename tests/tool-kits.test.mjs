import { test } from "node:test";
import assert from "node:assert/strict";
import { CORE_GEAR } from "../scripts/data/core-equipment.mjs";
import { TOOL_RULES, toolContent, getToolRules, LEGACY_TOOL_SOURCE } from "../scripts/data/tool-rules.mjs";
import { toolDescriptionUpdate } from "../scripts/migrations/tool-descriptions.mjs";
import { SKILL_KEYS } from "../scripts/data/skills.mjs";
import { equipmentEntry } from "../scripts/data/equipment-search.mjs";
import { itemPresentation } from "../scripts/sheets/item-presentation.mjs";

test("all sixteen existing kits gain rules/descriptions without changing IDs, price, weight or folder",()=>{
  const tools=CORE_GEAR.filter(item=>item.system.kind==="tool");
  assert.equal(tools.length,16);
  assert.equal(Object.keys(TOOL_RULES).length,16);
  assert.deepEqual(tools.map(item=>[item.system.weight,item.system.price]),[[3,80],[.1,500],[.1,250],[3,15],[5,83],[1,58],[2,55],[.5,27],[.5,58],[.5,35],[1.5,60],[1,83],[4,1000],[1,80],[5,111],[1,25]]);
  for(const [index,item] of tools.entries()) {
    assert.equal(item.documentId,`eqip${String(index+1).padStart(12,"0")}`);
    assert.equal(item.source,"tools");
    assert.match(item.system.description,/<h3>Применение и правила<\/h3>/);
    assert.ok(item.system.description.length>150);
    for(const modifier of TOOL_RULES[item.id].mechanics.modifiers??[]) {
      assert.ok(SKILL_KEYS.includes(modifier.target.slice(7)));
      assert.equal(modifier.value,2);assert.ok(modifier.condition);
    }
  }
  const fish={type:"equipment",name:"Снасти",system:{...tools.find(item=>item.id==="gear.fishing-tools").system,ruleId:"gear.fishing-tools"}};
  assert.deepEqual(getToolRules(fish).modifiers,[{target:"skills.wildernessSurvival",value:2,condition:"fishing"}]);
  assert.match(equipmentEntry(fish).traitDetails.find(trait=>trait.label.startsWith("+2")).description,/только при ловле рыбы/);
  assert.equal(getToolRules({system:{ruleId:"custom"}}),null);
  assert.equal(TOOL_RULES["gear.alchemy-tools"].mechanics.includedVessels,10);
  assert.equal(TOOL_RULES["gear.gem-amulet"].mechanics.focus,3);
  assert.deepEqual(TOOL_RULES["gear.forge"].mechanics.capabilities,["forge"]);
});

test("tool enrichment upgrades old stock once and preserves player prose, custom mechanics and inventory state",()=>{
  const old={type:"equipment",name:"Мой набор",img:"custom.webp",system:{ruleId:"gear.makeup-kit",description:`<p>${LEGACY_TOOL_SOURCE}</p>`,source:LEGACY_TOOL_SOURCE,properties:"+2 к Соблазнению и Харизме",concealment:"large",quantity:2,price:999,weight:3,containerId:"bag"}};
  const update=toolDescriptionUpdate(old);
  assert.equal(update["system.concealment"],"tiny");
  assert.match(update["system.description"],/макияжа/);
  for(const [key,value] of Object.entries(update))old.system[key.slice(7)]=value;
  assert.deepEqual(toolDescriptionUpdate(old),{});
  assert.equal(old.system.price,999);assert.equal(old.system.quantity,2);assert.equal(old.system.containerId,"bag");assert.equal(old.img,"custom.webp");
  const custom={...old,system:{...old.system,description:"<p>Состав и заметки игрока</p>",properties:"+5 по договорённости",source:"Мой мир",concealment:"none"}};
  assert.deepEqual(toolDescriptionUpdate(custom),{});
  assert.deepEqual(toolDescriptionUpdate({type:"equipment",system:{ruleId:"custom"}}),{});
  assert.equal(toolContent("custom"),null);
});

test("inventory descriptions avoid repeating canonical tool bonuses while preserving custom properties",async()=>{
  globalThis.foundry={applications:{ux:{TextEditor:{implementation:{enrichHTML:async html=>html}}}}};
  const item={type:"equipment",name:"Снасти",system:{ruleId:"gear.fishing-tools",kind:"tool",...toolContent("gear.fishing-tools")}};
  assert.equal((await itemPresentation(item)).properties,"");
  item.system.properties="Собственный бонус +5";
  assert.equal((await itemPresentation(item)).properties,item.system.properties);
});

test("dragging a legacy tool into a new inventory enriches its description without resetting its fields",async()=>{
  globalThis.foundry={documents:{Item:class {async _preCreate(){} updateSource(update){for(const [key,value] of Object.entries(update)){if(key.startsWith("system."))this.system[key.slice(7)]=value;else this[key]=value;}}}}};
  const { WitcherItem }=await import("../scripts/documents/witcher-item.mjs");
  const item=Object.assign(new WitcherItem(),{type:"equipment",name:"Набор",img:"custom.webp",system:{ruleId:"gear.alchemy-tools",kind:"tool",quantity:1,weight:3,description:`<p>${LEGACY_TOOL_SOURCE}</p>`}});
  await item._preCreate({img:item.img},{},{});
  assert.match(item.system.description,/десять сосудов/);assert.equal(item.system.quantity,1);assert.equal(item.img,"custom.webp");
});
