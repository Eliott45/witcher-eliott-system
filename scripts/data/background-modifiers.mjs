import { getRace, RACES } from "./races.mjs";
import { getOrigin } from "./origins.mjs";
import { getFamilyStatus } from "./family-statuses.mjs";

// Keep skill bonuses on skills: Physique +1 never increases the BODY attribute.
const RACE_RULES = {
  "human.trust": [["skills.charisma", 1, "humanTarget"], ["skills.seduction", 1, "humanTarget"], ["skills.persuasion", 1, "humanTarget"]],
  "human.ingenuity": [["skills.deduction", 1]],
  "elf.artistic-talent": [["skills.fineArts", 1]], "elf.marksman": [["skills.archery", 2]],
  "dwarf.tough": [["naturalArmor", 2]], "dwarf.strong": [["skills.physique", 1], ["carryMax", 25]],
  "dwarf.shrewd": [["skills.business", 1]], "witcher.enhanced-senses": [["skills.awareness", 1]],
  "witcher.dulled-emotions": [["attributes.empathy", -4]],
  "witcher.lightning-reflexes": [["attributes.reflex", 1], ["attributes.dexterity", 1]]
};
const FAMILY_RULES = {
  "north.aristocracy": ["reputation", 2], "north.mage-ward": ["skills.education", 1],
  "north.knighthood": ["reputation", 1], "north.peasants": ["attributes.luck", 1],
  "nilfgaard.aristocracy": ["reputation", 2], "nilfgaard.high-clergy": ["skills.courage", 1],
  "nilfgaard.knighthood": ["reputation", 1], "nilfgaard.peasants": ["attributes.luck", 1],
  "elder.aristocracy": ["reputation", 2], "elder.noble-warrior": ["reputation", 1],
  "elder.scribes": ["skills.education", 1], "elder.low-born": ["attributes.luck", 1]
};
const ORIGIN_SKILLS = {
  redania: "education", kaedwen: "endurance", temeria: "charisma", aedirn: "crafting",
  "lyria-rivia": "resistCoercion", "kovir-poviss": "business", skellige: "courage",
  cidaris: "sailing", verden: "wildernessSurvival", cintra: "humanPerception",
  "nilfgaard-heartland": "deceit", vicovaro: "education", angren: "wildernessSurvival",
  nazair: "brawling", metinna: "riding", "mag-turga": "endurance", geso: "stealth",
  ebbing: "deduction", maecht: "charisma", gemmera: "intimidation", etolia: "courage",
  "dol-blathanna": "socialEtiquette", mahakam: "crafting"
};

export function backgroundModifiers(details = {}, additionalAbilities = []) {
  const modifiers = [];
  const add = (source, [target, value, condition]) => modifiers.push({
    source: source.id, label: source.label, target, value, category: source.group ? "lifepath" : "race", ...(condition ? { condition } : {})
  });
  const abilityIds = new Set([...(getRace(details.race)?.abilities ?? []).map(ability => ability.id), ...additionalAbilities]);
  for (const ability of RACES.flatMap(race => race.abilities).filter(ability => abilityIds.has(ability.id))) {
    for (const rule of RACE_RULES[ability.id] ?? []) add(ability, rule);
  }
  if (details.race !== "witcher") {
    const family = getFamilyStatus(details.familyStatus);
    if (family && FAMILY_RULES[family.id]) add(family, FAMILY_RULES[family.id]);
    const origin = getOrigin(details.origin);
    if (origin) add(origin, [`skills.${ORIGIN_SKILLS[origin.id]}`, 1]);
  }
  return modifiers;
}

/** Lifepath ranks share the ordinary cap; racial perks can exceed it (core errata p. 32). */
export function cappedSkillModifiers(level, modifiers, cap = 10) {
  let room = Math.max(0, cap - level);
  return modifiers.map(modifier => {
    if (modifier.category !== "lifepath" || modifier.value <= 0) return modifier;
    const value = Math.min(room, modifier.value);
    room -= value;
    return { ...modifier, value };
  });
}

export function modifierTotal(modifiers, target, conditions = []) {
  return modifiers.filter(modifier => modifier.target === target
    && (!modifier.condition || conditions.includes(modifier.condition)))
    .reduce((total, modifier) => total + modifier.value, 0);
}
