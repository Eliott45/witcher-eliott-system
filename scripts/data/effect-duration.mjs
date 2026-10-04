const secondsPerUnit={seconds:1,minutes:60,hours:3600,days:86400};
const number=value=>new Intl.NumberFormat("ru",{maximumFractionDigits:2}).format(value);
const roundWord=value=>Number.isInteger(value)&&value%100!==11&&value%10===1?"раунд":Number.isInteger(value)&&![12,13,14].includes(value%100)&&[2,3,4].includes(value%10)?"раунда":"раундов";
/** Formatting only: Foundry's expiry values and native Roll totals are not altered. */
export function formatEffectDuration(value,units="seconds",roundTime=3) {
  if(value===Infinity||value==null)return "Без ограничения";
  if(!Number.isFinite(value))return "—";
  const seconds=Math.max(0,value)*(units==="rounds"?roundTime:secondsPerUnit[units]??1);
  if(seconds<=10*roundTime){const rounds=seconds/roundTime;return `${number(rounds)} ${roundWord(rounds)}`;}
  if(seconds<3600)return `${number(seconds/60)} мин.`;
  if(seconds<86400)return `${number(seconds/3600)} ч.`;
  return `${number(seconds/86400)} дн.`;
}
export function effectDurationLabel(effect,roundTime=3) {
  const duration=effect.duration??{};
  if(duration.expired)return "Истёк";
  if(Number.isFinite(duration.secondsRemaining))return formatEffectDuration(duration.secondsRemaining,"seconds",roundTime);
  if(["turns","months","years"].includes(duration.units))return duration.label??"";
  if(Number.isFinite(duration.remaining))return formatEffectDuration(duration.remaining,duration.units,roundTime);
  return formatEffectDuration(duration.value,duration.units,roundTime);
}
