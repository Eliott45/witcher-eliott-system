import {SYSTEM_ID} from "../config.mjs";
import {learningRule,learningError,learningProgress,LEARNING_TIERS} from "../magic/learning-rules.mjs";
import {magicPayment} from "../magic/improvement-points.mjs";
import {CASTING_SKILL_LABELS} from "../magic/rules.mjs";
import {SPELL_GRADES} from "../data/spells.mjs";
import {startStudy,studyDay,finishStudy,cancelStudy} from "../magic/learning.mjs";
import {conditionRules} from "../combat/condition-rules.mjs";
import {escapeTooltip as esc} from "./statistics-tooltips.mjs";

export function learningContext(actor) {
  const study=actor.system.magic.study;
  return {active:Boolean(study.sourceUuid),study:{...study,...learningProgress(study),skillLabel:CASTING_SKILL_LABELS[study.skill]??""},
    points:actor.system.experience,magicPoints:actor.system.magic.improvementPoints,
    canStudy:actor.isOwner&&actor.system.statistics.vigor>0&&["mage","priest","witcher"].includes(actor.system.details.profession)&&conditionRules(actor).canAct,
    tiers:Object.entries(LEARNING_TIERS).map(([grade,row])=>({...row,name:SPELL_GRADES[grade]}))};
}
export async function startStudyDialog(actor,source) {
  const error=learningError(actor,source);if(error)throw new Error(error);
  const rule=learningRule(source.system),payment=magicPayment(actor,rule.cost);
  return foundry.applications.api.DialogV2.wait({classes:["witcher-picker","witcher-learning-dialog"],window:{title:"Начать обучение"},position:{width:540},
    content:`<div class="witcher-learning"><span class="witcher-magic-eyebrow">НОВОЕ ЗНАНИЕ</span><h2>${esc(source.name)}</h2><div class="witcher-study-metrics"><div><strong>${rule.cost}</strong><span>О.У.</span></div><div><strong>${rule.baseDays}</strong><span>дней</span></div><div><strong>${rule.dc}</strong><span>сложность</span></div><div><strong>${rule.required}</strong><span>успеха</span></div></div><p>${CASTING_SKILL_LABELS[rule.skill]}. При каждом провале — дополнительный день.</p><label>Наставник или книга<input type="text" name="teacher" required placeholder="Имя наставника или название книги" maxlength="300"></label><p>Оплата сейчас: ${payment.magicSpent} магических + ${payment.regularSpent} обычных О.У. Останется: ${payment.remaining} обычных, ${payment.magicRemaining} магических.</p>${source.system.deity?`<p>Условия божества: ${esc(source.system.deity)}. Подтвердите их с ведущим.</p>`:""}</div>`,
    buttons:[{action:"start",label:"Начать обучение",icon:"fa-solid fa-book-open-reader",disabled:payment.remaining<0,callback:(_e,_b,dialog)=>startStudy(actor,source,dialog.element.querySelector('[name=teacher]').value)},{action:"cancel",label:"Отмена"}]});
}
const action=callback=>async function(event,target){if(!this.isEditable)return;target.disabled=true;try{return await callback.call(this,event,target);}catch(error){ui.notifications.error(error.message);console.error(`${SYSTEM_ID} | Magic learning`,error);}finally{target.disabled=false;}};
export const learningActions={
  browseLearning:action(async function(){return (await import("./spell-browser.mjs")).browseSpells(this.actor,{study:true});}),
  studyDay:action(function(_e,target){return studyDay(this.actor,target.dataset.studyId);}),
  finishStudy:action(function(_e,target){return finishStudy(this.actor,target.dataset.studyId);}),
  cancelStudy:action(async function(_e,target){
    const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:"Прекратить обучение"},content:"<p>Прогресс будет удалён, потраченные О.У. не возвращаются. Продолжить?</p>"});
    if(confirmed)return cancelStudy(this.actor,target.dataset.studyId);
  }),
  viewStudySource:action(async function(){const source=await foundry.utils.fromUuid(this.actor.system.magic.study.sourceUuid);if(!source)throw new Error("Источник магии недоступен.");return source.sheet.render({force:true});})
};
