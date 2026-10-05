import { ALCHEMY, MUTAGENS } from "../data/workshop-alchemy.mjs";
import { SYSTEM_ID } from "../config.mjs";

const sources = new Map([...ALCHEMY, ...MUTAGENS].map(entry => [entry.id, entry]));
const oldPotionIntro = "Ведьмачий эликсир. Длительность и токсичность указаны в параметрах состава.";
const oldEffectHelp = "<p>Перетащите эффект на персонажа после попадания и необходимых первоначальных проверок. Применения и порции расходуются отдельно.</p>";
const oldOilDuration = "Действует на конкретном оружии 30 минут.";

/** Only shipped placeholders are replaced. Player notes, numeric fields and prices survive. */
export function alchemyDescriptionUpdate(item) {
  const id = item.system?.ruleId ?? "", formula = id.startsWith("formula.");
  const source = sources.get(formula ? id.slice(8) : id);
  if (!source) return {};
  const update = {}, original = String(item.system.description ?? ""), plain = original.replace(/<[^>]*>/g, "").trim();
  const sourceLabel = source.system.source, legacyLabel = `${sourceLabel}; цена не указана`;
  const unpriced = formula ? source.formula?.price === undefined : source.flags?.[SYSTEM_ID]?.priceUnavailable;
  if (unpriced && item.flags?.[SYSTEM_ID]?.priceUnavailable === undefined) update[`flags.${SYSTEM_ID}.priceUnavailable`] = true;
  if (item.system.source === legacyLabel) update["system.source"] = sourceLabel;
  let description = original;
  if (!plain || [sourceLabel, legacyLabel].includes(plain)) {
    description = formula ? `<p>${sourceLabel}</p>` : source.system.description;
  } else if (!formula) {
    description = description.replaceAll(oldPotionIntro, "Ведьмачий эликсир.").replaceAll(oldEffectHelp, "");
    for (const label of [sourceLabel, legacyLabel]) description = description.replaceAll(`<p><small>${label}</small></p>`, "");
  }
  if (id.startsWith("oil.")) {
    description = description.replaceAll(oldOilDuration, "Наносится на конкретное оружие.");
    const properties = item.system.properties ?? "";
    if (properties.includes(oldOilDuration)) update["system.properties"] = properties.replaceAll(oldOilDuration, "Наносится на конкретное оружие.");
  }
  if (description !== original) update["system.description"] = description;
  return update;
}
