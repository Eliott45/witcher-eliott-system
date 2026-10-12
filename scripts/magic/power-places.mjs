import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID,COMBAT_ACTOR_TYPES } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { queueActorWrite } from "../data/actor-writes.mjs";
import { skillValue } from "../data/skills.mjs";
import { materialUuid } from "../data/workshop-materials.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { setStatus } from "../combat/status-effects.mjs";
import { ELEMENTAL_MISHAPS } from "./rules.mjs";
import { powerVisit,powerBenefitSource,POWER_ELEMENTS } from "./power-place-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { adrenalineAbsorptionPlan } from "../combat/adrenaline.mjs";
import { temporaryHealthAbsorptionPlan } from "../workshop/witcher-elixirs.mjs";
import { inventoryTransaction } from "../workshop/transaction.mjs";

const pending=new WeakMap();
export function drawPower(actor,place,{prepared=false,reward="blessing"}={}) {
  if(!actor.isOwner)return Promise.reject(new Error("Выберите своего персонажа."));
  if(pending.has(actor))return pending.get(actor);
  const work=queueActorWrite(actor,()=>inventoryWrite(actor,async()=>{
    if(!actor.isOwner||!COMBAT_ACTOR_TYPES.includes(actor.type))throw new Error("Выберите своего персонажа.");
    if(place?.type!=="powerPlace"||!place.testUserPermission(game.user,"OBSERVER")||!place.system.available)throw new Error("Место силы недоступно.");
    if(!prepared)throw new Error("Сначала сосредоточьтесь в течение трёх полных ходов.");
    if(!conditionRules(actor).canAct||actor.system.statistics.vigor<=0)throw new Error("Персонаж должен быть способен действовать и обладать магическим даром (Энергия выше 0).");
    if(!["blessing","essence"].includes(reward))throw new Error("Неизвестная награда.");
    const now=game.time.worldTime,visit=powerVisit(actor,place,now),element=place.system.element;
    let essence;
    if(reward==="essence") {
      const source=await foundry.utils.fromUuid(materialUuid("fifth-essence"));
      if(!source)throw new Error("Пятая эссенция отсутствует в компендиуме материалов.");
      essence=source.toObject();essence._id=foundry.utils.randomID();essence.folder=null;essence.system.quantity=5;
    }
    const display=trackRollDisplay();
    try {
      const mode=game.settings.get("core","messageMode"),speaker=foundry.documents.ChatMessage.getSpeaker({actor});
      let succeeded=true,damage=0;
      if(visit.dc){
        const skill=skillValue(actor.system,"endurance");if(skill.total===null)throw new Error("Укажите Телосложение персонажа.");
        const roll=await evaluateRoll(`1d10wc + ${skill.total}`,{allowInteractive:mode!=="blind"});
        const message=await roll.toMessage({speaker,flavor:`<h3>${esc(place.name)}: Стойкость</h3><p>СЛ ${visit.dc} = 20 + 4 × ${visit.saves} успешных повторных проверок. При провале — 5d6 урона и последствие стихии.</p>`,flags:{[SYSTEM_ID]:display.flags[SYSTEM_ID]}},{messageMode:mode});
        if(!message)throw new Error("Бросок не создан.");await display.wait(message);
        succeeded=message.rolls[0].total>=visit.dc;
        if(!succeeded){
          const hurt=await evaluateRoll("5d6",{allowInteractive:mode!=="blind"});
          const damageDisplay=trackRollDisplay();
          try{const msg=await hurt.toMessage({speaker,flavor:`Место силы: урон от перегрузки. ${ELEMENTAL_MISHAPS[element]}`,flags:{[SYSTEM_ID]:{...damageDisplay.flags[SYSTEM_ID],skipLuck:true}}},{messageMode:mode});if(!msg)throw new Error("Бросок урона не создан.");await damageDisplay.wait(msg);damage=hurt.total;}finally{damageDisplay.close();}
        }
      }
      const visits=actor.system.magic.powerVisits.map(row=>({...row}));
      const updated={placeUuid:place.uuid,draws:visit.draws+1,saves:visit.saves+(visit.dc&&succeeded?1:0),lastDraw:now};
      const index=visits.findIndex(row=>row.placeUuid===place.uuid);if(index<0)visits.push(updated);else visits[index]=updated;
      const moon=temporaryHealthAbsorptionPlan(actor,damage),adrenaline=adrenalineAbsorptionPlan(actor,damage-moon.absorbed);
      const change={...adrenaline.actorUpdate,"system.magic.powerVisits":visits,"system.magic.improvementPoints":actor.system.magic.improvementPoints+10,"system.health.value":actor.system.health.value-adrenaline.remaining};
      if(essence)change.items=[essence];
      else {
        const effect=powerBenefitSource(place,now);
        const existing=Array.from(actor.effects).find(e=>e.flags?.[SYSTEM_ID]?.powerPlace?.element===element);
        if(existing)effect._id=existing.id;
        change.effects=[effect];
      }
      // One actor write awards restricted IP, material/effect and the visit ledger together.
      // TODO(core p.122 / errata): neither source says a failed save cancels the
      // reward, or that essence replaces the separate IP award. Keep both explicit.
      await inventoryTransaction(actor,{effectUpdates:moon.effectUpdates,actorUpdate:change});
      try {
        if(damage){const status={earth:"stunned",fire:"burning",water:"frozen"}[element];if(status)await setStatus(actor,status,true);}
        await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker,content:`<section class="witcher-magic-chat"><h3>${esc(place.name)} · ${POWER_ELEMENTS[element].name}</h3><p>${esc(actor.name)}: +10 магических О.У.; ${reward==="essence"?"пятая эссенция ×5":"+5 Энергии и +2 к Сотворению этой стихии на 1 час"}.</p>${visit.dc?`<p>Стойкость: ${succeeded?"успех":"провал"}${damage?`; ${damage} урона ПЗ`:""}.</p>`:""}</section>`,flags:{[SYSTEM_ID]:{skipLuck:true}}},mode));
      } catch(error) {
        console.error(`${SYSTEM_ID} | Power awarded; follow-up failed`,error);
        ui.notifications.warn("Сила и урон уже сохранены. Не повторяйте получение награды: проверьте сообщение в чате и стихийное состояние вручную.");
      }
      return updated;
    }finally{display.close();}
  }));
  pending.set(actor,work);const clear=()=>{if(pending.get(actor)===work)pending.delete(actor);};work.then(clear,clear);return work;
}

export function resetPowerVisit(actor,place) {
  if(!game.user.isGM)throw new Error("Историю использования меняет мастер.");
  return queueActorWrite(actor,()=>actor.update({"system.magic.powerVisits":actor.system.magic.powerVisits.filter(row=>row.placeUuid!==place.uuid)}));
}
