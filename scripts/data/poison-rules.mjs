import { SYSTEM_ID } from "../config.mjs";

export const isToxicityPoison = effect => Boolean(effect.flags?.[SYSTEM_ID]?.toxicity);
export const TOXICITY_POISON_DESCRIPTION = "<p>В начале своего хода получаете 3 урона, игнорируя броню. Обычное действие: Стойкость СЛ 18. Успех снимает отравление и заканчивает последнюю выпитую дозу. Отравление также снимается, когда токсичность становится ниже допустимого предела. При получении состояния немедленного урона и бесплатной проверки нет.</p>";

/** Apply to old embedded effects too: a poison save is an action, never a free end-turn check. */
export function poisonSaveRules(effect, rules) {
  if (isToxicityPoison(effect)) return {...rules, autoSave:false, manualOnly:true,
    save:{kind:"skill",skill:"endurance",dc:18,action:"Обычное действие",ends:true}};
  return Array.from(effect.statuses ?? []).includes("poisoned") ? {...rules, autoSave:false, manualOnly:true} : rules;
}

export function poisonDescription(effect, text = effect.description ?? "") {
  if (isToxicityPoison(effect)) return TOXICITY_POISON_DESCRIPTION;
  if (!Array.from(effect.statuses ?? []).includes("poisoned")) return text;
  return text.replace("Каждый ход: 3 урона", "В начале своего хода: 3 урона")
    .replace("Яд причиняет 3 урона за ход", "В начале своего хода яд причиняет 3 урона")
    .replace(/ ?Урон учитывается вручную\./, "");
}
