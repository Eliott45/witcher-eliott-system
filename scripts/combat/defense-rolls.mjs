import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { isShieldMaster } from "./shield-master.mjs";
import { armPenaltyParts } from "./critical-wound-effects.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { weaponReadiness, signed, combatModifierParts } from "./weapon-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { statusEffect } from "../data/effect-counters.mjs";
import { ACTIVE_DODGE } from "./full-turn-rules.mjs";
import { actorEnvironment } from "./environment.mjs";
import { spiritState } from "./creature-spirits.mjs";
import { creatureCanSwim, creatureHasInfiniteStamina } from "../data/creature-modes.mjs";

export const INCOMING_ATTACKS=[{id:"melee",name:"Ближняя атака"},{id:"thrown",name:"Метательное оружие"},{id:"ranged",name:"Лук / арбалет"}];
// Core p.168: spells name their defenses — Resist Magic, or a counter-casting check against Dispel.
const NAMES={dodge:"Уклонение",reposition:"Смена позиции",block:"Блок",parry:"Парирование",brawl:"Борьба",resist:"Сопротивление магии",counter:"Сотворение заклинаний",slip:"Ускользание"};
export function defenseQuote(actor,{mode="dodge",itemId="",incoming="melee",repeat=false,defenseModifier=0}={}) {
  if(!NAMES[mode]||!INCOMING_ATTACKS.some(entry=>entry.id===incoming))throw new Error("Неизвестный способ защиты.");
  const modifier=Number(defenseModifier);
  if(!Number.isFinite(modifier)||Math.abs(modifier)>100)throw new Error("Неверный модификатор защиты.");
  // Core p.164: block or parry with a weapon (its skill), a shield (Melee) or bare-handed (Brawling).
  const armed=["block","parry"].includes(mode),unarmed=armed&&!itemId,item=armed&&!unarmed?actor.items.get(itemId):null,weapon=item?.type==="weapon"?effectiveItem(item):null;
  // Core p.165: under water a dodge is an Athletics check too.
  const underwater=Boolean(actorEnvironment(actor)?.underwater)&&!creatureCanSwim(actor);
  const skillKey=mode==="dodge"?(underwater?"athletics":"dodgeEscape"):mode==="reposition"?"athletics":mode==="brawl"?"brawling":mode==="resist"?"resistMagic":["counter","slip"].includes(mode)?"spellCasting":weapon?.category==="shield"?"melee":weapon?.skill??"brawling";
  const shieldMaster=mode==="parry"&&weapon?.category==="shield"&&isShieldMaster(actor);
  const skill=skillValue(actor.system,skillKey),penalty=mode==="parry"&&!shieldMaster?(incoming==="thrown"?-5:-3):0;
  const activeDodge=Boolean(statusEffect(actor,ACTIVE_DODGE));
  const effects=[...combatModifierParts(actor,"combat.defense"),...(armed?combatModifierParts(actor,"combat.blockParry"):[]),...(item?armPenaltyParts(actor,item):[])],effectTotal=effects.reduce((sum,part)=>sum+part.value,0);
  const total=skill.total===null?null:skill.total+penalty+modifier+effectTotal,cost=repeat&&!activeDodge&&!creatureHasInfiniteStamina(actor)?1:0;
  let blocked=!actor.isOwner||!conditionRules(actor).canDefend?"Персонаж сейчас не может защищаться.":"";
  if(mode==="slip"&&!spiritState(actor).canSlip)blocked ||= "Ускользание недоступно: нет способности либо она подавлена Ирденом или Лунной пылью.";
  if(armed&&!unarmed)blocked ||= !weapon?"Выберите оружие для защиты.":weaponReadiness(actor,item,weapon)|| (!["melee","shield"].includes(weapon.category)?"Для этой защиты нужно оружие ближнего боя или щит.":"");
  if(mode==="block"&&incoming!=="melee"&&(unarmed||weapon?.category!=="shield"))blocked ||= "Дистанционные атаки можно блокировать только щитом.";
  if(mode==="parry"&&incoming==="ranged")blocked ||= "Обычное парирование не отражает стрелы и болты.";
  if(total===null)blocked ||= "Заполните параметр навыка.";
  if(!creatureHasInfiniteStamina(actor)&&actor.system.stamina.value<cost)blocked ||= "Недостаточно Выносливости: нужно 1.";
  const note=mode==="reposition"?`При успехе можно переместиться на половину СКОР (${Math.floor((actor.system.statistics.effective.speed??0)/2)} м).`:
    mode==="block"?(unarmed||weapon?.natural?"Блок телом в безвыходном положении: при успехе урон атаки сразу приходится в подставленную руку (ПБ учитывается, ×½).":"При успешном блоке предмет теряет 1 надёжности."):
    mode==="parry"?"При успехе атака отражена, противник ошеломлён. Оружие не теряет надёжность.":mode==="slip"?"При успехе атака отменяется: призрак бесплотен до начала следующего хода. Физические атаки и воздействия не действуют.":"Сравните результат с атакой противника.";
  const limb=mode==="block"&&(unarmed||Boolean(weapon?.natural));
  return {mode,itemId,skillKey,total,cost,penalty,modifier,incoming,blocked,activeDodge,limb,unarmed,name:unarmed?(mode==="block"?"Блок рукой":"Парирование рукой"):NAMES[mode],weaponName:item?.name??"",note:note+(activeDodge?" Активное уклонение: защиты без расхода ВЫН; атакующему в ближнем бою −2.":""),
    math:`Основа навыка: ${signed(skill.total??0)}; ${shieldMaster?"Мастер щита":NAMES[mode]}: ${signed(penalty)}; ситуация: ${signed(modifier)}${effects.map(part=>`; ${part.label}: ${signed(part.value)}`).join("")}. Точность оружия не добавляется.`};
}
const pending=new WeakMap();
export function rollDefense(actor,options={}) {
  if(pending.has(actor))return pending.get(actor);
  const work=inventoryWrite(actor,async()=>{
    const quote=defenseQuote(actor,options);if(quote.blocked)throw new Error(quote.blocked);
    const display=trackRollDisplay(),messageMode=game.settings.get("core","messageMode");
    try {
      const roll=await evaluateRoll(`1d10wc + ${quote.total}`,{allowInteractive:messageMode!=="blind"});
      const message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
        flavor:`<section class="witcher-attack-chat"><h3>${esc(quote.name)}${quote.weaponName?` · ${esc(quote.weaponName)}`:""}</h3><p data-tooltip="${esc(quote.math)}">База проверки <b>${signed(quote.total)}</b> · ${quote.cost} ВЫН</p><p>${esc(quote.note)}</p></section>`,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],defense:quote,skillCheck:{key:quote.skillKey,base:quote.total,label:quote.name},...(options.exchange?{exchange:options.exchange}:{})}}},{messageMode});
      if(!message)return;
      // Spend STA as soon as the defense is declared, not after the dice animation.
      if(quote.cost)await actor.update({"system.stamina.value":actor.system.stamina.value-quote.cost});
      await display.wait(message);
      return message;
    }finally{display.close();}
  });
  pending.set(actor,work);const clear=()=>{if(pending.get(actor)===work)pending.delete(actor);};work.then(clear,clear);return work;
}
