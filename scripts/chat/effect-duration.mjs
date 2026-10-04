import { SYSTEM_ID } from "../config.mjs";
import { EFFECT_TEMPLATES } from "../data/condition-definitions.mjs";
import { formatEffectDuration } from "../data/effect-duration.mjs";
export function durationRollData(message) {
  const flags=message.flags?.[SYSTEM_ID];
  if(flags?.effectDuration)return flags.effectDuration;
  // Recognize only our older duration rolls, so existing messages also become readable.
  if(!flags?.skipLuck||!String(message.flavor??"").startsWith("Длительность:")||message.rolls?.length!==1)return null;
  const roll=message.rolls[0],normalize=text=>String(text??"").replace(/\s+/g,"");
  const units=new Set(EFFECT_TEMPLATES.flatMap(entry=>["rounds","seconds"].filter(unit=>entry.rules[`${unit}Formula`]&&normalize(entry.rules[`${unit}Formula`])===normalize(roll.formula))));
  return units.size===1?{value:roll.total,units:[...units][0]}:null;
}
export function renderEffectDuration(message,html) {
  if(!message.isContentVisible)return;
  const data=durationRollData(message);if(!data)return;
  const total=html.querySelector(".dice-total");if(!total)return;
  total.textContent=formatEffectDuration(data.value,data.units,globalThis.CONFIG?.time?.roundTime??3);
  total.title=`${data.value} ${data.units==="rounds"?"раундов":"секунд"}`;
  total.classList.add("witcher-duration-total");
}
export const registerEffectDurationChat=()=>Hooks.on("renderChatMessageHTML",renderEffectDuration);
