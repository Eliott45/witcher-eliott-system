import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { actionQuote, actionUpdate } from "./action-economy.mjs";
import { attackerToken, tokenCenter, tokenGap } from "./attack-target.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { parseDamageTypes } from "./damage-rules.mjs";

import { isGraveHag as hag } from "../data/hag-circle.mjs";
const circleOf = actor => actor.flags?.[SYSTEM_ID]?.hagCircle;
export function hagActions(actor) {
  if (!hag(actor)) return [];
  return [{id:"hag-circle",name:circleOf(actor)?"Перенести круг · 1 час подготовки":"Круг подготовлен · 1 час",disabled:!actor.isOwner},
    ...(circleOf(actor)?[{id:"hag-circle-end",name:"Круг уничтожен",disabled:!actor.isOwner}]:[]),
    {id:"hag-command",name:"Приказ трупоедам · 20 м",disabled:!actor.isOwner}];
}
const post = (actor, content) => foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),content,
  flags:{[SYSTEM_ID]:{skipLuck:true}}},game.settings.get("core","messageMode")));

/** The GM chooses the order; affected actors spend their own turn carrying it out, not a bonus attack. */
export function useHagAction(actor,id,options={}) {
  if (!actor.isOwner || !game.user.isGM || !hag(actor)) return;
  return inventoryWrite(actor,async()=>{
    if (id === "hag-circle-end") { await actor.unsetFlag(SYSTEM_ID,"hagCircle"); return post(actor,"<p>Круг из черепов уничтожен: бонус больше не действует.</p>"); }
    const source=attackerToken(actor),point=tokenCenter(source);
    if (id === "hag-circle") {
      const completed=options.prepared??await foundry.applications.api.DialogV2.confirm({window:{title:"Круг из черепов"},content:"<p>Подготовка занимает один час. Отметить завершённый круг в текущем месте? Бонус действует в пределах 100 м от него.</p>"});
      if (!completed) return;
      await actor.setFlag(SYSTEM_ID,"hagCircle",{scene:source.parent.id,...point});
      return post(actor,"<p>Круг из черепов подготовлен за час: +3 ко всем действиям в пределах 100 м от круга.</p>");
    }
    if (id !== "hag-command") throw new Error("Неизвестное действие.");
    const quote=actionQuote(actor);
    const order=options.order??await foundry.applications.api.DialogV2.prompt({window:{title:"Приказ трупоедам"},content:'<label>Простой приказ<input name="order" type="text" maxlength="240" placeholder="Например: атакуйте рыцаря у ворот" autofocus></label>',ok:{label:"Отдать приказ",callback:(_event,button)=>button.form.elements.order.value.trim()},rejectClose:false});
    if (!order) return;
    const targets=Array.from(source.parent.tokens).filter(token=>token.uuid!==source.uuid&&token.actor?.system.creature?.category==="necrophage"&&tokenGap(source,token)<=20);
    for (const token of targets) {
      const target=token.actor, old=Array.from(target.effects).filter(effect=>effect.flags?.[SYSTEM_ID]?.creatureOrder);
      if (old.length) await target.deleteEmbeddedDocuments("ActiveEffect",old.map(effect=>effect.id));
      await target.createEmbeddedDocuments("ActiveEffect",[{name:`Приказ: ${order}`,img:"icons/svg/sound.svg",description:`<p>${esc(order)}. Выполняется вместо собственных действий, а не дополнительно к ним.</p>`,start:fullTurnStart(target),duration:{value:1,units:"rounds",expiry:"turnEnd",expired:false},flags:{[SYSTEM_ID]:{creatureOrder:{source:actor.uuid,order}}}}]);
    }
    await actor.update(actionUpdate(actor,quote));
    return post(actor,`<h3>Управление нежитью</h3><p>${esc(order)}</p><p>Приказ вместо атаки; выполняют вместо своих действий: ${targets.map(token=>esc(token.name)).join(", ")||"нет трупоедов в пределах 20 м"}.</p>`);
  });
}

/** A sharp parry permanently disables the tongue and deals five direct HP damage (core p.281). */
export async function severHagTongue(actor,attackingItem,parryingItem) {
  if (!actor?.isOwner || !hag(actor) || attackingItem?.name!=="Язык" || actor.flags?.[SYSTEM_ID]?.severedTongue) return false;
  if (!parseDamageTypes(parryingItem?.system.damageType).some(type=>["slashing","piercing"].includes(type))) return false;
  await actor.update({"system.health.value":actor.system.health.value-5,[`flags.${SYSTEM_ID}.severedTongue`]:true});
  await attackingItem.update({"system.equipped":false});
  await post(actor,"<p>Острый клинок отрубил язык: −5 ПЗ, атака языком больше недоступна.</p>");
  return true;
}

export function registerHagActions() {
  Hooks.on("updateToken",token=>{
    const actor=token.actor;
    if (circleOf(actor??{})) { actor.prepareData(); actor.sheet?.render(); }
  });
}
