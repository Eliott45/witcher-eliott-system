import { SYSTEM_ID } from "../config.mjs";

const skillSave = (skill, dc, action = "Одно действие") => ({ kind: "skill", skill, dc, action, ends: true });
const entry = (id, name, icon, description, rules = {}) => ({ id, name, img: `icons/svg/${icon}.svg`, description, rules });
// Canonical rules shared by token states, the compendium and existing Actor effects.
export const CONDITION_DEFINITIONS = [
  entry("stunned", "WITCHER.Effects.Stunned", "daze", "WITCHER.Effects.StunnedDescription", { save: {kind:"stun",action:"Полный ход",ends:true}, autoSave:true }),
  entry("exhausted-stun", "WITCHER.Effects.ExhaustedStun", "sleep", "WITCHER.Effects.ExhaustedStunDescription", {save:{kind:"stun",action:"Полный ход; сначала восстановите STA",ends:true},autoSave:true}),
  entry("unconscious", "WITCHER.Effects.Unconscious", "unconscious", "WITCHER.Effects.UnconsciousDescription"),
  entry("dying", "WITCHER.Effects.Dying", "blood", "WITCHER.Effects.DyingDescription", {save:{kind:"death",action:"Испытание смерти",ends:false}}),
  entry("dead", "WITCHER.Effects.Dead", "skull", "WITCHER.Effects.DeadDescription"),
  entry("burning", "Горение", "fire", "Каждый ход: 5 урона каждой части тела, который поглощается бронёй; огонь также повреждает броню и оружие на 1. Чтобы потушить пламя, потратьте ход на воду или перекатывание по земле. Урон и повреждение снаряжения учитываются вручную. Стр. 161.", {action:"Потушить пламя — полный ход"}),
  entry("poisoned", "Отравление", "poison", "Каждый ход: 3 урона, игнорирующего броню. Стойкость СЛ 15 прекращает отравление и занимает действие. Урон учитывается вручную. Стр. 161.", {save:skillSave("endurance",15),autoSave:true}),
  entry("bleeding", "Кровотечение", "blood", "Каждый ход: 2 урона, пока рана не обработана. Первая помощь СЛ 15 за действие или исцеляющая магия останавливает кровотечение. Урон учитывается вручную. Стр. 161.", {save:skillSave("firstAid",15),autoSave:true}),
  entry("frozen", "Замораживание", "ice-aura", "Лёд мешает движениям: −3 СКОР, −1 РЕА. Сила СЛ 16 позволяет разбить лёд за действие. Стр. 161.", {save:skillSave("physique",16),autoSave:true,modifiers:[{target:"attributes.speed",value:-3},{target:"attributes.reflex",value:-1}]}),
  entry("intoxicated", "Опьянение", "tankard", "−2 к РЕА, ЛВК и ИНТ; −3 в словесной дуэли. Вероятность плохо помнить произошедшее — 25%. Обычного повторного спасброска нет. Стр. 161.", {modifiers:[{target:"attributes.reflex",value:-2},{target:"attributes.dexterity",value:-2},{target:"attributes.intelligence",value:-2}]}),
  entry("hallucinating", "Галлюцинации", "eye", "Мастер описывает ложные ощущения. Дедукция СЛ 15 позволяет отличить одну иллюзию от реальности, но не снимает весь эффект. Стр. 161.", {save:{...skillSave("deduction",15),ends:false}}),
  entry("adhesive", "Алхимический клей", "net", "Через два раунда состав затвердевает. Чтобы освободить склеенные части, нужна Сила СЛ 16. Подвижность определяет мастер по месту попадания клея. Стр. 87; errata v4.", {save:skillSave("physique",16),autoSave:true,delayTurns:2}),
  entry("chloroform", "Хлороформ: без сознания", "unconscious", "Накладывается после провала первоначального испытания УСТ −2. Персонаж без сознания до успешного испытания УСТ −2. Удача не тратится. Стр. 87.", {save:{kind:"stunModified",modifier:-2,action:"Испытание УСТ −2",ends:true},autoSave:true,incapacitated:true}),
  entry("fisstech", "Фисштех: дезориентация", "daze", "Накладывается после провала Стойкости СЛ 16. Повторяйте проверку каждый раунд; результат ниже 10 лишает сознания на 5 раундов. Предельная длительность — полчаса. Зависимость проверяется отдельно: Стойкость СЛ 18 после каждой дозы. Стр. 87.", {save:skillSave("endurance",16,"Раз в раунд"),autoSave:true,incapacitated:true,seconds:1800}),
  entry("fisstech-unconscious", "Фисштех: без сознания", "unconscious", "Персонаж без сознания в течение пяти раундов после результата ниже 10 в проверке против фисштеха. Стр. 87.", {rounds:5,incapacitated:true}),
  entry("clotting", "Кровоостанавливающий порошок", "regen", "Кровотечение приостановлено на 2d10 раундов; затем оно возобновляется, если причина не устранена. Пока этот эффект активен, не учитывайте периодический урон кровотечения. Стр. 87.", {roundsFormula:"2d10"}),
  entry("numbing", "Обезболивающие травы", "regen", "На 2d10 раундов уменьшают на 2 штрафы от боли критических ранений и состояния при смерти. Коррекцию боли применяет мастер; базовые характеристики не меняются. Стр. 88.", {roundsFormula:"2d10"}),
  entry("sterilizing", "Обеззараживающая жидкость", "regen", "Естественное заживление увеличено на 2; критические ранения заживают на два дня быстрее. Повторные применения не суммируются. Стр. 88."),
  entry("succubus-skin", "Дыхание суккуба: на коже", "aura", "+2 к Соблазнению, пока действует нанесённый на кожу аромат. Стр. 88.", {modifiers:[{target:"skills.seduction",value:2}]}),
  entry("succubus-drink", "Дыхание суккуба: выпито", "aura", "−5 к проверкам против Соблазнения. Обнаружить примесь можно Вниманием СЛ 16; чёрный шоколад скрывает вкус. Условный штраф учитывается только против Соблазнения. Стр. 88."),
  entry("quick-fire", "Быстрый огонь: горючее покрытие", "fire", "Контакт с пламенем воспламеняет покрытую поверхность с вероятностью 50%. Уже существующая вероятность воспламенения повышается на 50%. Сам по себе состав не поджигает цель. Стр. 88."),
  entry("pantagran", "Эйфория Пантагорана", "aura", "На 1d6 / 2 часа: −2 к Сопротивлению убеждению. Стр. 88.", {secondsFormula:"1d6 * 1800",modifiers:[{target:"skills.resistCoercion",value:-2}]}),
  entry("active-dodge", "Активное уклонение", "shield", "Действие полного хода. В этом раунде противники получают −2 к атакам по вам в ближнем бою, а повторные защиты не расходуют Выносливость. Снимается в начале следующего раунда. Стр. 151; errata v4.", {rounds:1,expiry:"roundStart"}),
  entry("aiming", "Прицеливание", "target", "За каждый полный ход прицеливания: +1 к следующей дистанционной атаке, максимум +3 за три хода подряд. Счётчик хранится в одном эффекте. После атаки или в конце следующего хода без продолжения прицеливания эффект снимается. Стр. 151.", {rounds:1,expiry:"turnEnd",counter:{initial:1,max:3}})
];
export const CONDITION_BY_ID = Object.fromEntries(CONDITION_DEFINITIONS.map(entry=>[entry.id,entry]));
// Variants share the status ID: poison/drunkenness cannot stack with themselves.
export const EFFECT_TEMPLATES = [...CONDITION_DEFINITIONS.map((entry,i)=>({...entry,key:entry.id,documentId:`efct${String(i+1).padStart(12,"0")}`})),
  {...CONDITION_BY_ID.poisoned,key:"black-venom",name:"Чёрный яд",documentId:"efct000000000101",description:"Яд причиняет 3 урона за ход, игнорируя броню. Стойкость СЛ 16 прекращает отравление за действие. Урон учитывается вручную. Стр. 87.",rules:{save:skillSave("endurance",16),autoSave:true}},
  {...CONDITION_BY_ID.hallucinating,key:"hallucinogen",name:"Галлюциноген",documentId:"efct000000000102",description:"После провала первоначальной Стойкости СЛ 15 возникают галлюцинации на 1d10 раундов. Дедукция различает одну иллюзию и не снимает эффект. Стр. 87, 161.",rules:{...CONDITION_BY_ID.hallucinating.rules,roundsFormula:"1d10"}},
  {...CONDITION_BY_ID.intoxicated,key:"perfume",name:"Ароматное зелье: опьянение",documentId:"efct000000000103",description:"После провала первоначальной Стойкости СЛ 16: опьянение на 1d10 часов. −2 РЕА, ЛВК и ИНТ; −3 в словесной дуэли. Снять можно магией или Слезами жён, повторного спасброска нет. Токсичность 25%. Стр. 88.",rules:{...CONDITION_BY_ID.intoxicated.rules,secondsFormula:"1d10 * 3600"}},
  {...CONDITION_BY_ID.bleeding,key:"burrowing",name:"Ввинчивающийся наконечник",documentId:"efct000000000104",description:"Кровотечение от эльфского наконечника: 2 урона за ход. Для прекращения нужно извлечь наконечник: Первая помощь СЛ 16. Урон учитывается вручную. Стр. 84.",rules:{save:skillSave("firstAid",16),autoSave:true}}
];
export const ALCHEMY_EFFECT_KEYS = {clotting:["clotting"],hallucinogen:["hallucinogen"],numbing:["numbing"],sterilizing:["sterilizing"],"succubus-breath":["succubus-skin","succubus-drink"],adhesive:["adhesive"],"black-venom":["black-venom"],chloroform:["chloroform"],"quick-fire":["quick-fire"],fisstech:["fisstech"],pantagran:["pantagran"],perfume:["perfume"],"talgar-tears":["frozen"],"zerrikanian-fire":["burning"]};
export const effectUuid = key => `Compendium.${SYSTEM_ID}.effects.ActiveEffect.${EFFECT_TEMPLATES.find(entry=>entry.key===key).documentId}`;
export function conditionSource(entry, localize = text=>text) {
  const name=localize(entry.name), description=localize(entry.description);
  return {_id:entry.documentId,name,img:entry.img,type:"base",system:{},description:`<p>${description}</p>`,disabled:false,transfer:false,statuses:[entry.id],showIcon:2,
    start:null,duration:{value:null,units:"seconds",expiry:null,expired:false},folder:null,sort:0,
    flags:{[SYSTEM_ID]:{condition:{key:entry.key??entry.id,...structuredClone(entry.rules)}}}};
}
export function effectRules(effect) {
  return effect.flags?.[SYSTEM_ID]?.condition ?? CONDITION_DEFINITIONS.find(entry=>effect.statuses.has(entry.id))?.rules ?? {};
}
export function conditionModifiers(effects = []) {
  return Array.from(effects).filter(effect=>!effect.disabled&&!effect.isSuppressed).flatMap(effect=>(effectRules(effect).modifiers??[]).map(modifier=>({
    ...modifier,source:`effect.${effect.id}`,label:effect.name,category:"effect"
  })));
}
