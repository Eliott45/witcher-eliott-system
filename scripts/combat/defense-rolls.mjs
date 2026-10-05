import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { weaponReadiness, signed } from "./weapon-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

export const INCOMING_ATTACKS=[{id:"melee",name:"Ближняя атака"},{id:"thrown",name:"Метательное оружие"},{id:"ranged",name:"Лук / арбалет"}];
const NAMES={dodge:"Уклонение",reposition:"Смена позиции",block:"Блок",parry:"Парирование"};
export function defenseQuote(actor,{mode="dodge",itemId="",incoming="melee",repeat=false,defenseModifier=0}={}) {
  if(!NAMES[mode]||!INCOMING_ATTACKS.some(entry=>entry.id===incoming))throw new Error("Неизвестный способ защиты.");
  const modifier=Number(defenseModifier);
  if(!Number.isFinite(modifier)||Math.abs(modifier)>100)throw new Error("Неверный модификатор защиты.");
  const armed=["block","parry"].includes(mode),item=armed?actor.items.get(itemId):null,weapon=item?.type==="weapon"?effectiveItem(item):null;
  const skillKey=mode==="dodge"?"dodgeEscape":mode==="reposition"?"athletics":weapon?.category==="shield"?"melee":weapon?.skill??"brawling";
  const skill=skillValue(actor.system,skillKey),penalty=mode==="parry"?(incoming==="thrown"?-5:-3):0;
  const total=skill.total===null?null:skill.total+penalty+modifier,cost=repeat?1:0;
  let blocked=!actor.isOwner||!conditionRules(actor).canDefend?"Персонаж сейчас не может защищаться.":"";
  if(armed)blocked ||= !weapon?"Выберите оружие для защиты.":weaponReadiness(actor,item,weapon)|| (!["melee","shield"].includes(weapon.category)?"Для этой защиты нужно оружие ближнего боя или щит.":"");
  if(mode==="block"&&incoming!=="melee"&&weapon?.category!=="shield")blocked ||= "Дистанционные атаки можно блокировать только щитом.";
  if(mode==="parry"&&incoming==="ranged")blocked ||= "Обычное парирование не отражает стрелы и болты.";
  if(total===null)blocked ||= "Заполните параметр навыка.";
  if(actor.system.stamina.value<cost)blocked ||= "Недостаточно Выносливости: нужно 1.";
  const note=mode==="reposition"?`При успехе можно переместиться на половину СКОР (${Math.floor((actor.system.statistics.effective.speed??0)/2)} м).`:
    mode==="block"?(weapon?.natural?"При блоке телом урон приходится в подставленную конечность с учётом её брони.":"При успешном блоке уменьшите надёжность предмета на 1; особые свойства могут изменить износ."):
    mode==="parry"?"При успехе атака отражена, противник ошеломлён. Оружие не теряет надёжность.":"Сравните результат с атакой противника.";
  return {mode,itemId,skillKey,total,cost,penalty,modifier,incoming,blocked,name:NAMES[mode],weaponName:item?.name??"",note,
    math:`Основа навыка: ${signed(skill.total??0)}; ${NAMES[mode]}: ${signed(penalty)}; ситуация: ${signed(modifier)}. Точность оружия не добавляется.`};
}
const pending=new WeakMap();
export function rollDefense(actor,options={}) {
  if(pending.has(actor))return pending.get(actor);
  const work=inventoryWrite(actor,async()=>{
    const quote=defenseQuote(actor,options);if(quote.blocked)throw new Error(quote.blocked);
    const display=trackRollDisplay(),messageMode=game.settings.get("core","messageMode");
    try {
      const roll=await new foundry.dice.Roll(`1d10wc + ${quote.total}`).evaluate({allowInteractive:messageMode!=="blind"});
      const message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
        flavor:`<section class="witcher-attack-chat"><h3>${esc(quote.name)}${quote.weaponName?` · ${esc(quote.weaponName)}`:""}</h3><p data-tooltip="${esc(quote.math)}">База проверки <b>${signed(quote.total)}</b> · ${quote.cost} ВЫН</p><p>${esc(quote.note)}</p></section>`,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],defense:quote,skillCheck:{key:quote.skillKey,base:quote.total,label:quote.name}}}},{messageMode});
      if(!message)return;
      await display.wait(message);
      if(quote.cost)await actor.update({"system.stamina.value":actor.system.stamina.value-quote.cost});
      return message;
    }finally{display.close();}
  });
  pending.set(actor,work);const clear=()=>{if(pending.get(actor)===work)pending.delete(actor);};work.then(clear,clear);return work;
}
