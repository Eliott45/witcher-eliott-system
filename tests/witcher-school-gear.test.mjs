import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SCHOOL_GEAR, SCHOOL_DIAGRAMS, SCHOOL_MATERIALS, SCHOOL_GEAR_FOLDER, schoolStartingGear } from "../scripts/data/witcher-school-gear.mjs";
import { MANTICORE_EQUIPMENT } from "../scripts/data/manticore-school.mjs";
import { blankCreation, creationItems, crownsFormula, usesSchoolGear, gearCrowns, stepErrors } from "../scripts/data/character-creation.mjs";
import { creationContext } from "../scripts/sheets/creation-context.mjs";
import { equipmentUuid, materialPlan } from "../scripts/data/workshop.mjs";
import { recipeRelations } from "../scripts/data/recipe-links.mjs";
import { recipeDetailsUpdate } from "../scripts/migrations/recipe-details.mjs";
import { schoolGearSnapshot, schoolCriticalLevel, schoolReactions, schoolReactionAvailable, validateSchoolReaction, schoolReactionTarget } from "../scripts/combat/school-gear-rules.mjs";
import { useSchoolReaction } from "../scripts/combat/school-gear-chat.mjs";
import { weaponHitTraits } from "../scripts/combat/weapon-hit-effects.mjs";
import { weaponDamageTraits } from "../scripts/combat/damage-rules.mjs";
import { defenseQuote } from "../scripts/combat/defense-rolls.mjs";
import { weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { rollWeaponAttack } from "../scripts/combat/weapon-rolls.mjs";
import { SYSTEM_ID as SYS } from "../scripts/config.mjs";

const documents = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8"));
const owned = entry => ({ id: entry.documentId, name: entry.name, type: entry.type, system: { ...structuredClone(entry.system), ruleId: entry.id, quantity: 1, carried: true, equipped: true } });
function fixture(school = "wolf") {
  const weapon = owned(SCHOOL_GEAR.find(entry => entry.id === `weapon.school-${school}-steel`)), armor = owned(SCHOOL_GEAR.find(entry => entry.id === `armor.school-${school}`));
  const items = [weapon, armor]; items.get = id => items.find(item => item.id === id);
  const actor = { id: "hero", uuid: "Actor.hero", type: "character", isOwner: true, items, effects: [], flags: {},
    system: { details: { race: "human" }, attributes: {}, skills: { swordsmanship: 6, smallBlades: 6, melee: 6, crossbow: 6, brawling: 6 }, statistics: { effective: { reflex: 8, dexterity: 8, body: 8 }, modifiers: [] }, stamina: { value: 2 }, combatAction: { extra: true, lastExtraRound: "fight:1" } },
    async update(changes) { for (const [path, value] of Object.entries(changes)) { const keys = path.split("."); let at = this; for (const key of keys.slice(0, -1)) at = at[key] ??= {}; at[keys.at(-1)] = value; } } };
  const messages = []; messages.get = id => messages.find(message => message.id === id); messages.contents = messages;
  globalThis.game = { messages, settings: { get: () => "blind" }, user: { isGM: true }, combat: { id: "fight", started: true, round: 1, turn: 0, combatants: [{actor}] } };
  const source = { id: "attack", speakerActor: actor, rolls: [{total:20}], flags: {[SYS]: {weaponAttack: {schoolGear:schoolGearSnapshot(actor,weapon)}}} };
  const trigger = {id:"applied",isContentVisible:true,flags:{[SYS]:{exchange:{attack:source.id,index:0,kind:"applied",schoolCritical:true}}}};
  messages.push(source,trigger);
  return { actor, weapon, armor, source, trigger, messages };
}

test("all six complete kits, stable IDs, exact printed armor/sword stats and no duplicated Manticore shield", () => {
  assert.equal(SCHOOL_GEAR.length,22); assert.equal(SCHOOL_DIAGRAMS.length,22); assert.equal(SCHOOL_MATERIALS.length,10);
  assert.equal(new Set(documents.map(item=>item._id)).size,documents.length);
  assert.equal(new Set(documents.map(item=>item.system.ruleId)).size,documents.length);
  assert.equal(documents.filter(item=>item.system.ruleId === "weapon.manticore-shield").length,1);
  assert.equal(documents.filter(item=>item.system.ruleId === "diagram.weapon.manticore-shield").length,1);
  const expected = { bear:[0,"6d6+2","3d6+2",20,3,24],cat:[2,"4d6+2","1d6+2",6,0,3],griffin:[1,"5d6+2","2d6+2",16,1,18],manticore:[1,"5d6+2","2d6+2",12,1,10],viper:[2,"4d6+2","1d6+2",8,0,5],wolf:[1,"5d6+2","2d6+2",14,1,14] };
  for (const [school,[accuracy,steel,silver,sp,ev,weight]] of Object.entries(expected)) {
    const kit=schoolStartingGear(school),gear=kit.filter(item=>!item.ruleId.startsWith("diagram."));
    assert.equal(gear.length,school === "wolf" ? 3 : 4); assert.equal(kit.length,gear.length*2);
    const get=kind=>SCHOOL_GEAR.find(item=>item.id === `weapon.school-${school}-${kind}`).system;
    assert.equal(get("steel").accuracy,accuracy); assert.equal(get("steel").damage,steel); assert.equal(get("silver").damage,silver);
    for (const kind of ["steel","silver"]) { const weapon=get(kind);assert.equal(weapon.hands,1);assert.equal(weapon.enhancementSlots,school === "wolf" ? 3 : 2);assert.equal(weapon.reliability.max,kind === "steel" ? 15 : 10);assert.equal(weapon.weight,kind === "steel" ? 2.5 : 1.5); }
    const armor=SCHOOL_GEAR.find(item=>item.id === `armor.school-${school}`).system;
    assert.deepEqual([armor.stoppingPower.max,armor.encumbrance,armor.weight,armor.zone,armor.enhancementSlots],[sp,ev,weight,"torso-legs",2]);
  }
  assert.equal(schoolStartingGear("viper").find(entry=>entry.ruleId === "weapon.school-viper-fang").quantity,2);
});

test("every new diagram resolves its result/components, spends exact quantities, exposes reverse links and has no fabricated purchase price", () => {
  const docs=documents.map(item=>({...item,id:item._id,uuid:equipmentUuid(item._id)})), refs=new Map(docs.map(item=>[item.uuid,item]));
  for (const entry of [...SCHOOL_GEAR,...SCHOOL_DIAGRAMS,...SCHOOL_MATERIALS]) {
    const item=docs.find(item=>item.system.ruleId === entry.id);
    assert.equal(item.folder,SCHOOL_GEAR_FOLDER.id);assert.equal(item.system.source,"Снаряжение ведьмака"); assert.equal(item.flags[SYS].priceUnavailable,true);
    if (item.type !== "recipe") continue;
    const recipe=item.system.recipe,result=refs.get(recipe.resultUuid);
    assert.ok(result); assert.equal(item.system.rarity,"rare");assert.equal(recipe.grade,"master");assert.equal(recipe.forge,true);
    assert.ok(recipeRelations(result,docs).recipes.some(row=>row.id === item.id));
    const stock=recipe.components.map(component=> { const ref=refs.get(component.uuid); assert.ok(ref,component.uuid);assert.ok(recipeRelations(ref,docs).uses.some(row=>row.document.id === item.id));return {...ref,system:{...ref.system,quantity:component.quantity,carried:true}}; });
    assert.equal(materialPlan(stock,recipe.components,refs).complete,true);
    stock[0].system.quantity--;assert.equal(materialPlan(stock,recipe.components,refs).complete,false);
  }
  const bear=SCHOOL_DIAGRAMS.find(entry=>entry.id === "diagram.armor.school-bear").system.recipe;
  assert.equal(bear.time,25*3600);assert.equal(bear.investment,1813);
  assert.equal(bear.components.find(row=>refs.get(row.uuid).system.ruleId === "material.dark-steel").quantity,4);
});

test("alternative creation grants kit, diagrams, medallion and formulas, ignores old gear picks, preserves the ordinary option", () => {
  const state={...blankCreation(),race:"witcher",profession:"witcher",crowns:40};
  state.gear.schoolKit=true;state.gear.picks=[0,1]; state.witcher.school="viper";
  state.gear.formulas={elixir:["formula.potion.swallow","formula.potion.cat"],oil:["formula.oil.specter","formula.oil.necrophage"],decoction:["formula.decoction.griffin"]};
  assert.equal(usesSchoolGear(state),true);assert.equal(crownsFormula(state.profession,true),"10 * 1d6");assert.equal(gearCrowns(state),0);
  const items=creationItems(state);assert.equal(items.length,15);assert.equal(items.filter(entry=>entry.ruleId === "weapon.school-viper-fang").length,2);assert.ok(items.some(item=>item.ruleId === "gear.witcher-medallion"));
  assert.equal(items.filter(item=>item.ruleId.startsWith("formula.")).length,5);assert.ok(!items.some(item=>item.ruleId === "weapon.witcher-steel-sword"));
  assert.deepEqual(stepErrors(state,"gear"),[]);assert.equal(creationContext(state).gear.crownsDice,"1d6");
  state.witcher.school="";assert.match(stepErrors(state,"gear").join(),/школу/);
  state.gear.schoolKit=false;assert.ok(creationItems(state).some(item=>item.ruleId === "weapon.witcher-steel-sword"));assert.equal(crownsFormula("witcher"),"50 * 2d6");
  state.race="human";state.profession="mage";state.gear.schoolKit=true;assert.equal(usesSchoolGear(state),false);
});

test("Manticore's newer recipe updates only the exact legacy component list and preserves a customized recipe", () => {
  const source=structuredClone(documents.find(item=>item.system.ruleId === "diagram.weapon.manticore-shield"));
  const acid=documents.find(item=>item.system.ruleId === "material.etching-acid");
  source.system.recipe.components.find(row=>row.uuid === equipmentUuid(acid._id)).quantity=4;
  const update=recipeDetailsUpdate(source);assert.equal(update["system.recipe.components"].find(row=>row.uuid === equipmentUuid(acid._id)).quantity,2);
  source.system.recipe.components[0].quantity=9;assert.equal(recipeDetailsUpdate(source)["system.recipe.components"],undefined);
});

test("Bear armor upgrades only a real critical from a witcher weapon and caps at deadly, regardless of race or school", () => {
  const {actor,weapon,armor}=fixture("bear"),snapshot=schoolGearSnapshot(actor,weapon);
  assert.equal(snapshot.witcherWeapon,true);assert.deepEqual([6,7,10,13,15].map(margin=>schoolCriticalLevel(margin,snapshot)?.id??null),[null,"medium","severe","deadly","deadly"]);
  assert.equal(schoolCriticalLevel(7,snapshot).bonus,5);
  armor.system.equipped=false;assert.equal(schoolCriticalLevel(7,schoolGearSnapshot(actor,weapon)).id,"light");
  armor.system.equipped=true;weapon.system.ruleId="weapon.dagger";assert.equal(schoolCriticalLevel(7,schoolGearSnapshot(actor,weapon)).id,"light");
  assert.equal(schoolCriticalLevel(7,snapshot).id,"medium","the snapshot is independent of later inventory changes");
});

test("school weapon properties feed existing damage/status logic, and Viper Fang reduces parry penalties", () => {
  const get=id=>SCHOOL_GEAR.find(item=>item.id === id).system;
  assert.equal(weaponHitTraits(get("weapon.school-bear-steel")).ablating,true);
  assert.equal(weaponHitTraits(get("weapon.school-cat-silver")).bleeding,30);
  assert.equal(weaponHitTraits(get("weapon.school-viper-steel")).poisoned,30);
  assert.equal(weaponDamageTraits(get("weapon.school-wolf-steel")).piercing,"improved");
  const {actor}=fixture("viper"),fang=owned(SCHOOL_GEAR.find(item=>item.id === "weapon.school-viper-fang"));actor.items.push(fang);
  assert.equal(defenseQuote(actor,{mode:"parry",itemId:fang.id}).penalty,-1);
  assert.equal(defenseQuote(actor,{mode:"parry",itemId:fang.id,incoming:"thrown"}).penalty,-3);
  assert.equal(defenseQuote(actor,{mode:"block",itemId:fang.id}).penalty,0);
  assert.match(defenseQuote(actor,{mode:"parry",itemId:fang.id,incoming:"ranged"}).blocked,/стрелы/);
});

for (const school of ["cat","griffin","wolf"]) test(`${school}: applied critical offers the correct one-use reaction; a changed turn, armor removal or ordinary hit cannot`, () => {
  const {actor,armor,trigger,messages}=fixture(school),reaction=schoolReactions(trigger)[0];
  assert.equal(reaction.school,school);assert.equal(schoolReactionAvailable(reaction),true);
  armor.system.equipped=false;assert.equal(schoolReactionAvailable(reaction),false);armor.system.equipped=true;
  game.combat.turn++;assert.equal(schoolReactionAvailable(reaction),false);game.combat.turn--;
  trigger.flags[SYS].exchange.schoolCritical=false;assert.deepEqual(schoolReactions(trigger),[]);trigger.flags[SYS].exchange.schoolCritical=true;
  messages.push({id:"receipt",speakerActor:actor,flags:{[SYS]:{schoolReaction:{triggerId:trigger.id,school}}}});assert.equal(schoolReactionAvailable(reaction),false);
});

for (const school of ["viper","manticore"]) test(`${school}: defense margin must exceed four, with the correct mode and weapon snapshot`, () => {
  const {actor,weapon,source,trigger}=fixture(school),shield=owned(MANTICORE_EQUIPMENT[0]);actor.items.push(shield);
  trigger.speakerActor=actor;trigger.flags[SYS].exchange.kind="defense";trigger.rolls=[{total:24}];
  trigger.flags[SYS].defense={mode:"parry",itemId:school === "manticore" ? shield.id : weapon.id,schoolGear:schoolGearSnapshot(actor,school === "manticore" ? shield : weapon)};
  assert.deepEqual(schoolReactions(trigger),[]);trigger.rolls[0].total=25;
  assert.equal(schoolReactions(trigger)[0].school,school);
  trigger.flags[SYS].defense.mode="block";assert.equal(schoolReactions(trigger).length,school === "manticore" ? 1 : 0);
  trigger.flags[SYS].defense.mode="dodge";assert.deepEqual(schoolReactions(trigger),[]);
  assert.equal(source.rolls[0].total,20);
});

test("free strikes never give a fast pair or an NPC's multiattack; fake and wrong-school requests fail", () => {
  const {actor,weapon,trigger}=fixture();
  const request={triggerId:trigger.id,school:"wolf"};assert.ok(validateSchoolReaction(actor,request,weapon));
  assert.throws(()=>validateSchoolReaction(actor,{...request,school:"cat"},weapon),/недоступна/);
  assert.throws(()=>validateSchoolReaction(actor,request,weapon,{mode:"strong"}),/один удар/);
  assert.equal(weaponAttack(actor,weapon,{schoolReaction:true}).attack.pair,false);
  actor.type="npc";weapon.system.attackRate=3;assert.equal(weaponAttack(actor,weapon,{mode:"npc"}).attack.count,3);
  assert.equal(weaponAttack(actor,weapon,{schoolReaction:true}).attack.count,1);
  const crossbow=owned(SCHOOL_GEAR.find(entry=>entry.id === "weapon.school-bear-crossbow"));crossbow.system.loaded=true;actor.items.push(crossbow);actor.type="character";
  assert.equal(weaponAttack(actor,crossbow,{schoolReaction:true}).attack.count,1);
});

test("a real follow-up roll ignores a spent extra action, preserves STA/fast-pair state, and cannot be reused", async () => {
  const {actor,weapon,source,trigger,messages}=fixture();actor.flags[SYS]={fastStrike:{round:"fight:1",second:false}};
  const scene={id:"scene",grid:{size:100,distance:2},tokens:[]};
  const token=(id,x,a)=>({id,uuid:`Scene.scene.Token.${id}`,x,y:0,width:1,height:1,rotation:0,parent:scene,actor:a,getSize:()=>({width:100,height:100})});
  const a=token("a",0,actor),b=token("b",100,{uuid:"Actor.target",type:"npc",effects:[],items:[],system:{creature:{category:"humanoid"},statistics:{modifiers:[]}}});scene.tokens=[a,b];
  globalThis.canvas={scene};source.flags[SYS].weaponAttack.attacker=a.uuid;source.flags[SYS].weaponAttack.target=b.uuid;
  globalThis.foundry={dice:{Roll:class {constructor(formula){this.formula=formula;}async evaluate(){return this;}}},documents:{ChatMessage:{getSpeaker:()=>({actor:actor.id}),applyMode:data=>data,async create(data){const message={...data,id:"reply",speakerActor:actor};messages.push(message);return message;}}}};
  const before=structuredClone(actor.flags[SYS].fastStrike),options={schoolReaction:{triggerId:trigger.id,school:"wolf"}};
  const result=await rollWeaponAttack(actor,weapon.id,options);
  assert.equal(result.flags[SYS].action.penalty,0);assert.equal(result.flags[SYS].action.stamina,0);
  assert.equal(result.flags[SYS].weaponAttack.count,1);assert.equal(result.flags[SYS].weaponAttack.strike,0);
  assert.equal(actor.system.stamina.value,2);assert.equal(actor.system.combatAction.extra,true);assert.deepEqual(actor.flags[SYS].fastStrike,before);
  await assert.rejects(rollWeaponAttack(actor,weapon.id,options),/недоступна/);
  delete globalThis.canvas;
});

test("only Manticore forces the original attacker; other school actions accept a different selected target", () => {
  fixture();
  const reaction = { school: "wolf", targetUuid: "original" };
  assert.equal(schoolReactionTarget(reaction), "original");
  game.user.targets = new Set([{document:{uuid:"selected"}}]);
  assert.equal(schoolReactionTarget(reaction), "selected");
  assert.equal(schoolReactionTarget(reaction, "explicit"), "explicit");
  reaction.school = "manticore";
  assert.equal(schoolReactionTarget(reaction, "explicit"), "original");
});

test("cancelling or closing the school-action picker does not start an attack or consume the opportunity", async () => {
  const { trigger, actor } = fixture(), reaction = schoolReactions(trigger)[0];
  for (const result of ["cancel", null]) {
    globalThis.foundry = { applications: { api: { DialogV2: { wait: async () => result } } } };
    assert.equal(await useSchoolReaction(reaction), undefined);
    assert.equal(schoolReactionAvailable(reaction), true);
    assert.equal(actor.system.stamina.value, 2);
  }
});
