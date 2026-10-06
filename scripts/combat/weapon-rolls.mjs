import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { actionQuote, actionNote, actionUpdate } from "./action-economy.mjs";
import { weaponAttack, signed, hitLocation } from "./weapon-rules.mjs";
import { damageTypeLabel } from "./damage-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { consumeAiming } from "./full-turn-rules.mjs";
import { selectedAttackTarget } from "./attack-target.mjs";
import { ambushAttack, ambushState, tacticsFlags } from "./tactics-rules.mjs";

/** Pair state of a fast attack: the second click in the same round (and extra-action status) is strike 2/2. */
export function fastPair(actor,attack,action) {
  if(!attack?.pair)return null;
  const key=action.roundKey||"free",pending=actor.flags?.[SYSTEM_ID]?.fastStrike;
  return {key,second:Boolean(pending&&pending.round===key&&pending.extra===action.extra)};
}

export function attackModifierMarkup(parts) {
  return `<ul class="witcher-attack-modifiers">${parts.filter(part=>part.value&&part.label!=="Основа навыка").map(part=>
    `<li class="${part.value>0?"is-bonus":"is-penalty"}"><span>${esc(part.label)}</span><b>${signed(part.value)}</b></li>`).join("")}</ul>`;
}

const pending = new WeakMap();
export function rollWeaponAttack(actor,itemId,options={}) {
  if(pending.has(actor))return pending.get(actor);
  const work=inventoryWrite(actor,async()=>{
    const targetContext=selectedAttackTarget(actor,options),combat=options.combatId?game.combats.get(options.combatId):globalThis.game?.combat;
    const group=tacticsFlags(combat).groupAmbush;
    const actorCombatants=Array.from(combat?.combatants??[]).filter(entry=>entry.actor?.uuid===actor.uuid);
    if(group?.status==="checks"&&!combat.started&&group.entries.some(row=>actorCombatants.some(entry=>entry.id===row.id))) {
      throw new Error("Дождитесь завершения проверок засады.");
    }
    if(actorCombatants.some(entry=>tacticsFlags(entry).tacticRequest))throw new Error("Дождитесь завершения запроса в трекере боя.");
    if(!targetContext&&actorCombatants.some(entry=>ambushState(combat,entry)))throw new Error("Выберите цель атаки, чтобы учесть засаду.");
    const ambush=targetContext?ambushAttack(combat,targetContext.attacker,targetContext.target):{bonus:0};
    const item=actor.items.get(itemId),action=actionQuote(actor),quote=weaponAttack(actor,item,{...options,
      extraPenalty:action.penalty,targetContext,ambushBonus:ambush.bonus});
    if(quote.blocked)throw new Error(quote.blocked);
    // The second strike of a fast attack belongs to the same action: no new STA for an extra action.
    const pair=fastPair(actor,quote.attack,action),strike=pair?(pair.second?2:1):0;
    if(pair?.second)action.stamina=0;
    const display=trackRollDisplay(),messageMode=game.settings.get("core","messageMode");
    try {
      const rolls=[];
      for(let i=0;i<quote.attack.count;i++)rolls.push(await new foundry.dice.Roll(`1d10wc + ${quote.total}`,{}, {flavor:`${item.name} · ${i+1}/${quote.attack.count}`}).evaluate({allowInteractive:messageMode!=="blind"}));
      const math=quote.parts.filter(part=>part.value||part.label==="Основа навыка").map(part=>`${part.label}: ${signed(part.value)}`).join("; ");
      const types=damageTypeLabel(quote.weapon.damageType);
      const flavor=`<section class="witcher-attack-chat"><h3>${esc(item.name)} · ${esc(quote.attack.name)}${strike?` ${strike}/2`:""}</h3>${types?`<p class="witcher-damage-type">Урон: ${esc(types)}</p>`:""}<p data-tooltip="${esc(math)}">База проверки <b>${signed(quote.total)}</b> · ${quote.attack.count} ${quote.attack.count===1?"бросок":"броска"}</p>`
        +(targetContext?`<p>Цель: <b>${esc(targetContext.target.name)}</b></p>`:"<small>Цель не выбрана — направление взгляда не учтено.</small>")
        +attackModifierMarkup(quote.parts)
        +(targetContext?.blind?"<small>Вне конуса зрения: бонус прицеливания не применяется.</small>":"")
        +`<p>${esc(quote.aim.name)}${quote.aim.id!=="random"?` · урон ×${quote.aim.multiplier} после брони`:" · место попадания после успешной атаки"}</p>`
        +actionNote(action)+`<button type="button" data-weapon-damage><i class="fa-solid fa-dice-d6"></i> Урон: ${esc(quote.damage)}</button>`
        +(quote.aim.id==="random"?'<div class="witcher-location-buttons"><button type="button" data-hit-location="humanoid">Место: гуманоид</button><button type="button" data-hit-location="monster">Место: чудовище</button></div>':"")
        +`<small>Каждое попадание — отдельный урон и зона. Сравните атаку с защитой цели.</small></section>`;
      const message=await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),rolls,flavor,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],action,weaponAttack:{itemId,name:item.name,mode:quote.attack.id,base:quote.total,count:quote.attack.count,
          damage:quote.damage,location:quote.aim.id,locationRoll:quote.aim.rolled??null,multiplier:quote.aim.multiplier,body:quote.body,bonus:quote.bonus,
          target:targetContext?.target.uuid??null,attacker:targetContext?.attacker.uuid??null,parts:quote.parts,ranged:quote.ranged,thrown:quote.weapon.category==="thrown",combat:combat?.started?{id:combat.id,round:combat.round}:null,strike,damageTypes:damageTypeLabel(quote.weapon.damageType)}}}},messageMode));
      if(!message)return;
      await display.wait(message);
      const update=actionUpdate(actor,action);
      if(pair&&!pair.second){delete update["system.combatAction.extra"];delete update["system.combatAction.lastExtraRound"];}
      update[`flags.${SYSTEM_ID}.fastStrike`]=pair&&!pair.second?{round:pair.key,extra:action.extra,itemId}:null;
      if(item.system.skill==="crossbow")update.items=[{_id:item.id,"system.loaded":false}];
      if(Object.keys(update).length)await actor.update(update);
      await consumeAiming(actor);
      return message;
    } finally {display.close();}
  });
  pending.set(actor,work);
  const clear=()=>{if(pending.get(actor)===work)pending.delete(actor);};work.then(clear,clear);
  return work;
}

export async function rollWeaponDamage(message) {
  const actor=message.speakerActor,attack=message.flags[SYSTEM_ID]?.weaponAttack;
  if(!actor?.isOwner||!message.isContentVisible||!attack)return;
  const mode=message.blind?"blind":message.whisper?.length?"gm":"public";
  const roll=await new foundry.dice.Roll(attack.damage).evaluate({allowInteractive:!message.blind});
  // Use the attack snapshot: changing grip/stats after the attack cannot change its damage.
  return roll.toMessage({speaker:{...message.speaker},whisper:[...message.whisper],blind:message.blind,
    flavor:`<h3>${esc(attack.name)} · урон</h3><p>До вычета брони. ${attack.location==="random"?"Определите место попадания (1d10).":`После брони примените множитель зоны ×${attack.multiplier}.`}</p><small>ПЗ цели и повреждение брони изменяются вручную.</small>`,
    flags:{[SYSTEM_ID]:{skipLuck:true,weaponDamage:{sourceId:message.id,itemId:attack.itemId}}}},{messageMode:mode});
}
export async function rollHitLocation(message,bodyPlan) {
  if(!message.speakerActor?.isOwner||!message.isContentVisible||message.flags[SYSTEM_ID]?.weaponAttack?.location!=="random")return;
  hitLocation(1,bodyPlan);
  const roll=await new foundry.dice.Roll("1d10").evaluate({allowInteractive:!message.blind});
  const location=hitLocation(roll.total,bodyPlan);
  return roll.toMessage({speaker:{...message.speaker},whisper:[...message.whisper],blind:message.blind,
    flavor:`<section class="witcher-attack-chat"><h3>${esc(message.flags[SYSTEM_ID].weaponAttack.name)} · ${location.name}</h3><p>${bodyPlan==="humanoid"?"Гуманоид":"Чудовище"}: ${roll.total} на 1d10 → урон ×${location.multiplier} после брони.</p></section>`,
    flags:{[SYSTEM_ID]:{skipLuck:true,hitLocation:{sourceId:message.id,bodyPlan,id:location.id,multiplier:location.multiplier}}}},
    {messageMode:message.blind?"blind":message.whisper?.length?"gm":"public"});
}
export function registerWeaponChat() {
  Hooks.on("renderChatMessageHTML",(message,html)=>{
    for(const button of html.querySelectorAll("[data-weapon-damage]")) {
      button.disabled=!message.speakerActor?.isOwner||!message.isContentVisible;
      button.addEventListener("click",async()=>{button.disabled=true;try{await rollWeaponDamage(message);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=!message.speakerActor?.isOwner;}});
    }
    for(const button of html.querySelectorAll("[data-hit-location]")) {
      button.disabled=!message.speakerActor?.isOwner||!message.isContentVisible;
      button.addEventListener("click",async()=>{button.disabled=true;try{await rollHitLocation(message,button.dataset.hitLocation);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=!message.speakerActor?.isOwner;}});
    }
  });
}
