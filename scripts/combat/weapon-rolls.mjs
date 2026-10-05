import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { actionQuote, actionNote, actionUpdate } from "./action-economy.mjs";
import { weaponAttack, signed, hitLocation } from "./weapon-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { consumeAiming } from "./full-turn-rules.mjs";

const pending = new WeakMap();
export function rollWeaponAttack(actor,itemId,options={}) {
  if(pending.has(actor))return pending.get(actor);
  const work=inventoryWrite(actor,async()=>{
    const item=actor.items.get(itemId),action=actionQuote(actor),quote=weaponAttack(actor,item,{...options,extraPenalty:action.penalty});
    if(quote.blocked)throw new Error(quote.blocked);
    const display=trackRollDisplay(),messageMode=game.settings.get("core","messageMode");
    try {
      const rolls=[];
      for(let i=0;i<quote.attack.count;i++)rolls.push(await new foundry.dice.Roll(`1d10wc + ${quote.total}`,{}, {flavor:`${item.name} · ${i+1}/${quote.attack.count}`}).evaluate({allowInteractive:messageMode!=="blind"}));
      const math=quote.parts.filter(part=>part.value||part.label==="Основа навыка").map(part=>`${part.label}: ${signed(part.value)}`).join("; ");
      const flavor=`<section class="witcher-attack-chat"><h3>${esc(item.name)} · ${esc(quote.attack.name)}</h3><p data-tooltip="${esc(math)}">База проверки <b>${signed(quote.total)}</b> · ${quote.attack.count} ${quote.attack.count===1?"бросок":"броска"}</p>`
        +`<p>${esc(quote.aim.name)}${quote.aim.id!=="random"?` · урон ×${quote.aim.multiplier} после брони`:" · место попадания после успешной атаки"}</p>`
        +actionNote(action)+`<button type="button" data-weapon-damage><i class="fa-solid fa-dice-d6"></i> Урон: ${esc(quote.damage)}</button>`
        +(quote.aim.id==="random"?'<div class="witcher-location-buttons"><button type="button" data-hit-location="humanoid">Место: гуманоид</button><button type="button" data-hit-location="monster">Место: чудовище</button></div>':"")
        +`<small>Каждое попадание — отдельный урон и зона. Сравните атаку с защитой цели.</small></section>`;
      const message=await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),rolls,flavor,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],action,weaponAttack:{itemId,name:item.name,mode:quote.attack.id,base:quote.total,count:quote.attack.count,
          damage:quote.damage,location:quote.aim.id,multiplier:quote.aim.multiplier,body:quote.body,bonus:quote.bonus}}}},messageMode));
      if(!message)return;
      await display.wait(message);
      const update=actionUpdate(actor,action);
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
