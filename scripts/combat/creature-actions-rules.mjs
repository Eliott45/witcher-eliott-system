import { SYSTEM_ID } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";

export const CREATURE_ACTIONS = {
  needles: { name:"Иглы трутня", profiles:["endrega-drone"], radius:5, dc:15 },
  web: { name:"Паутина", profiles:["arachas"], min:8, max:10, skill:"athletics", special:true, defenses:["dodge","reposition","block"] },
  charge: { name:"Атака с разбега", profiles:["griffin","golem","fiend","ox","graveir"], min:10, skill:"melee", fullTurn:true },
  pounce: { name:"Наскок", profiles:["ghoul","endrega-worker","endrega-warrior","endrega-drone","arachas","cat"], movement:true },
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
  "fog-illusion": { name:"Сотворение иллюзий", profiles:["foglet"], fog:true, fullTurn:true, hint:"Действие полного хода в тумане" }
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
export const chargeProfile = id => id==="ox"?{damage:"8d6",pushMeters:3,skill:"melee",weapon:"Рога"}:id==="graveir"?{...GRAVEIR_CHARGE,blockSave:{...GRAVEIR_CHARGE.blockSave}}
  :{damage:"10d6",pushMeters:8,skill:id==="golem"?"brawling":"melee",weapon:id==="fiend"?"Рога":id==="golem"?"Кулаки":"Когти"};
export const pounceDistance = (id,statistics) => id==="ghoul"?5:id.startsWith("endrega-")?4:statistics.leap??0;
export const isCreatureSpecial = attack => ["creature:web","creature:whirlwind"].includes(attack?.special);
export const creatureSpecialDefenses = attack => CREATURE_ACTIONS[attack?.special?.replace("creature:","")]?.defenses??null;
export const creatureHypnosisSource = actor => (actor?.effects??[]).find(effect=>activeEffect(effect)&&effect.flags?.[SYSTEM_ID]?.creatureHypnosis)?.flags[SYSTEM_ID].creatureHypnosis??null;
export const creatureHypnosisPenalty = (subject,opponent) => {
  const hypnosis=creatureHypnosisSource(subject);
  return hypnosis&&(hypnosis.sourceActor===opponent?.uuid||hypnosis.sourceToken===opponent?.token?.uuid)?-4:0;
};
