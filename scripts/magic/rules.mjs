import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { getToolRules } from "../data/tool-rules.mjs";

export function magicFields() {
  const {SchemaField,StringField,NumberField,ArrayField}=foundry.data.fields;
  const text=()=>new StringField({required:true,nullable:false,initial:"",blank:true});
  const count=()=>new NumberField({required:true,nullable:false,min:0,integer:true,initial:0});
  return new SchemaField({roundKey:text(),spent:new NumberField({required:true,nullable:false,min:0,integer:true,initial:0}),
    sustainedId:text(),maintainedRound:text(),sustainedCost:count(),improvementPoints:count(),
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
export function focusOptions(actor) {
  if (!["mage","priest"].includes(actor.system.details.profession)) return [];
  return equippedItems(actor.items).flatMap(item=>{
    const effective=effectiveItem(item);
    const properties=effective.properties??item.system.properties??"";
    const rating=getToolRules(item)?.focus??Number(properties.match(/Фокусирующее\s*\((\d+)\)/iu)?.[1]??0);
    if(!rating || (item.type==="weapon" && effective.reliability?.value===0))return [];
    return [{id:item.id,name:item.name,rating,greater:/Улучшенное фокусирующее/iu.test(properties)}];
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
