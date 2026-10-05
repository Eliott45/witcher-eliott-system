import { SYSTEM_ID } from "../config.mjs";
import { durationSeconds } from "../data/effect-duration.mjs";
export const POWER_ELEMENTS={earth:{name:"Земля",icon:"fa-solid fa-mountain",habitat:"Разломы, глубокие природные ямы и пещеры."},air:{name:"Воздух",icon:"fa-solid fa-wind",habitat:"Вершины гор и места частых торнадо."},fire:{name:"Огонь",icon:"fa-solid fa-fire",habitat:"Вулканы и самое жаркое сердце пустыни."},water:{name:"Вода",icon:"fa-solid fa-droplet",habitat:"Слияния рек и озёр, морские пещеры."}};
export const POWER_MONTH=30*86400;
export function powerVisit(actor,place,now=game.time.worldTime) {
  const previous=actor.system.magic.powerVisits?.find(visit=>visit.placeUuid===place.uuid);
  // TODO(core p.122): the calendar length of a month is not specified. Use 30
  // game days; a GM may reset a character's visit for a different campaign calendar.
  const current=previous&&now-previous.lastDraw<POWER_MONTH?previous:{draws:0,saves:0,lastDraw:now};
  return {...current,placeUuid:place.uuid,dc:current.draws?20+4*current.saves:0};
}
export function activePowerBenefits(actor,now=game.time?.worldTime??0) {
  return Array.from(actor.effects??[]).filter(effect=>{
    const data=effect.flags?.[SYSTEM_ID]?.powerPlace;
    if(!data||effect.disabled||effect.isSuppressed||effect.duration?.expired)return false;
    // Native duration is authoritative after editing; old flag-only effects still work.
    if(effect.duration?.value==null&&effect.flags[SYSTEM_ID].conditionDurationOverride)return true;
    if(Number.isFinite(effect.duration?.value)&&Number.isFinite(effect.start?.time))return effect.start.time+durationSeconds(effect.duration.value,effect.duration.units)>now;
    return data.expiresAt>now;
  });
}
/** Conditional bonuses never raise the character's general Vigor or other elements. */
export function powerBonus(actor,system) {
  const effect=activePowerBenefits(actor).find(effect=>effect.flags[SYSTEM_ID].powerPlace.element===system.element);
  return effect?{vigor:5,casting:["spell","sign"].includes(system.kind??"spell")?2:0,label:effect.name}:{vigor:0,casting:0,label:""};
}
export function powerBenefitSource(place,now) {
  const element=place.system.element;
  return {_id:foundry.utils.randomID(),name:`Место силы: ${POWER_ELEMENTS[element].name}`,type:"base",system:{},img:`systems/${SYSTEM_ID}/assets/icons/power-place.svg`,
    origin:place.uuid,disabled:false,transfer:false,statuses:[],showIcon:2,
    description:`<p>На 1 час: +5 к пределу магии и +2 к Сотворению заклинаний только для стихии «${POWER_ELEMENTS[element].name}». Повторные бонусы одной стихии не складываются.</p>`,
    start:foundry.documents.ActiveEffect.getEffectStart(),duration:{value:3600,units:"seconds",expiry:null,expired:false},
    flags:{[SYSTEM_ID]:{powerPlace:{element}}}};
}
