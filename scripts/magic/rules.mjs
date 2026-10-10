import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { getToolRules } from "../data/tool-rules.mjs";
import { learningFields } from "../data/magic-learning-fields.mjs";
import { greaterFocusFor } from "../data/rune-glyphs.mjs";

export function magicFields() {
  const {SchemaField,StringField,NumberField,ArrayField}=foundry.data.fields;
  const text=()=>new StringField({required:true,nullable:false,initial:"",blank:true});
  const count=()=>new NumberField({required:true,nullable:false,min:0,integer:true,initial:0});
  return new SchemaField({roundKey:text(),spent:new NumberField({required:true,nullable:false,min:0,integer:true,initial:0}),
    sustainedId:text(),maintainedRound:text(),sustainedCost:count(),improvementPoints:count(),study:learningFields(),
    powerVisits:new ArrayField(new SchemaField({placeUuid:text(),draws:count(),saves:count(),lastDraw:new NumberField({required:true,nullable:false,initial:0})}),{initial:[]})});
}

export const castingSkill=system=>system.kind==="ritual"?"ritualCrafting":system.kind==="hex"?"hexWeaving":"spellCasting";
export const CASTING_SKILL_LABELS={spellCasting:"Сотворение заклинаний",ritualCrafting:"Проведение ритуалов",hexWeaving:"Наведение порчи"};
export function maintenanceCost(system,initialCost=0) {
  if(system.duration.maintenanceMode==="fullCost")return initialCost;
  // TODO(core p.115): no sign-specific odd-cost rounding clarification was found.
  // Keep integer STA and the existing minimum of one; round half-cost upkeep down.
  if(system.duration.maintenanceMode==="halfCost")return Math.max(1,Math.floor(initialCost/2));
  return system.duration.maintenance;
}
export function ritualDifficulty(system,{dc=system.ritual.dc,helpers=0}={}) {
  if(!Number.isInteger(dc)||dc<0||!Number.isInteger(helpers)||helpers<0||helpers>4)throw new Error("Укажите целую СЛ и от 0 до 4 помощников.");
  if(system.ritual.dc===0)return {base:0,helpers:0,target:0};
  if(dc===0)throw new Error("Для этого ритуала требуется СЛ выше 0.");
  return {base:dc,helpers,target:Math.max(1,dc-helpers)};
}
export function ritualComponents(system) {return (system.ritual?.components??[]).map(c=>`${c.name} ×${c.quantity}${c.consumed?"":" (сохраняется)"}`).join("; ");}
export function hexIdentification(danger) {return {low:[16,14],medium:[20,18],high:[26,22]}[danger]??[16,14];}
/** Sign potency is based on the chosen cost, not the discounted inventory expense. */
export function signPotency(system,cost) {
  switch(system.ruleId) {
    case "sign.yrden":return `Штраф к СКОР и РЕА: −${Math.min(4,1+Math.floor((cost-1)/2))}`;
    case "sign.axii":return `Штраф к испытанию УСТ: −${1+Math.floor((cost-1)/2)}`;
    case "sign.aard":case "sign.aard-sweep":return `Вероятность сбить с ног: ${10*cost}%`;
    case "sign.igni":case "sign.firestream":return `Урон: ${cost}d6; горение ${system.ruleId==="sign.igni"?50:75}%`;
    case "sign.quen":return `ПЗ щита: ${5*cost}; до 10 раундов`;
    case "sign.active-shield":return `ПЗ щита: ${10*cost}; поддержание ${cost} ВЫН/раунд`;
    case "sign.puppet":case "sign.magic-trap":return `Длительность: ${cost} раундов`;
    default:return "";
  }
}

/** Use one equipped focus; bonuses from multiple foci never stack (core p.167). */
/** Focus rating of an item (0 if it is not a magical focus). */
export function focusRating(item) {
  const effective=effectiveItem(item), properties=effective.properties??item.system.properties??"";
  return getToolRules(item)?.focus??Number(properties.match(/Фокусирующее\s*\((\d+)\)/iu)?.[1]??0);
}
/** Core p.166: on a fumble above 9 every focus the caster carries explodes, held or not. */
export const carriedFocuses = actor => Array.from(actor.items??[]).filter(item=>item.system?.carried!==false&&(item.system?.quantity??1)>0&&(focusRating(item)>0||greaterFocusFor(effectiveItem(item).properties)));
/**
 * Gear that focuses magic and is worn rather than wielded: an amulet, a ring (core p.102). It has to be put on to count,
 * so the inventory lets it be equipped like a weapon or armour. Runes are excluded: they go into a weapon.
 */
export function isFocusItem(item) {
  if (item?.type !== "equipment" || item.system?.kind === "upgrade") return false;
  const properties = effectiveItem(item).properties ?? item.system.properties ?? "";
  return Boolean(getToolRules(item)?.focus) || /фокусирующ/iu.test(properties);
}

export function focusOptions(actor,spell=null) {
  const discounts=["mage","priest"].includes(actor.system.details.profession);
  return equippedItems(actor.items).flatMap(item=>{
    const effective=effectiveItem(item);
    const properties=effective.properties??item.system.properties??"";
    const rating=discounts?(getToolRules(item)?.focus??Number(properties.match(/Фокусирующее\s*\((\d+)\)/iu)?.[1]??0)):0;
    const greater=greaterFocusFor(properties,spell);
    if((!rating&&!greater) || (item.type==="weapon" && effective.reliability?.value===0))return [];
    return [{id:item.id,name:item.name,rating,greater}];
  });
}

export function magicRoundKey(combat) {
  return combat?.started?`${combat.id}:${combat.round}`:"free";
}
export function roundSpent(magic,roundKey) {return magic.roundKey===roundKey?magic.spent:0;}

/** Validate the spell's printed cost before focus discounts, including invocation tiers. */
export function spellBaseCost(system,chosen,maintenance=false) {
  if(maintenance)return system.duration.maintenance;
  if(!system.variableCost)return system.cost;
  const cost=Number(chosen),min=Math.max(1,system.cost),step=system.costStep??1,max=system.costMax??0;
  if(!Number.isInteger(cost)||cost<min||(cost-min)%step!==0||max>0&&cost>max)
    throw new Error(`Стоимость: от ${min}${max?` до ${max}`:""} ВЫН, шаг ${step}.`);
  return cost;
}

export function spellCostLabel(system) {
  if(!system.variableCost)return `${system.cost} ВЫН`;
  if(system.ruleId==="spell.dispel")return "½ исходной стоимости";
  return system.costMax?`${Math.max(1,system.cost)}–${system.costMax} ВЫН`:`От ${Math.max(1,system.cost)} ВЫН`;
}

/** Only newly exceeded points cause damage; casting twice must not charge old excess again. */
export function castingCost({cost,focus=0,spent=0,vigor=0}) {
  if (![cost,focus,spent,vigor].every(value=>Number.isInteger(value)&&value>=0)) throw new Error("Стоимость магии должна быть целым неотрицательным числом.");
  const stamina=Math.max(1,cost-focus),after=spent+stamina;
  const excess=Math.max(0,after-vigor)-Math.max(0,spent-vigor);
  return {base:cost,focus,stamina,before:spent,after,vigor,excess,damage:excess*5};
}

export function magicFumble(roll) {
  const chain=roll.dice.flatMap(die=>die.options?.["witcher-eliott-system"]?.criticalChains??[]).find(entry=>entry.kind==="fumble");
  const severity=chain?Math.abs(chain.total):0;
  return {severity,failed:severity>=7,elemental:severity>=7,explosion:severity>9};
}
export const ELEMENTAL_MISHAPS={
  mixed:"Смешанная стихия: ведущий выбирает один из стихийных эффектов.",
  earth:"Земля: заклинатель получает Дезориентацию.",
  air:"Воздух: заклинателя отбрасывает на 2 м; перемещение задаёт ведущий.",
  fire:"Огонь: заклинатель загорается.",
  water:"Вода: заклинатель замерзает."
};

export function learnedSpell(actor,source) {
  return actor.items.find(item=>item.type==="spell"&&(item.id===source.id&&item.parent===actor
    || source.system.ruleId&&item.system.ruleId===source.system.ruleId
    || item.flags?.core?.sourceId===source.uuid));
}

// Core p.167 «Могущественные маги»: how much a caster must speak and gesture, by Spell Casting skill level.
export function castingComponents(level) {
  if (level >= 9) return "Сотворение: достаточно небольших пассов любой частью тела.";
  if (level >= 7) return "Сотворение: только пассы руками, слова не нужны.";
  return "Сотворение: нужно произносить слова и совершать пассы руками.";
}
// Core p.168 «Прерывание ритуала»: Ritual Crafting to keep concentration.
export const RITUAL_INTERRUPTIONS = [
  { id: "shaken", dc: 15, name: "Тряхнули, толкнули, накричали, что-то бросили" },
  { id: "harmed", dc: 18, name: "Напали и нанесли физический вред" },
  { id: "moved", dc: 16, name: "Вынесли из зоны ритуала, вернулся за 1 раунд" }
];
