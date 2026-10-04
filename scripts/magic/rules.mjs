import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { getToolRules } from "../data/tool-rules.mjs";

export function magicFields() {
  const {SchemaField,StringField,NumberField}=foundry.data.fields;
  const text=()=>new StringField({required:true,nullable:false,initial:"",blank:true});
  return new SchemaField({roundKey:text(),spent:new NumberField({required:true,nullable:false,min:0,integer:true,initial:0}),
    sustainedId:text(),maintainedRound:text()});
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
