import { evaluateRoll } from "../dice/minimum-roll.mjs";
import {SYSTEM_ID} from "../config.mjs";
import {queueActorWrite} from "../data/actor-writes.mjs";
import {skillValue} from "../data/skills.mjs";
import {conditionRules} from "../combat/condition-rules.mjs";
import {trackRollDisplay} from "../chat/roll-display.mjs";
import {escapeTooltip as esc} from "../sheets/statistics-tooltips.mjs";
import {learnSpell} from "./casting.mjs";
import {CASTING_SKILL_LABELS} from "./rules.mjs";
import {learningError,learningRule,learningProgress} from "./learning-rules.mjs";
import {magicPayment} from "./improvement-points.mjs";

function assertStudy(actor,id) {
  if(!actor.isOwner)throw new Error("Нет права изменять этого персонажа.");
  const study=actor.system.magic.study;
  if(!id||study.id!==id||!study.sourceUuid)throw new Error("План обучения изменился. Откройте его заново.");
  return {...study};
}
async function studySource(actor,study) {
  const source=await foundry.utils.fromUuid(study.sourceUuid),error=learningError(actor,source,{allowKnown:true});if(error)throw new Error(error);
  const current=learningRule(source.system);
  if(Object.entries(current).some(([key,value])=>study[key]!==value))throw new Error("Уровень или вид изучаемой магии изменился. Восстановите исходные параметры или начните новый план.");
  return source;
}
export function startStudy(actor,source,teacher) {
  return queueActorWrite(actor,async()=>{
    const error=learningError(actor,source);if(error)throw new Error(error);
    if(actor.system.magic.study.sourceUuid)throw new Error("Сначала завершите текущее обучение.");
    const mentor=String(teacher??"").trim();if(!mentor)throw new Error("Укажите наставника или книгу с нужными знаниями.");
    const rule=learningRule(source.system),payment=magicPayment(actor,rule.cost);
    if(payment.remaining<0)throw new Error(`Недостаточно О.У.: требуется ${rule.cost}.`);
    const study={id:foundry.utils.randomID(),sourceUuid:source.uuid,sourceName:source.name,teacher:mentor,skill:rule.skill,
      ...rule,days:0,successes:0,failures:0,regularSpent:payment.regularSpent,magicSpent:payment.magicSpent};
    const saved=await actor.update({"system.experience":payment.remaining,"system.magic.improvementPoints":payment.magicRemaining,"system.magic.study":study});
    if(!saved)throw new Error("Не удалось сохранить обучение.");return study;
  });
}

const pendingDays=new WeakMap();
export function studyDay(actor,id) {
  if(pendingDays.has(actor))return pendingDays.get(actor);
  const work=queueActorWrite(actor,async()=>{
    const study=assertStudy(actor,id);
    if(!conditionRules(actor).canAct||actor.system.statistics.vigor<=0)throw new Error("Персонаж сейчас не может заниматься магией.");
    if(learningProgress(study).ready)throw new Error("Обучение готово к завершению.");
    await studySource(actor,study);
    const display=trackRollDisplay();
    try {
      if(study.successes<study.required) {
        const skill=skillValue(actor.system,study.skill);if(skill?.total==null)throw new Error("Укажите Волю персонажа.");
        const mode=game.settings.get("core","messageMode");
        const roll=await evaluateRoll(`1d10wc + ${skill.total}`,{allowInteractive:mode!=="blind"});
        const message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
          flavor:`<h3>Обучение: ${esc(study.sourceName)}</h3><p>День ${study.days+1} · ${CASTING_SKILL_LABELS[study.skill]} · СЛ ${study.dc}. Провал добавляет один день обучения; новая попытка — в следующий день.</p>`,flags:{[SYSTEM_ID]:display.flags[SYSTEM_ID]}},{messageMode:mode});
        if(!message)throw new Error("Бросок обучения не создан.");
        await display.wait(message);
        if(message.rolls[0].total>=study.dc)study.successes++;else study.failures++;
      }
      // A click confirms one actual study day; never change the whole world's clock.
      // TODO(p.123): no schedule for checks within the minimum duration is specified.
      // At most one attempt per recorded day enforces the explicit next-day retry.
      study.days++;
      const latest=assertStudy(actor,id);
      if(latest.days!==study.days-1)throw new Error("Обучение изменено в другом окне. Проверьте прогресс.");
      const saved=await actor.update({"system.magic.study":study});if(!saved)throw new Error("Не удалось сохранить день обучения.");
      return study;
    }finally{display.close();}
  });
  pendingDays.set(actor,work);const clear=()=>{if(pendingDays.get(actor)===work)pendingDays.delete(actor);};work.then(clear,clear);return work;
}

export function finishStudy(actor,id) {
  return queueActorWrite(actor,async()=>{
    const study=assertStudy(actor,id);if(!learningProgress(study).ready)throw new Error("Нужны все дни обучения и успешные проверки.");
    const source=await studySource(actor,study);
    // Reuse the catalog/drop import and its duplicate guard. If clearing the plan
    // fails, another finish safely finds the already imported Item without charging IP.
    const item=await learnSpell(actor,source);if(!item)throw new Error("Не удалось добавить магию в книгу.");
    const saved=await actor.update({"system.magic.study":emptyStudy()});if(!saved)throw new Error("Магия добавлена, но план не закрыт. Повторите завершение.");
    return item;
  });
}
export function cancelStudy(actor,id) {
  return queueActorWrite(actor,()=>{assertStudy(actor,id);return actor.update({"system.magic.study":emptyStudy()});});
}
function emptyStudy(){return {id:"",sourceUuid:"",sourceName:"",teacher:"",skill:"",cost:0,baseDays:0,dc:0,required:0,days:0,successes:0,failures:0,regularSpent:0,magicSpent:0};}
