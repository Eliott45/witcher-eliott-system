import { ROUND_SECONDS, SYSTEM_ID } from "../config.mjs";
const secondsPerUnit={seconds:1,minutes:60,hours:3600,days:86400};
export const durationSeconds=(value,units="seconds",roundTime=ROUND_SECONDS)=>value==null?null:value*(units==="rounds"?roundTime:secondsPerUnit[units]??1);
const number=value=>new Intl.NumberFormat("ru",{maximumFractionDigits:2}).format(value);
const roundWord=value=>Number.isInteger(value)&&value%100!==11&&value%10===1?"раунд":Number.isInteger(value)&&![12,13,14].includes(value%100)&&[2,3,4].includes(value%10)?"раунда":"раундов";
/** Formatting only: Foundry's expiry values and native Roll totals are not altered. */
export function formatEffectDuration(value,units="seconds",roundTime=ROUND_SECONDS) {
  if(value===Infinity||value==null)return "Без ограничения";
  if(!Number.isFinite(value))return "—";
  const seconds=durationSeconds(Math.max(0,value),units,roundTime);
  if(seconds<=60){const rounds=seconds/roundTime;return `${number(rounds)} ${roundWord(rounds)}`;}
  if(seconds<3600)return `${number(seconds/60)} мин.`;
  if(seconds<86400)return `${number(seconds/3600)} ч.`;
  return `${number(seconds/86400)} дн.`;
}
export function effectDurationLabel(effect,roundTime=ROUND_SECONDS) {
  const duration=effect.duration??{};
  if(duration.expired)return "Истёк";
  if(Number.isFinite(duration.secondsRemaining))return formatEffectDuration(duration.secondsRemaining,"seconds",roundTime);
  if(["turns","months","years"].includes(duration.units))return duration.label??"";
  if(Number.isFinite(duration.remaining))return formatEffectDuration(duration.remaining,duration.units,roundTime);
  return formatEffectDuration(duration.value,duration.units,roundTime);
}

export const EFFECT_TIME_UNITS = {rounds:"Раунды",seconds:"Секунды",minutes:"Минуты",hours:"Часы",days:"Дни",unlimited:"Без ограничения"};
/** Edit remaining time, not the original elapsed duration. */
export function durationEditValues(effect) {
  const duration=effect.duration??{};
  if(duration.value==null)return {value:1,units:"unlimited"};
  const seconds=duration.secondsRemaining;
  if(Number.isFinite(seconds)) {
    const units=seconds<=60?(Number.isInteger(seconds/ROUND_SECONDS)?"rounds":"seconds"):seconds<3600?"minutes":seconds<86400?"hours":"days";
    return {value:Math.max(0,Number((seconds/(units==="rounds"?ROUND_SECONDS:secondsPerUnit[units])).toFixed(6))),units};
  }
  return {value:Math.max(0,Number.isFinite(duration.remaining)?duration.remaining:duration.value),units:duration.units in EFFECT_TIME_UNITS?duration.units:"seconds"};
}
export function effectDurationUpdate(value,units,start) {
  if(!(units in EFFECT_TIME_UNITS))throw new Error("Выберите единицу времени.");
  const unlimited=units==="unlimited";
  if(!unlimited&&(!Number.isFinite(value)||value<0||(units==="rounds"&&!Number.isInteger(value))))throw new Error("Укажите неотрицательное время; количество раундов должно быть целым.");
  return {start, duration:{value:unlimited?null:units==="rounds"?value:value*secondsPerUnit[units],units:units==="rounds"?"rounds":"seconds",expiry:!unlimited&&units==="rounds"?"turnEnd":null,expired:false},
    [`flags.${SYSTEM_ID}.conditionDurationOverride`]:true};
}
