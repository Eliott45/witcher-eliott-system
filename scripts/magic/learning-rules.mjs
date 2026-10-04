import {castingSkill,learnedSpell} from "./rules.mjs";
export const LEARNING_TIERS={novice:{cost:10,baseDays:4,dc:14,required:2},journeyman:{cost:20,baseDays:7,dc:18,required:4},master:{cost:30,baseDays:21,dc:22,required:6},archpriest:{cost:40,baseDays:35,dc:24,required:8}};
export function learningRule(system) {
  const grade=system.kind==="hex"?({low:"novice",medium:"journeyman",high:"master"}[system.hex.danger]):system.grade;
  const rule=LEARNING_TIERS[grade];if(!rule)throw new Error("Неизвестный уровень магии.");
  return {...rule,skill:castingSkill(system)};
}
export function learningError(actor,source,{allowKnown=false}={}) {
  if(!actor.isOwner)return "Нет права изменять этого персонажа.";
  if(source?.type!=="spell"||!source.testUserPermission(game.user,"OBSERVER"))return "Источник магии недоступен.";
  if(actor.system.statistics.vigor<=0)return "Для обучения Энергия должна быть выше 0.";
  const profession=actor.system.details.profession,kind=source.system.kind??"spell";
  if(!["mage","priest","witcher"].includes(profession))return "Обучение доступно магам, жрецам и ведьмакам.";
  if(profession==="witcher"&&kind!=="sign")return "Ведьмак может изучать только знаки.";
  if(kind==="spell"&&profession==="mage"&&source.system.tradition!=="mage")return "Маг не может изучать инвокации.";
  if(kind==="spell"&&profession==="priest"&&source.system.tradition==="mage")return "Жрец не может изучать заклинания мага.";
  if(!allowKnown&&learnedSpell(actor,source))return "Эта магия уже есть в книге персонажа.";
  return "";
}
export function learningProgress(study) {
  const requiredDays=study.baseDays+study.failures;
  return {requiredDays,ready:Boolean(study.sourceUuid&&study.days>=requiredDays&&study.successes>=study.required),
    successPercent:Math.min(100,study.successes/Math.max(1,study.required)*100),dayPercent:Math.min(100,study.days/Math.max(1,requiredDays)*100)};
}
