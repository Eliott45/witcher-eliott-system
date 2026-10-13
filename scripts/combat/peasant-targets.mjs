import { SYSTEM_ID } from "../config.mjs";
import { peasantRank, plantIngredient } from "../data/peasant-rules.mjs";
import { peasantEffectSource } from "../workshop/peasant-products.mjs";
import { workshopBase, workshopNotice } from "../workshop/check.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { copyPhysical } from "../workshop/transaction.mjs";
import { rollActionCheck } from "./action-economy.mjs";
import { grappleState, releaseGrapple } from "./grapple.mjs";
import { attackerToken, tokenDocument } from "./attack-target.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { serialQueue } from "../data/serial-queue.mjs";

const queue=serialQueue();
export const butcherDC=npc=>/трудн/iu.test(npc.system.creature?.difficulty??"")?20:/незауряд/iu.test(npc.system.creature?.difficulty??"")?16:12;
export const organicMaterial=item=>item.type==="equipment"&&item.system.kind==="material"&&!plantIngredient(item)&&!item.system.ruleId?.startsWith("substance.")
  && /кости|шкур|кож|чешу|перь|ког|зуб|клык|клыки|мозг|сердц|сало|яйц|эмбрион|ухо|глаз|печень|слюн|язык|связк|яд|хитин|помёт|кровь|мясо/iu.test(item.name);
export async function usePeasantTarget(actor,slug){
  if(!game.users.activeGM)throw new Error("Для применения результата нужен подключённый мастер.");
  if(!peasantRank(actor,slug))throw new Error("Сначала изучите способность.");
  let victim,request;
  if(slug==="ear-bite"){
    const {heldBy}=grappleState(actor),conditions=conditionRules(actor);
    if(!heldBy?.actor||conditions.dead||conditions.unconscious||conditions.ordinaryStun||conditions.exhausted)throw new Error("Укус возможен, когда вас удерживают и вы в сознании.");
    victim=heldBy.actor;
    const dex=victim.system.statistics.effective.dexterity;if(dex==null)throw new Error("У цели не заполнена Ловкость.");
    request={slug,target:victim.uuid,by:heldBy.token,held:attackerToken(actor).uuid,dc:dex*3};
  }else{
    victim=tokenDocument(Array.from(game.user.targets??[]).at(0))?.actor;
    if(victim?.type!=="npc"||victim.system.health.value>0)throw new Error("Выберите мёртвое животное или чудовище на сцене (T).");
    if(victim.system.creature.category==="humanoid")throw new Error("Мясник применяется к животным и чудовищам.");
    const entries=[];
    for(const row of victim.system.harvest??[]){
      if(row.attempted)continue;
      const source=await foundry.utils.fromUuid(row.uuid);
      if(source&&organicMaterial(source))entries.push({...row,name:source.name});
    }
    if(!entries.length)throw new Error("Нет неизвлечённой органической добычи. Применяйте Мясника до обычного броска добычи.");
    const id=await foundry.applications.api.DialogV2.prompt({window:{title:`Мясник · ${victim.name}`},content:`<p>Одна попытка на каждый тип добычи. СЛ ${butcherDC(victim)}.</p><select name="part">${entries.map(row=>`<option value="${row.id}">${esc(row.name)} · ${esc(row.formula||row.quantity)}</option>`).join("")}</select>`,rejectClose:false,ok:{label:"Извлечь",callback:(_e,b)=>b.form.elements.part.value}});
    if(!id)return;request={slug,target:victim.uuid,part:id,dc:butcherDC(victim)};
  }
  let message;
  const flags={[SYSTEM_ID]:{peasantTarget:{...request,actor:actor.uuid,ready:false}}};
  const base=workshopBase(actor,`profession.peasant.${slug}`);
  if(base==null)throw new Error("Заполните связанный параметр.");
  const flavor=`${slug==="ear-bite"?"Укус за ухо":"Мясник"} · ${esc(victim.name)} · СЛ ${request.dc}`;
  if(slug==="ear-bite"&&!conditionRules(actor).canAct){
    // Pinned allows this explicit escape, but no other incapacitating effect does.
    const other=Array.from(actor.effects).filter(effect=>!effect.statuses.has("pinned"));
    if(!conditionRules({system:actor.system,effects:other}).canAct)throw new Error("В этом состоянии укус невозможен.");
    const display=trackRollDisplay();
    try{const mode=game.settings.get("core","messageMode"),roll=await evaluateRoll(`1d10wc + ${base}`,{allowInteractive:mode!=="blind"});
      message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor,flags:{[SYSTEM_ID]:{...flags[SYSTEM_ID],...display.flags[SYSTEM_ID]}}},{messageMode:mode});
      if(message)await display.wait(message);
    }finally{display.close();}
  }else message=await rollActionCheck(actor,{formula:`1d10wc + ${base}`,flavor,flags});
  if(message)await message.update({[`flags.${SYSTEM_ID}.peasantTarget.ready`]:true});
}

export async function resolvePeasantTarget(message){
  const data=message.flags?.[SYSTEM_ID]?.peasantTarget;
  if(!game.users.activeGM?.isSelf||!data?.ready||data.applied)return;
  const actor=await fromUuid(data.actor),victim=await fromUuid(data.target);
  if(!actor||!victim||message.speakerActor?.uuid!==actor.uuid||!actor.testUserPermission(message.author,"OWNER")||!peasantRank(actor,data.slug))return;
  const total=message.rolls[0]?.total;if(!Number.isFinite(total))return;
  return inventoryWrite(victim,async()=>{
    if(message.flags[SYSTEM_ID].peasantTarget.applied)return;
    if(data.slug==="butcher"){
      if(victim.type!=="npc"||victim.system.health.value>0||victim.system.creature.category==="humanoid")throw new Error("Источник больше не подходит для свежевания.");
      const row=victim.system.harvest.find(row=>row.id===data.part);
      if(!row||row.attempted)throw new Error("На эту часть тела попытка уже потрачена.");
      const source=await fromUuid(row.uuid);if(!source||!organicMaterial(source))throw new Error("Нет подходящего материала.");
      const success=total>=butcherDC(victim),before=victim.system.harvest.map(row=>({...row}));
      let quantity=0;
      if(success){quantity=row.formula?Math.floor((await new foundry.dice.Roll(row.formula).evaluate({maximize:true})).total):row.quantity;if(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000)throw new Error("Некорректный максимум добычи.");}
      await victim.update({"system.harvest":before.map(entry=>entry.id===row.id?{...entry,attempted:true}:entry)});
      try{if(quantity)await inventoryWrite(actor,()=>actor.createEmbeddedDocuments("Item",[copyPhysical(source,quantity)]));}
      catch(error){await victim.update({"system.harvest":before});throw error;}
      await workshopNotice(actor,`<p>Мясник: ${success?`${esc(source.name)} ×${quantity} добавлено в инвентарь`:"неудача"}. Попытка для этой части тела потрачена.</p>`);
    }else if(data.slug==="ear-bite"){
      const held=grappleState(actor).heldBy;
      if(!held||held.token!==data.by||held.actor.uuid!==victim.uuid)throw new Error("Этот захват уже закончился.");
      if(total>=data.dc){
        let damage=data.damage;
        if(!Number.isInteger(damage)){
          const roll=await evaluateRoll("1d6",{allowInteractive:!message.blind});damage=roll.total;
          await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor:"Укус за ухо · неснижаемый урон",whisper:[...message.whisper],blind:message.blind,flags:{[SYSTEM_ID]:{skipLuck:true}}});
          await message.update({[`flags.${SYSTEM_ID}.peasantTarget.damage`]:damage});
        }
        const key=`peasantBite${message.id}`;
        if(!victim.flags?.[SYSTEM_ID]?.[key]){
          const effect=peasantEffectSource(`scar.${message.id}`,"Откушенное ухо: шрам",1,{seconds:0,description:"Постоянно −1 к Харизме и Соблазнению.",modifiers:["charisma","seduction"].map(skill=>({target:`skills.${skill}`,value:-1}))});
          if(!victim.effects.some(e=>e.flags?.[SYSTEM_ID]?.peasant?.kind===`scar.${message.id}`))await victim.createEmbeddedDocuments("ActiveEffect",[effect]);
          await victim.update({"system.health.value":victim.system.health.value-damage,[`flags.${SYSTEM_ID}.${key}`]:true});
        }
        await releaseGrapple(data.by,data.held);
      }
      await workshopNotice(actor,`<p>Укус за ухо: ${total>=data.dc?"захват разорван, цель получила урон и постоянный шрам":"неудача"}.</p>`);
    }else return;
    await message.update({[`flags.${SYSTEM_ID}.peasantTarget.applied`]:true});
  });
}
export function registerPeasantTargets(){
  const apply=message=>{if(game.users.activeGM?.isSelf&&message.flags?.[SYSTEM_ID]?.peasantTarget?.ready&&!message.flags[SYSTEM_ID].peasantTarget.applied)queue(message.id,()=>resolvePeasantTarget(message)).catch(error=>{console.error(error);ui.notifications.warn(error.message);});};
  Hooks.on("createChatMessage",apply);Hooks.on("updateChatMessage",apply);
  Hooks.on("renderChatMessageHTML",(message,html)=>{
    const data=message.flags?.[SYSTEM_ID]?.peasantTarget;if(!game.user.isGM||!data?.ready||data.applied)return;
    const button=document.createElement("button");button.type="button";button.textContent="Применить результат крестьянина";
    button.addEventListener("click",()=>apply(message));html.append(button);
  });
}
