import { SYSTEM_ID } from "../config.mjs";
import { creatureRaging, creatureProfile, creatureHumanForm, creatureSuppressionFlags } from "./creature-modes.mjs";

/** The GM marks sunlight or suppression; ordinary bright lighting need not be sunlight. */
export function creatureRegeneration(actor) {
  const traits = Array.from(actor.items ?? []).filter(item => item.type === "ability")
    .map(item => item.flags?.[SYSTEM_ID] ?? {}).filter(flags => Number.isFinite(flags.regeneration) && flags.regeneration > 0);
  const rage = creatureRaging(actor) ? 3 : 0;
  const base = traits.reduce((sum, flags) => sum + flags.regeneration, rage);
  const sunlight = traits.reduce((sum, flags) => sum + (Number.isFinite(flags.regenerationSunlight) ? flags.regenerationSunlight : flags.regeneration), rage);
  const mode = actor.system.creature?.regenerationMode ?? "normal";
  const options = [{id:"normal",name:`Обычная: ${base} ПЗ`}, {id:"suppressed",name:"Подавлена: 0 ПЗ"}];
  if (sunlight !== base) options.push({id:"sunlight",name:`На солнце: ${sunlight} ПЗ`});
  const suppression = creatureSuppressionFlags(actor), magical = ["werewolf", "katakan", "fiend"].includes(creatureProfile(actor)?.id);
  const suppressed = mode === "suppressed" || creatureHumanForm(actor) || magical && (suppression.moonDust || suppression.manual);
  const total = suppressed ? 0 : mode === "sunlight" ? sunlight : base;
  return { available: base > 0 || creatureProfile(actor)?.id === "ghoul", total, label: suppressed ? "Регенерация подавлена" : rage ? "Ярость гуля" : mode === "sunlight" ? "Регенерация на солнце" : "Регенерация существа",
    options: options.map(option => ({...option,selected:option.id===mode})) };
}
