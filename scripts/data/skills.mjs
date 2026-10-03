import { cappedSkillModifiers } from "./background-modifiers.mjs";
// Stable IDs match background-modifiers.mjs; language is a template for named entries.
const groups = {
  intelligence: ["awareness", "wildernessSurvival", "deduction", "monsterLore", "education", "streetwise", "teaching", "tactics", "business", "socialEtiquette", "language"],
  reflex: ["melee", "brawling", "riding", "staffSpear", "smallBlades", "swordsmanship", "sailing", "dodgeEscape"],
  dexterity: ["athletics", "sleightOfHand", "stealth", "crossbow", "archery"],
  body: ["physique", "endurance"],
  empathy: ["gambling", "groomingStyle", "performance", "fineArts", "leadership", "deceit", "humanPerception", "seduction", "persuasion", "charisma"],
  craft: ["alchemy", "pickLock", "trapCrafting", "crafting", "disguise", "firstAid", "forgery"],
  will: ["intimidation", "hexWeaving", "ritualCrafting", "resistMagic", "resistCoercion", "spellCasting", "courage"]
};
const complex = new Set(["monsterLore", "tactics", "language", "alchemy", "trapCrafting", "crafting", "hexWeaving", "ritualCrafting", "resistMagic", "spellCasting"]);
export const SKILL_GROUPS = Object.keys(groups);
export const SKILLS = Object.entries(groups).flatMap(([attribute, keys]) => keys.map(key => ({
  key, attribute, complex: complex.has(key), label: `WITCHER.Skills.Entries.${key}.Label`
})));
export const SKILL_KEYS = SKILLS.filter(skill => skill.key !== "language").map(skill => skill.key);

export function skillValue(system, key, languageId = "") {
  const skill = SKILLS.find(entry => entry.key === key);
  if (!skill) return null;
  const language = key === "language" ? system.languages.find(entry => entry.id === languageId) : null;
  if (key === "language" && !language) return null;
  const level = language ? language.level : system.skills[key];
  const statistics = system.statistics;
  const attribute = statistics.effective[skill.attribute];
  const modifiers = cappedSkillModifiers(level, statistics.modifiers.filter(modifier => modifier.target === `skills.${key}`
    && (!modifier.condition || (modifier.condition === "humanTarget" && system.abilityState.trustEnabled))));
  const bonus = modifiers.reduce((sum, modifier) => sum + modifier.value, 0);
  return { ...skill, language, level, attributeValue: attribute, bonus, modifiers,
    total: attribute === null ? null : attribute + level + bonus };
}
