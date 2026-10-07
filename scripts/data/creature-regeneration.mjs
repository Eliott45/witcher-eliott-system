import { SYSTEM_ID } from "../config.mjs";

/** The GM marks sunlight or suppression; ordinary bright lighting need not be sunlight. */
export function creatureRegeneration(actor) {
  const traits = Array.from(actor.items ?? []).filter(item => item.type === "ability")
    .map(item => item.flags?.[SYSTEM_ID] ?? {}).filter(flags => Number.isFinite(flags.regeneration) && flags.regeneration > 0);
  const base = traits.reduce((sum, flags) => sum + flags.regeneration, 0);
  const sunlight = traits.reduce((sum, flags) => sum + (Number.isFinite(flags.regenerationSunlight) ? flags.regenerationSunlight : flags.regeneration), 0);
  const mode = actor.system.creature?.regenerationMode ?? "normal";
  const options = [{id:"normal",name:`Обычная: ${base} ПЗ`}, {id:"suppressed",name:"Подавлена: 0 ПЗ"}];
  if (sunlight !== base) options.push({id:"sunlight",name:`На солнце: ${sunlight} ПЗ`});
  const total = mode === "suppressed" ? 0 : mode === "sunlight" ? sunlight : base;
  return { available: base > 0, total, label: mode === "suppressed" ? "Регенерация подавлена" : mode === "sunlight" ? "Регенерация на солнце" : "Регенерация существа",
    options: options.map(option => ({...option,selected:option.id===mode})) };
}
