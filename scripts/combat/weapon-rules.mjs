import { hasCrossbowMod } from "../data/crossbow-modifications.mjs";
import { armPenaltyParts, usableHands } from "./critical-wound-effects.mjs";
import { skillValue } from "../data/skills.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { shieldClass } from "../data/shields.mjs";
import { aimingBonus } from "./full-turn-rules.mjs";
import { statusEffect } from "../data/effect-counters.mjs";
import { actorEnvironment, worksUnderwater } from "./environment.mjs";
import { creatureHypnosisPenalty } from "./creature-actions-rules.mjs";
import { creatureAttackParts, creatureCanSwim, creatureHumanForm, creatureWeaponBlocked } from "../data/creature-modes.mjs";
import { furyTargetError } from "./experimental-effects.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { attackLocation, bodyPlanOf } from "../data/hit-locations.mjs";
export { ATTACK_LOCATIONS, attackLocation, bodyPlanOf, hitLocation } from "../data/hit-locations.mjs";

export const gripOf = item => item.system.natural ? 0 : item.system.grip || item.system.hands || 1;
/** Effect penalties such as Staggered or Prone, targeted at "combat.attack" / "combat.defense". */
export const combatModifierParts = (actor, target) => (actor.system.statistics?.modifiers ?? [])
  .filter(modifier => modifier.target === target && !modifier.condition && modifier.value).map(modifier => ({ label: modifier.label, value: modifier.value }));
export const signed = value => value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
// Core p.48 only tabulates BODY 1–13. Do not extrapolate beyond that table.
export const bodyDamage = body => body == null ? 0 : 2 * Math.ceil(Math.min(13, Math.max(1, body)) / 2) - 6;
export function weaponReadiness(actor,item,weapon=effectiveItem(item),{allowOneHand=false}={}) {
  const transfer = actor.flags?.[SYSTEM_ID]?.lootRequest;
  if (transfer?.action === "drop" && transfer.itemId === item.id) return "Оружие уже брошено: дождитесь перемещения предмета мастером";
  if (weapon.natural && creatureHumanForm(actor)) return "В человеческом облике когти и укус волколака недоступны";
  if (weapon.natural && creatureWeaponBlocked(actor, item)) return creatureWeaponBlocked(actor, item);
  if (actor.flags?.["witcher-eliott-system"]?.severedTongue && item.name === "Язык") return "Язык отрублен";
  if(!equippedItems(actor.items).some(entry=>entry.id===item.id))return "Возьмите оружие в руки";
  if(!allowOneHand&&!weapon.natural&&gripOf(item)<(weapon.hands??1))return `Нужно рук: ${weapon.hands}`;
  if(!weapon.natural&&gripOf(item)>usableHands(actor))return usableHands(actor)?"Одна рука выведена из строя: держите оружие одной рукой":"Обе руки выведены из строя";
  if(!weapon.natural&&weapon.reliability?.max&&weapon.reliability.value<=0)return "Оружие сломано";
  const block=(actor.effects??[]).find(effect=>!effect.disabled&&!effect.isSuppressed&&effect.flags?.["witcher-eliott-system"]?.weaponBlock?.itemId===item.id);
  if(block)return ({stuck:"Оружие застряло",jammed:"Оружие заклинило",disarmed:"Оружие выбито из рук"})[block.flags["witcher-eliott-system"].weaponBlock.reason]??block.name;
  return "";
}
export function shieldPunch(body,weightClass) {
  // TODO: p.164 says two/four levels on the punch table, not +2/+4 damage.
  // Treat these as rows of p.48; cap at the last printed row. The Item damage field
  // can override this interpretation until an official numerical example is available.
  const steps={light:0,medium:2,heavy:4}[weightClass];
  return steps===undefined?null:Math.min(8,bodyDamage(body)+2*steps);
}
// Core p.164: distance bands with the DC of a target that does not defend (p.165 adds the size modifier).
export const RANGED_BANDS = [{id:"auto",name:"Дистанция: авто по токенам",penalty:0},{id:"normal",name:"Дистанция: без поправки",penalty:0,dc:15},
  {id:"point",name:"В упор (≤ 0,5 м) · +5",penalty:5,dc:10},{id:"short",name:"Ближняя (¼ дальности) · 0",penalty:0,dc:15},
  {id:"medium",name:"Средняя (½ дальности) · −2",penalty:-2,dc:20},{id:"long",name:"Дальняя · −4",penalty:-4,dc:25},
  {id:"extreme",name:"Предельная (×2) · −6",penalty:-6,dc:30}];
const BAND_NAMES={point:"в упор",short:"ближняя",medium:"средняя",long:"дальняя",extreme:"предельная"};
/** The band for `distance` metres with a weapon of `range` metres; null beyond twice the range. */
export function bandFor(range,distance) {
  if(!(range>0)||distance==null)return null;
  const id=distance<=0.5?"point":distance<=range/4?"short":distance<=range/2?"medium":distance<=range?"long":distance<=range*2?"extreme":null;
  if(!id)return {id:"beyond",name:`Дистанция ${distance} м: дальше предельной (${range*2} м)`,penalty:0,dc:30,distance,beyond:true};
  const band=RANGED_BANDS.find(entry=>entry.id===id);
  return {...band,name:`Дистанция ${String(distance).replace(".",",")} м: ${BAND_NAMES[id]}`,distance,auto:true};
}
/** Core p.163 «Парное оружие»: any weapon held in one hand, two hand crossbows included; a shield is held in one hand too. */
export const canDualWield = item => item?.type==="weapon"&&!item.system.natural&&gripOf(item)===1&&(["melee","thrown","shield"].includes(item.system.category)||item.system.skill==="crossbow");
/** Witchers of the Viper school (Gorthur Gvaed) take no penalty for a joint attack. */
export const dualPenalty = actor => actor?.system?.lifepath?.witcher?.school==="viper"?0:-3;
function dualMode(actor,item) {
  if(!canDualWield(item)||!equippedItems(actor.items??[]).some(entry=>entry.id!==item.id&&canDualWield(entry)))return null;
  const penalty=dualPenalty(actor);
  return {id:"dual",name:"Парная атака",count:1,penalty,multiplier:1,dual:true,secondary:true,
    hint:`Одно действие атаки (errata): по удару каждым оружием в руках (в том числе щитом или двумя ручными арбалетами), ${penalty?"оба с −3":"без штрафа — школа Змеи"}, урон каждого считается отдельно. Блокировать или парировать её может только тот, у кого тоже два оружия или оружие и щит, остальные лишь уклоняются или меняют позицию.`};
}
export function attackModes(actor,item) {
  const stirrup=hasCrossbowMod(item,"skellige")?[{id:"stirrup",name:"Удар арбалетом",count:1,penalty:-1,multiplier:1,stirrup:true,hint:"Дробящий удар. Бонусы других модификаций арбалета и боеприпасов не применяются."}]:[];
  const thrown = item.system.category === "melee" && !item.system.natural && item.system.rangeBodyMultiplier > 0
    ? [{id:"throw",name:"Метнуть",count:1,penalty:0,multiplier:1,thrown:true,hint:`Атлетика; дальность ТЕЛ × ${item.system.rangeBodyMultiplier}. После броска оружие остаётся у места попадания; его нужно подобрать.`}] : [];
  // Core p.165: under water a melee weapon strikes once per turn.
  const underwaterMelee=["melee","shield"].includes(item.system.category)&&!item.system.natural||item.system.natural&&item.system.category!=="ranged";
  const slowed=underwaterMelee&&Boolean(actorEnvironment(actor)?.underwater)&&!creatureCanSwim(actor);
  if (actor.type === "npc") { const count=slowed?1:item.system.attackRate??1; return [{id:"npc",name:`Атака ×${count}`,count,penalty:0,multiplier:1},...stirrup,...thrown]; }
  if (item.system.skill === "crossbow") { const dual=dualMode(actor,item); return [{id:"shot",name:"Выстрел",count:1,penalty:0,multiplier:1},...(dual?[dual]:[]),...stirrup]; }
  // Core p.153: a fast attack is two strikes for one action. Each click rolls one strike, so the two may hit different targets.
  const modes=[{id:"fast",name:item.system.skill==="archery"?"Быстрый выстрел":"Быстрая",count:1,penalty:0,multiplier:1,pair:item.system.skill!=="archery"&&!slowed,...(slowed?{hint:"Под водой оружием ближнего боя — один удар за ход."}:{})},
    {id:"strong",name:"Сильная",count:1,penalty:-3,multiplier:2}];
  // Core pp.163–164 special attacks; each is one action replacing the attack (a charge takes the full round).
  if(item.system.category==="melee"&&!item.system.natural) modes.push(
    {id:"charge",name:"С разбега",count:1,penalty:-3,multiplier:2,charge:true,secondary:true,
      hint:"Полный ход: переместитесь до расстояния Бега и нанесите сильную атаку (−3 к попаданию, урон ×2). Если цель заблокирует удар, в чате появится встречная проверка Силы: при победе цель сбита с ног."},
    {id:"pommel",name:"Удар эфесом",count:1,penalty:0,multiplier:1,pommel:true,secondary:true,hint:"Удар рукоятью или обухом: проверка как у обычной атаки, урон оружия вдвое меньше и несмертельный — отнимает Выносливость, а не ПЗ, и не оставляет критических ранений."},
    {id:"disarm",name:"Разоружение",count:1,penalty:0,multiplier:1,special:"weapon-disarm",secondary:true,hint:"Прицельный удар по оружию цели. Урона нет. При попадании её оружие выпадает и отлетает на 1d6 м в случайную сторону (таблица разброса) — на карте появляется кучка добычи, оружие нужно подобрать."},
    {id:"trip",name:"Подсечка",count:1,penalty:0,multiplier:1,special:"weapon-trip",secondary:true,hint:"Удар по ногам. Урона нет. При попадании цель падает ничком: −2 к атаке и защите. Чтобы встать, нужно потратить всё передвижение за текущий ход."});
  const dual=dualMode(actor,item);if(dual)modes.push(dual);
  return [...modes,...thrown];
}
export function weaponAttack(actor,item,{mode="fast",extraPenalty=0,location="random",range="auto",modifier=0,targetContext=null,ambushBonus=0,ignoreNaturalRange=false,schoolReaction=false}={}) {
  if(item?.type!=="weapon")throw new Error("Выберите оружие.");
  let weapon=effectiveItem(item);let attack=attackModes(actor,item).find(entry=>entry.id===mode);
  if (schoolReaction) {
    if (["disarm", "trip"].includes(mode) && item.system.category === "melee") attack = {id:mode,name:mode === "trip" ? "Подсечка" : "Разоружение",count:1,penalty:0,multiplier:1,special:`weapon-${mode}`};
    else if (mode === "fast") { attack ??= attackModes(actor,item).find(entry => ["shot", "npc"].includes(entry.id)); if (attack) attack = {...attack,count:1,pair:false}; }
  }
  if(!attack)throw new Error("Этот режим недоступен для данного оружия.");
  if(attack.stirrup) {
    const base=item.system.toObject?.()??item.system;
    weapon={...effectiveItem({...item,system:{...base,installations:base.installations.filter(entry=>entry.category!=="crossbow"||entry.ruleId==="radolf.crossbow.skellige")}}),category:"melee",skill:"melee",damageType:"Д",range:1,rangeBodyMultiplier:0,damageIncludesBody:true};
  }
  // The item remains a melee weapon in the inventory; only this attack is a thrown projectile.
  if(attack.thrown)weapon={...weapon,category:"thrown",skill:"athletics"};
  const skill=skillValue(actor.system,weapon.skill);
  const aim=attackLocation(location,targetContext?.target?.actor?bodyPlanOf(targetContext.target.actor):undefined);
  if(!aim||!Number.isFinite(Number(modifier))||Math.abs(Number(modifier))>100)throw new Error("Неверный модификатор атаки.");
  const ranged=["ranged","thrown"].includes(weapon.category),underwater=Boolean(actorEnvironment(actor)?.underwater),bowUnderwater=underwater&&weapon.category==="ranged";
  // Core p.165: under water bows and crossbows reach a quarter as far and deal half damage.
  const reach=(weapon.rangeBodyMultiplier?weapon.rangeBodyMultiplier*actor.system.statistics.effective.body:weapon.range)/(bowUnderwater?4:1);
  const band=!ranged?RANGED_BANDS[1]:range==="auto"?bandFor(reach,targetContext?.distance)??{...RANGED_BANDS[1],id:"auto",name:"Дистанция: не измерена"}:RANGED_BANDS.find(entry=>entry.id===range&&entry.id!=="auto");
  if(!band)throw new Error("Неверная дистанция.");
  const parts=[{label:"Основа навыка",value:skill.total},{label:"Точность оружия",value:weapon.accuracy??0},
    {label:"Двуручное оружие одной рукой",value:!weapon.natural&&gripOf(item)<(weapon.hands??1)?-3:0},
    // TODO(p.151): no explicit multi-projectile Aim example in core/errata or Sage's Answers found.
    // Keep one base for the existing attack action (including an NPC's printed rate of fire).
    {label:"Прицеливание",value:ranged&&!targetContext?.blind&&!statusEffect(actor,"quick-draw")?aimingBonus(actor):0},
    {label:attack.name,value:attack.penalty},{label:"Дополнительное действие",value:extraPenalty},
    {label:aim.name,value:aim.penalty},{label:band.name.replace(/ · [−+]?\d+$/u,""),value:band.penalty},{label:"Ситуация",value:Number(modifier)},
    ...(targetContext?.parts??[]), ...creatureAttackParts(actor,targetContext?.target?.actor), {label:"Гипноз беса",value:creatureHypnosisPenalty(actor,targetContext?.target?.actor)}, ...(ambushBonus?[{label:"Засада",value:ambushBonus}]:[]), ...combatModifierParts(actor,"combat.attack"), ...armPenaltyParts(actor,item), ...(targetContext?.target?.actor?combatModifierParts(targetContext.target.actor,"combat.targeted"):[])];
  const total=skill.total===null?null:parts.reduce((sum,part)=>sum+part.value,0);
  const melee=["melee","thrown","shield"].includes(weapon.category);
  const shield=weapon.category==="shield"&&weapon.damage==="0";
  const body=shield?shieldPunch(actor.system.statistics.effective.body,shieldClass(weapon)):melee&&!weapon.damageIncludesBody?bodyDamage(actor.system.statistics.effective.body):0;
  const bonus=(melee?actor.system.statistics.meleeDamageBonus??0:0)+(actor.system.statistics.physicalDamageBonus??0);
  const unarmedBonus=weapon.ruleId==="weapon.brass-knuckles"&&!weapon.damageIncludesBody?" + 1d6":"";
  const base=`(${shield?"1d6":weapon.damage}${unarmedBonus}${body+bonus?` + ${body+bonus}`:""})${attack.multiplier===2?" * 2":""}`;
  // Pommel strike (core p.164): half damage, non-lethal. Disarm and trip deal no damage.
  const damage=attack.special?null:attack.pommel||bowUnderwater?`floor(${base} / 2)`:base;
  const distance=targetContext?.distance,minRange=Number(String(weapon.properties??"").match(/дальше (\d+) м/iu)?.[1]??0);
  const naturalRange=weapon.natural&&!ranged&&!ignoreNaturalRange?(weapon.range||1):null;
  const rangeBlocked=distance!=null&&minRange>0&&distance<=minRange?`Цель должна быть дальше ${minRange} м`:distance!=null&&naturalRange!==null&&distance>naturalRange?`До цели дальше ${naturalRange} м`:"";
  const blocked=furyTargetError(actor,targetContext?.target)|| (targetContext?.blind&&location!=="random"?"Нельзя выбирать место удара по цели вне вашего конуса зрения":rangeBlocked|| (shield&&body===null?"Укажите класс щита или формулу урона в предмете":weaponReadiness(actor,item,weapon,{allowOneHand:true})|| (total===null?"Заполните параметр навыка":weapon.skill==="crossbow"&&!weapon.loaded?"Нужна перезарядка":band.beyond?`Цель дальше предельной дистанции (${reach*2} м)`:underwater&&!worksUnderwater({...weapon,skill:item.system.skill,name:item.name})?"Под водой метательное оружие (кроме копья) не работает":"")));
  return {name:item.name,nonLethal:Boolean(attack.pommel),weapon,attack,skill,parts,total,damage,body,bonus,aim,band,ranged,blocked,range:reach};
}
