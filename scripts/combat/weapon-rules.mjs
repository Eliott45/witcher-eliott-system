import { skillValue } from "../data/skills.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { shieldClass } from "../data/shields.mjs";
import { aimingBonus } from "./full-turn-rules.mjs";

export const gripOf = item => item.system.natural ? 0 : item.system.grip || item.system.hands || 1;
export const signed = value => value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
// Core p.48 only tabulates BODY 1–13. Do not extrapolate beyond that table.
export const bodyDamage = body => body == null ? 0 : 2 * Math.ceil(Math.min(13, Math.max(1, body)) / 2) - 6;
export function weaponReadiness(actor,item,weapon=effectiveItem(item),{allowOneHand=false}={}) {
  if(!equippedItems(actor.items).some(entry=>entry.id===item.id))return "Возьмите оружие в руки";
  if(!allowOneHand&&!weapon.natural&&gripOf(item)<(weapon.hands??1))return `Нужно рук: ${weapon.hands}`;
  if(!weapon.natural&&weapon.reliability?.max&&weapon.reliability.value<=0)return "Оружие сломано";
  return "";
}
export function shieldPunch(body,weightClass) {
  // TODO: p.164 says two/four levels on the punch table, not +2/+4 damage.
  // Treat these as rows of p.48; cap at the last printed row. The Item damage field
  // can override this interpretation until an official numerical example is available.
  const steps={light:0,medium:2,heavy:4}[weightClass];
  return steps===undefined?null:Math.min(8,bodyDamage(body)+2*steps);
}
export const ATTACK_LOCATIONS = [
  {id:"random",name:"Без прицеливания",penalty:0,multiplier:1},
  {id:"head",name:"Голова",penalty:-6,multiplier:3},
  {id:"torso",name:"Корпус",penalty:-1,multiplier:1},
  {id:"rightArm",name:"Правая рука / конечность",penalty:-3,multiplier:0.5},
  {id:"leftArm",name:"Левая рука / конечность",penalty:-3,multiplier:0.5},
  {id:"rightLeg",name:"Правая нога",penalty:-2,multiplier:0.5},
  {id:"leftLeg",name:"Левая нога",penalty:-2,multiplier:0.5},
  {id:"tail",name:"Хвост / крыло",penalty:-2,multiplier:0.5}
];
export const RANGED_BANDS = [{id:"normal",name:"Дистанция: без поправки",penalty:0},
  {id:"point",name:"В упор (≤ 0,5 м) · +5",penalty:5},{id:"short",name:"Ближняя (¼ дальности) · 0",penalty:0},
  {id:"medium",name:"Средняя (½ дальности) · −2",penalty:-2},{id:"long",name:"Дальняя · −4",penalty:-4},
  {id:"extreme",name:"Предельная (×2) · −6",penalty:-6}];
export function hitLocation(result,bodyPlan="humanoid") {
  if(!Number.isInteger(result)||result<1||result>10||!["humanoid","monster"].includes(bodyPlan))throw new Error("Неизвестная зона попадания.");
  const table=bodyPlan==="humanoid"?["head","torso","torso","torso","rightArm","leftArm","rightLeg","rightLeg","leftLeg","leftLeg"]:
    ["head","torso","torso","torso","torso","rightArm","rightArm","leftArm","leftArm","tail"];
  return ATTACK_LOCATIONS.find(entry=>entry.id===table[result-1]);
}
export function attackModes(actor,item) {
  if (actor.type === "npc") return [{id:"npc",name:`Атака ×${item.system.attackRate??1}`,count:item.system.attackRate??1,penalty:0,multiplier:1}];
  if (item.system.skill === "crossbow") return [{id:"shot",name:"Выстрел",count:1,penalty:0,multiplier:1}];
  return [{id:"fast",name:item.system.skill==="archery"?"Быстрый выстрел":"Две быстрые",count:item.system.skill==="archery"?1:2,penalty:0,multiplier:1},
    {id:"strong",name:"Сильная",count:1,penalty:-3,multiplier:2}];
}
export function weaponAttack(actor,item,{mode="fast",extraPenalty=0,location="random",range="normal",modifier=0}={}) {
  if(item?.type!=="weapon")throw new Error("Выберите оружие.");
  const weapon=effectiveItem(item),attack=attackModes(actor,item).find(entry=>entry.id===mode);
  if(!attack)throw new Error("Этот режим недоступен для данного оружия.");
  const skill=skillValue(actor.system,weapon.skill),aim=ATTACK_LOCATIONS.find(entry=>entry.id===location);
  if(!aim||!Number.isFinite(Number(modifier))||Math.abs(Number(modifier))>100)throw new Error("Неверный модификатор атаки.");
  const ranged=["ranged","thrown"].includes(weapon.category),band=ranged?RANGED_BANDS.find(entry=>entry.id===range):RANGED_BANDS[0];
  if(!band)throw new Error("Неверная дистанция.");
  const parts=[{label:"Основа навыка",value:skill.total},{label:"Точность оружия",value:weapon.accuracy??0},
    {label:"Двуручное оружие одной рукой",value:!weapon.natural&&gripOf(item)<(weapon.hands??1)?-3:0},
    // TODO(p.151): no explicit multi-projectile Aim example in core/errata or Sage's Answers found.
    // Keep one base for the existing attack action (including an NPC's printed rate of fire).
    {label:"Прицеливание",value:ranged?aimingBonus(actor):0},
    {label:attack.name,value:attack.penalty},{label:"Дополнительное действие",value:extraPenalty},
    {label:aim.name,value:aim.penalty},{label:band.name,value:band.penalty},{label:"Ситуация",value:Number(modifier)}];
  const total=skill.total===null?null:parts.reduce((sum,part)=>sum+part.value,0);
  const melee=["melee","thrown","shield"].includes(weapon.category);
  const shield=weapon.category==="shield"&&weapon.damage==="0";
  const body=shield?shieldPunch(actor.system.statistics.effective.body,shieldClass(weapon)):melee&&!weapon.damageIncludesBody?bodyDamage(actor.system.statistics.effective.body):0;
  const bonus=melee?actor.system.statistics.meleeDamageBonus??0:0;
  const unarmedBonus=weapon.ruleId==="weapon.brass-knuckles"&&!weapon.damageIncludesBody?" + 1d6":"";
  const damage=`(${shield?"1d6":weapon.damage}${unarmedBonus}${body+bonus?` + ${body+bonus}`:""})${attack.multiplier===2?" * 2":""}`;
  const blocked=shield&&body===null?"Укажите класс щита или формулу урона в предмете":weaponReadiness(actor,item,weapon,{allowOneHand:true})|| (total===null?"Заполните параметр навыка":weapon.skill==="crossbow"&&!weapon.loaded?"Нужна перезарядка":"");
  return {weapon,attack,skill,parts,total,damage,body,bonus,aim,band,ranged,blocked,range:weapon.rangeBodyMultiplier?weapon.rangeBodyMultiplier*actor.system.statistics.effective.body:weapon.range};
}
