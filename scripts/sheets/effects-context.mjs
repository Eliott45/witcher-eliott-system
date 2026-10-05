import { SYSTEM_ID } from "../config.mjs";
import { effectDurationLabel } from "../data/effect-duration.mjs";
import { effectRules, EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { STATUS_DEFINITIONS, DYING, DEAD, EXHAUSTED_STUN, UNCONSCIOUS } from "../combat/status-effects.mjs";
import { canSaveEffect, requestEffectSave } from "../combat/condition-saves.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { chooseReference } from "./reference-picker.mjs";
import { editEffectDuration, canEditEffectDuration } from "./effect-duration-editor.mjs";
import { applyEffectItem } from "../data/effect-items.mjs";
import { effectCounter, changeEffectCounter, activeEffect } from "../data/effect-counters.mjs";
import { doseToxicity } from "../data/consumables.mjs";
import { isToxicityPoison, poisonDescription } from "../data/poison-rules.mjs";

export function toxicitySaveContext(sheet) {
  const effect = sheet.actor.effects.find(effect => activeEffect(effect) && isToxicityPoison(effect));
  return effect ? {id:effect.id, available:sheet.isEditable&&!effect.flags?.[SYSTEM_ID]?.conditionRequest&&canSaveEffect(sheet.actor,effect)} : null;
}

export async function effectsContext(sheet) {
  return Promise.all(sheet.actor.effects.filter(effect=>!effect.disabled&&!effect.isSuppressed&&!effect.duration?.expired).map(async effect=>{
    const definition=Object.values(STATUS_DEFINITIONS).find(entry=>effect.statuses.has(entry.id));
    const rules=effectRules(effect),pending=Boolean(effect.flags?.[SYSTEM_ID]?.conditionRequest);
    const legacy=definition&&!effect.flags?.[SYSTEM_ID]?.condition;
    const text=poisonDescription(effect,effect.description||definition?.description||"");
    return {id:effect.id,name:legacy?game.i18n.localize(definition.name):effect.name,img:effect.img??definition?.img,inactive:effect.disabled||effect.isSuppressed,
      canRemove:sheet.isEditable&&(game.user.isGM||![DYING,DEAD,EXHAUSTED_STUN,UNCONSCIOUS].some(status=>effect.statuses.has(status))),
      toxicity:sheet.actor.system.details?.race==="witcher"?doseToxicity(effect):0,counter:effectCounter(effect),save:rules.save,canSave:sheet.isEditable&&!pending&&canSaveEffect(sheet.actor,effect),
      saveHint:rules.save?.kind==="skill"?`${game.i18n.localize(`WITCHER.Skills.Entries.${rules.save.skill}.Label`)} · СЛ ${rules.save.dc}`:rules.save?.action,
      autoAllowed:Boolean(!rules.manualOnly&&rules.save&&rules.save.kind!=="death"&&rules.save.ends),autoSave:Boolean(rules.autoSave),
      durationLabel:effectDurationLabel(effect,globalThis.CONFIG?.time?.roundTime??3),pending,canEditDuration:sheet.isEditable&&canEditEffectDuration(effect),
      action:rules.action,canAct:sheet.isEditable&&conditionRules(sheet.actor).canAct,
      description:await foundry.applications.ux.TextEditor.implementation.enrichHTML(text.startsWith("WITCHER.")?game.i18n.localize(text):text,{secrets:sheet.actor.isOwner,relativeTo:effect})};
  }));
}
const safe=fn=>async function(...args){try{return await fn.apply(this,args);}catch(error){console.error(error);ui.notifications.error(error.message);}};
export const effectActions={
  changeEffectCounter:safe(async function(_event,target){if(this.isEditable)await changeEffectCounter(this.actor,target.dataset.effectId,Number(target.dataset.delta));}),
  editEffectDuration:safe(async function(_event,target){if(this.isEditable)await editEffectDuration(this.actor.effects.get(target.dataset.effectId));}),
  browseEffects:safe(async function(){
    if(!this.isEditable)return;
    const pack=game.packs.get(`${SYSTEM_ID}.effects`);
    const effects=pack?await pack.getDocuments():[];
    // New built-in states remain available when an installed pack predates this update.
    for(const entry of EFFECT_TEMPLATES)if(!effects.some(effect=>(effect.id??effect._id)===entry.documentId))effects.push(conditionSource(entry,text=>game.i18n.localize(text)));
    effects.push(...game.items.filter(item=>item.type==="effect"&&item.testUserPermission(game.user,"OBSERVER")));
    const entryId=effect=>effect.uuid??effect.id??effect._id;
    const id=await chooseReference("effect","",{title:"Эффекты",hint:"Выберите состояние. Его также можно перетащить из компендиума или описания состава на лист.",groups:{},
      entries:effects.map(effect=>({id:entryId(effect),label:effect.name,img:effect.img,summary:(effect.description??effect.effects?.contents?.[0]?.description??"").replace(/<[^>]*>/g," "),details:[]}))});
    const effect=effects.find(effect=>entryId(effect)===id);if(!effect)return;
    if(effect.type==="effect")return applyEffectItem(this.actor,effect);
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
    if(rules.manualOnly)return;
    await effect.update({[`flags.${SYSTEM_ID}.condition`]:{...structuredClone(rules),autoSave:!rules.autoSave}});
  })
};
