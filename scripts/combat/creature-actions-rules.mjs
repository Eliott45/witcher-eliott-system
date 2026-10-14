import { SYSTEM_ID } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";

export const CREATURE_ACTIONS = {
  needles: { name:"Иглы трутня", profiles:["endrega-drone"], radius:5, dc:15 },
  web: { name:"Паутина", profiles:["arachas"], min:8, max:10, skill:"athletics", special:true, defenses:["dodge","reposition","block"] },
  charge: { name:"Атака с разбега", profiles:["griffin","golem","fiend","ox","graveir","boar","war-boar"], min:10, skill:"melee", fullTurn:true },
  pounce: { name:"Наскок", profiles:["ghoul","endrega-worker","endrega-warrior","endrega-drone","arachas","cat","panther","big-cat"], movement:true },
  scream: { name:"Вопль", profiles:["siren","griffin"], radius:10, fullTurn:true },
  hypnosis: { name:"Гипноз", profiles:["fiend"], skill:"spellCasting", fullTurn:true },
  "sensitive-hearing": { name:"Громкий звук", profiles:["fiend"], reaction:true },
  dance: { name:"Полуденный танец", profiles:["noonwraith"] },
  whirlwind: { name:"Пылевой вихрь", profiles:["noonwraith"], max:5, skill:"spellCasting", special:true, defenses:["dodge","reposition"] },
  teleport: { name:"Телепортация", profiles:["wraith"], movement:true, max:10 },
  rock: { name:"Метательный камень", profiles:["rock-troll"], min:6, max:16, skill:"athletics" },
  // Monster Hunter's Journal p.19, foglet.
  fog: { name:"Призыв тумана", profiles:["foglet"], fog:true, hint:"Действие: туман радиусом 30 м на сутки" },
  "fog-move": { name:"Сдвинуть туман", profiles:["foglet"], fog:true, hint:"Действие: центр тумана до 10 м" },
  "fog-clear": { name:"Рассеять свой туман", profiles:["foglet"], fog:true, hint:"Действие" },
  "fog-invisible": { name:"Невидимость", profiles:["foglet"], fog:true, hint:"Действие в тумане: +10 к Скрытности, +5 к атаке" },
  "fog-copies": { name:"Иллюзорные копии", profiles:["foglet"], fog:true, hint:"Действие в тумане: четыре копии" },
  "fog-illusion": { name:"Сотворение иллюзий", profiles:["foglet"], fog:true, fullTurn:true, hint:"Действие полного хода в тумане" },
  // Monster Hunter's Journal pp.29–31, hym, pesta and her rats.
  "shadow-step": { name:"Шаг сквозь тень", profiles:["hym"], movement:true, max:10, hint:"Перемещение: из тени в тень до 10 м" },
  "hym-whisper": { name:"Нашёптывание", profiles:["hym"], hym:true, hint:"Действие: жертва (T) до 10 м, Убеждение против Сопротивления убеждению" },
  "hym-hallucination": { name:"Галлюцинации", profiles:["hym"], hym:true, hint:"Действие: жертва (T) до 10 м, Сотворение заклинаний против Сопротивления убеждению" },
  "hym-nightmare": { name:"Кошмары", profiles:["hym"], hym:true, fullTurn:true, hint:"Полный ход: спящая жертва (T) до 10 м" },
  "pesta-flies": { name:"Призвать мух", profiles:["pesta"], pesta:true, hint:"Действие: вернуть рассеянное облако мух" },
  "pesta-rats": { name:"Призвать чумных крыс", profiles:["pesta"], pesta:true, hint:"Действие: две стаи рядом с пестой" },
  swarm: { name:"Атака стаи", profiles:["plague-rats"], max:1, skill:"melee", special:true, defenses:["dodge","reposition"] },
  // Monster Hunter's Journal pp.37–51: beasts and cursed ones.
  maul: { name:"Удар сверху", profiles:["bear","giant-bear"], max:1, skill:"melee", modifier:-3, fullTurn:true, special:true, defenses:["dodge","reposition","block"] },
  burrow: { name:"Зарывание", profiles:["archespore","green-archespore","purple-archespore"], movement:true, max:6, throughWalls:true, hint:"Перемещение под землёй до 6 м" },
  "burrow-far": { name:"Зарывание полным ходом", profiles:["archespore","green-archespore","purple-archespore"], movement:true, max:18, throughWalls:true, fullTurn:true, hint:"Полный ход: под землёй до 18 м" },
  pod: { name:"Взрыв стручка", profiles:["archespore","green-archespore","purple-archespore"], beast:true, fullTurn:true, hint:"Полный ход: зарыться до 18 м и оставить стручок" },
  "botchling-form": { name:"Боевая форма", profiles:["botchling"], beast:true, fullTurn:true, hint:"Полный ход: +2 РЕА, ЛВК, СКОР, +3 ТЕЛ, когти" },
  "botchling-spikes": { name:"Шипы", profiles:["botchling"], beast:true, hint:"Действие в боевой форме" },
  "botchling-drain": { name:"Вытягивание сил", profiles:["botchling"], beast:true, hint:"Ночью: спящая цель (T) в пределах 2 м" },
  storm: { name:"Снежная буря", profiles:["wendigo"], fog:true, hint:"Действие: буря радиусом 50 м на сутки" },
  "storm-move": { name:"Сдвинуть бурю", profiles:["wendigo"], fog:true, hint:"Действие: центр бури до 20 м" },
  "storm-clear": { name:"Развеять бурю", profiles:["wendigo"], fog:true, hint:"Действие" },
  "wendigo-spoil": { name:"Порча еды", profiles:["wendigo"], wendigo:true, hint:"Действие: до 1 м² еды в пределах 10 м" },
  "wendigo-curse": { name:"Проклятие вендиго", profiles:["wendigo"], wendigo:true, hint:"Действие: цель (T), Наведение порчи против Сопротивления магии" }
};

export const needleDice = defense => Math.max(0,15-Math.floor(defense));
export function validateCreatureRange(profile,distance) {
  if(!Number.isFinite(distance))throw new Error("Нужно определить расстояние между токенами.");
  if(profile.min!==undefined&&distance<=profile.min)throw new Error(`Цель должна быть дальше ${profile.min} м.`);
  if(profile.max!==undefined&&distance>profile.max)throw new Error(`Цель должна быть не дальше ${profile.max} м.`);
  return distance;
}
// Monster Hunter's Journal p.17: the graveir charges 5–10 m at base 12 (horns −2), hits the torso, and a blocked
// charge still throws a target that fails Physique DC 25; a miss carries it on to the full 10 m.
const GRAVEIR_CHARGE={damage:"7d6",pushMeters:5,skill:"brawling",weapon:"Удар рогами",modifier:-2,min:5,max:10,location:"torso",collision:"half",blockSave:{skill:"physique",dc:25},overrun:true};
// Monster Hunter's Journal p.39: the boar charges 6–15 m at base 9 (war boar 15) for 5d6 and may run on in any direction.
const BOAR_CHARGE={damage:"5d6",pushMeters:0,skill:"melee",weapon:"Удар клыками",modifier:-2,min:6,max:15,redirect:true};
export const chargeProfile = id => id==="boar"?{...BOAR_CHARGE}:id==="war-boar"?{...BOAR_CHARGE,modifier:0}:id==="ox"?{damage:"8d6",pushMeters:3,skill:"melee",weapon:"Рога"}:id==="graveir"?{...GRAVEIR_CHARGE,blockSave:{...GRAVEIR_CHARGE.blockSave}}
  :{damage:"10d6",pushMeters:8,skill:id==="golem"?"brawling":"melee",weapon:id==="fiend"?"Рога":id==="golem"?"Кулаки":"Когти"};
export const pounceDistance = (id,statistics) => id==="ghoul"?5:id.startsWith("endrega-")?4:statistics.leap??0;
export const isCreatureSpecial = attack => ["creature:web","creature:whirlwind","creature:swarm","creature:maul"].includes(attack?.special);
export const creatureSpecialDefenses = attack => CREATURE_ACTIONS[attack?.special?.replace("creature:","")]?.defenses??null;
export const creatureHypnosisSource = actor => (actor?.effects??[]).find(effect=>activeEffect(effect)&&effect.flags?.[SYSTEM_ID]?.creatureHypnosis)?.flags[SYSTEM_ID].creatureHypnosis??null;
export const creatureHypnosisPenalty = (subject,opponent) => {
  const hypnosis=creatureHypnosisSource(subject);
  return hypnosis&&(hypnosis.sourceActor===opponent?.uuid||hypnosis.sourceToken===opponent?.token?.uuid)?-4:0;
};
