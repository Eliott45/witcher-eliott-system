// Core RU p.92. Canonical ruleId is the existing identity used by recipes and inventory.
// These situational rules are data for future action automation, not passive Actor modifiers.
const modifier = (skill, condition) => ({ target: `skills.${skill}`, value: 2, condition });
const tool = (description, properties, mechanics = {}, concealment = "large", legacyProperties = "") => ({
  description, properties, mechanics, concealment, legacyProperties
});
export const TOOL_RULES = {
  "gear.alchemy-tools": tool("Переносной набор для приготовления алхимических составов. В комплект входят десять сосудов для готовых зелий.", "Изготовление алхимических составов", {
    activities: ["alchemy"], missingToolPenalty: -4, includedVessels: 10
  }),
  "gear.gem-amulet": tool("Магический амулет с самоцветом, который можно использовать вместо посоха для фокусировки магии.", "Фокусирующее (3)", { focus: 3 }, "tiny", "Фокусирующее (3)"),
  "gear.simple-amulet": tool("Небольшой магический амулет для фокусировки магии. Альтернатива заметному посоху.", "Фокусирующее (1)", { focus: 1 }, "tiny", "Фокусирующее (1)"),
  "gear.cooking-tools": tool("Набор кухонных принадлежностей для приготовления пищи в дороге или на стоянке.", "Приготовление пищи", { activities: ["cooking"], missingToolPenalty: -4 }),
  "gear.crafting-tools": tool("Рабочий набор ремесленника для изготовления и модификации оружия и брони. Для создания металлических изделий дополнительно нужна стационарная или походная кузница.", "Изготовление и модификация оружия и брони", {
    activities: ["craftWeapon", "modifyWeapon", "craftArmor", "modifyArmor"], missingToolPenalty: -4,
    requirements: [{ activity: "craftMetalEquipment", capability: "forge" }]
  }),
  "gear.disguise-kit": tool("Принадлежности для изменения внешности и создания маскировки.", "+2 к Маскировке", { modifiers: [modifier("disguise", "usingDisguiseKit")] }, "small", "+2 к Маскировке"),
  "gear.art-tools": tool("Инструменты для создания произведений искусства: картин, украшений, скульптур и других работ.", "Создание произведений искусства", { activities: ["fineArts"], missingToolPenalty: -4 }, "small"),
  "gear.fishing-tools": tool("Рыболовные принадлежности, помогающие добыть пищу у воды.", "+2 к Выживанию при рыбной ловле", { modifiers: [modifier("wildernessSurvival", "fishing")] }, "tiny", "+2 к Выживанию при рыбной ловле"),
  "gear.forgery-tools": tool("Набор для изготовления поддельных монет и документов.", "Подделка монет и документов", { activities: ["forgeCoins", "forgeDocuments"], missingToolPenalty: -4 }, "small"),
  "gear.makeup-kit": tool("Косметические принадлежности для нанесения макияжа и подготовки внешности к общению.", "+2 к Соблазнению и Харизме", { modifiers: [modifier("seduction", "wearingMakeup"), modifier("charisma", "wearingMakeup")] }, "tiny", "+2 к Соблазнению и Харизме"),
  "gear.merchant-tools": tool("Принадлежности торговца для оценки предлагаемых товаров.", "+2 к Торговле при оценке товара", { modifiers: [modifier("business", "appraisingGoods")] }, "small", "+2 к Торговле при оценке товара"),
  "gear.surgical-tools": tool("Набор хирургических инструментов для проведения операций.", "Хирургические операции", { activities: ["surgery"], missingToolPenalty: -4 }, "small"),
  "gear.telecommunicator": tool("Магическое устройство для связи на расстоянии при помощи ритуала «Телекоммуникация». Само владение устройством не заменяет ритуал.", "Связь: ритуал «Телекоммуникация»", { activities: ["telecommunication"], requirements: [{ activity: "telecommunication", ritual: "telecommunication" }] }),
  "gear.thieves-tools": tool("Набор приспособлений для вскрытия замков.", "Вскрытие замков", { activities: ["pickLock"], missingToolPenalty: -4 }, "tiny"),
  "gear.forge": tool("Переносное кузнечное оборудование для работы вдали от обычной кузницы. Обеспечивает кузницу, необходимую для создания металлического оружия и брони; не заменяет набор ремесленника.", "Походная кузница", { capabilities: ["forge"], activities: ["craftMetalEquipment"] }),
  "gear.writing-kit": tool("Письменные принадлежности для писем, записок и других рукописных текстов.", "Написание писем и записок", { activities: ["writing"], missingToolPenalty: -4 }, "small")
};

const CONDITION_LABELS = {
  usingDisguiseKit: "при использовании набора для маскировки", fishing: "только при ловле рыбы",
  wearingMakeup: "при использовании макияжа", appraisingGoods: "только при оценке товара"
};
const SKILL_LABELS = { disguise: "Маскировке", wildernessSurvival: "Выживанию в дикой природе", seduction: "Соблазнению", charisma: "Харизме", business: "Торговле" };
export const TOOL_SOURCE = "Базовая книга, стр. 92";
export const LEGACY_TOOL_SOURCE = "Базовая книга, стр. 92–93";
export const getToolRules = item => TOOL_RULES[item.system?.ruleId]?.mechanics ?? null;

export function toolTraitDescription(item, label) {
  const entry = TOOL_RULES[item.system?.ruleId];
  return entry?.properties===label ? toolContent(item.system.ruleId).description : null;
}

export function toolContent(ruleId) {
  const entry = TOOL_RULES[ruleId];
  if (!entry) return null;
  const mechanics = entry.mechanics;
  const rules = [];
  if (mechanics.activities?.length) rules.push(entry.properties + ".");
  if (mechanics.modifiers) rules.push(...mechanics.modifiers.map(({target,value,condition}) => `+${value} к ${SKILL_LABELS[target.slice(7)]} ${CONDITION_LABELS[condition]}.`));
  if (mechanics.focus) rules.push(`Фокусирующее (${mechanics.focus}): уменьшает затраты Выносливости на заклинание на ${mechanics.focus}. Это не прибавка к пределу магии. Свойство описано на стр. 72.`);
  if (mechanics.missingToolPenalty) rules.push(`Для соответствующей работы без инструментов книга указывает штраф ${mechanics.missingToolPenalty}. Если действие требует оборудования, само наличие штрафа не даёт возможности обойти это требование.`);
  return {
    description: `<p>${entry.description}</p><h3>Применение и правила</h3><ul>${rules.map(rule=>`<li>${rule}</li>`).join("")}</ul><p><small>${TOOL_SOURCE}</small></p>`,
    properties: entry.properties, concealment: entry.concealment, source: TOOL_SOURCE
  };
}
