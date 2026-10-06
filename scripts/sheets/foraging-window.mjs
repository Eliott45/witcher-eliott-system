import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { foragingEntries } from "../data/foraging.mjs";
import { materialDescriptionDetails } from "../data/material-descriptions.mjs";
import { chooseReference } from "./reference-picker.mjs";
import { forage } from "../workshop/foraging.mjs";
import { workshopBase } from "../workshop/check.mjs";

export function foragingActors() {
  const choices = new Map(game.actors.filter(actor=>actor.isOwner&&COMBAT_ACTOR_TYPES.includes(actor.type)).map(actor=>[actor.uuid,{actor,name:actor.name}]));
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    if (token.actor?.isOwner && COMBAT_ACTOR_TYPES.includes(token.actor.type)) choices.set(token.actor.uuid,{actor:token.actor,name:token.document.actorLink ? token.actor.name : `${token.name} · токен ${token.id}`});
  }
  const selected = globalThis.canvas?.tokens?.controlled?.find(token=>choices.has(token.actor?.uuid))?.actor.uuid;
  return [...choices.values()].map(({actor,name})=>({actor,id:actor.uuid,name,base:workshopBase(actor,"wildernessSurvival") ?? "—",selected:actor.uuid===selected}));
}
export async function openForagingWindow() {
  if (!game.user.isGM) throw new Error("Макрос собирательства доступен ведущему.");
  const actors = foragingActors();
  if (!actors.length) throw new Error("Сначала создайте персонажа или существо для сбора.");
  const pack = game.packs.get(`${SYSTEM_ID}.equipment`);
  const materials = [...(pack ? await pack.getDocuments() : []), ...game.items].filter(item=>item.testUserPermission(game.user,"LIMITED"));
  const selected = await chooseReference("foraging","",{title:"Собирательство · выбрать материал",entries:foragingEntries(materials),groups:{forage:"Собирательство",harvest:"Добыча из источника"},hint:"Ищите по названию или месту: лес, поля, горы."});
  const material = materials.find(item=>item.uuid===selected);
  if (!material) return;
  const sourceState = JSON.stringify(material.system.material);
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/foraging.hbs`,{
    name:material.name, actors, details:materialDescriptionDetails(material.system),
    check:material.system.material.forageDC > 0, dc:material.system.material.forageDC || "", formula:material.system.material.quantityFormula || ""
  });
  const answer = await foundry.applications.api.DialogV2.prompt({classes:["witcher-foraging-dialog"],window:{title:"Собирательство",resizable:true},position:{width:600},content,
    ok:{label:"Отправить проверку в чат",callback:(_event,button)=>Object.fromEntries(new FormData(button.form))},rejectClose:false,
    render:(_event,dialog)=>{
      const toggle=dialog.element.querySelector('[name="check"]'),dc=dialog.element.querySelector('[name="dc"]');
      const refresh=()=>{dc.disabled=!toggle.checked;dc.required=toggle.checked;};toggle.addEventListener("change",refresh);refresh();
    }});
  if (!answer) return;
  if (sourceState !== JSON.stringify(material.system.material)) throw new Error("Условия материала изменились; откройте сбор заново.");
  return forage(actors.find(entry=>entry.id===answer.actor)?.actor,material,{check:Boolean(answer.check),dc:Number(answer.dc),formula:answer.formula});
}
