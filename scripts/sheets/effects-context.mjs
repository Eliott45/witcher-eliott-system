import { SYSTEM_ID } from "../config.mjs";
import { effectRules, EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { STATUS_DEFINITIONS, DYING, DEAD, EXHAUSTED_STUN, UNCONSCIOUS } from "../combat/status-effects.mjs";
import { canSaveEffect, requestEffectSave } from "../combat/condition-saves.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { chooseReference } from "./reference-picker.mjs";

export async function effectsContext(sheet) {
  return Promise.all(sheet.actor.effects.map(async effect=>{
    const definition=Object.values(STATUS_DEFINITIONS).find(entry=>effect.statuses.has(entry.id));
    const rules=effectRules(effect),pending=Boolean(effect.flags?.[SYSTEM_ID]?.conditionRequest);
    const legacy=definition&&!effect.flags?.[SYSTEM_ID]?.condition;
    const text=effect.description||definition?.description||"";
    return {id:effect.id,name:legacy?game.i18n.localize(definition.name):effect.name,img:effect.img??definition?.img,inactive:effect.disabled||effect.isSuppressed,
      canRemove:sheet.isEditable&&(game.user.isGM||![DYING,DEAD,EXHAUSTED_STUN,UNCONSCIOUS].some(status=>effect.statuses.has(status))),
      save:rules.save,canSave:sheet.isEditable&&!pending&&canSaveEffect(sheet.actor,effect),
      saveHint:rules.save?.kind==="skill"?`${game.i18n.localize(`WITCHER.Skills.Entries.${rules.save.skill}.Label`)} · СЛ ${rules.save.dc}`:rules.save?.action,
      autoAllowed:Boolean(rules.save&&rules.save.kind!=="death"&&rules.save.ends),autoSave:Boolean(rules.autoSave),
      durationLabel:effect.duration?.label??"",pending,
      action:rules.action,canAct:sheet.isEditable&&conditionRules(sheet.actor).canAct,
      description:await foundry.applications.ux.TextEditor.implementation.enrichHTML(text.startsWith("WITCHER.")?game.i18n.localize(text):text,{secrets:sheet.actor.isOwner,relativeTo:effect})};
  }));
}
const safe=fn=>async function(...args){try{return await fn.apply(this,args);}catch(error){console.error(error);ui.notifications.error(error.message);}};
export const effectActions={
  browseEffects:safe(async function(){
    if(!this.isEditable)return;
    const pack=game.packs.get(`${SYSTEM_ID}.effects`);
    const effects=pack?await pack.getDocuments():EFFECT_TEMPLATES.map(entry=>conditionSource(entry,text=>game.i18n.localize(text)));
    const id=await chooseReference("effect","",{title:"Эффекты",hint:"Выберите состояние. Его также можно перетащить из компендиума или описания состава на лист.",groups:{},
      entries:effects.map(effect=>({id:effect.id??effect._id,label:effect.name,img:effect.img,summary:effect.description.replace(/<[^>]*>/g," "),details:[]}))});
    const effect=effects.find(effect=>(effect.id??effect._id)===id);if(!effect)return;
    const data=effect.toObject?effect.toObject():structuredClone(effect);delete data._id;
    data.origin=effect.uuid??null;
    await this.actor.createEmbeddedDocuments("ActiveEffect",[data]);
  }),
  rollEffectSave:safe(async function(_event,target){
    if(!this.isEditable)return;
    const effect=this.actor.effects.get(target.dataset.effectId);if(effect)await requestEffectSave(this.actor,effect);
  }),
  effectAction:safe(async function(_event,target){
    if(!this.isEditable)return;
    const effect=this.actor.effects.get(target.dataset.effectId);if(effect)await requestEffectSave(this.actor,effect,{action:true});
  }),
  toggleEffectSave:safe(async function(_event,target){
    if(!this.isEditable)return;
    const effect=this.actor.effects.get(target.dataset.effectId);if(!effect)return;
    const rules=effectRules(effect);
    await effect.update({[`flags.${SYSTEM_ID}.condition`]:{...structuredClone(rules),autoSave:!rules.autoSave}});
  })
};
