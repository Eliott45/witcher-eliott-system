import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID, ROUND_SECONDS } from "../config.mjs";
import { effectRules, EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { skillValue } from "../data/skills.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { rollStun } from "./stun-roll.mjs";
import { rollDeath } from "./death-state.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { endToxicityPoison } from "../workshop/consumption.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { stewRank } from "../data/peasant-rules.mjs";

const queues=new Map();
const pendingRequests=new Set();
export function conditionWrite(actor, work) {
  const job=(queues.get(actor.uuid)??Promise.resolve()).catch(()=>{}).then(work);
  queues.set(actor.uuid,job);
  const clean=()=>{if(queues.get(actor.uuid)===job)queues.delete(actor.uuid);};
  job.then(clean,clean);return job;
}
const state = effect => effect.flags?.[SYSTEM_ID]?.conditionState??{};
const present = (actor,effect) => actor.effects.some(entry=>entry.id===effect.id&&!entry.disabled&&!entry.isSuppressed&&!entry.duration?.expired);
export const conditionTurn = (combat,combatant,round=combat?.round) => combat?.started&&combatant ? `${combat.uuid}:${round}:${combatant.id}` : "";
export function currentConditionTurn(actor) {
  const combat=game.combat, combatant=combat?.combatants.find(entry=>entry.actor?.uuid===actor.uuid);
  return conditionTurn(combat,combatant);
}
function authority(actor) {
  return game.users.activeGM??game.users.find(user=>user.active&&actor.testUserPermission(user,"OWNER"));
}
export function canSaveEffect(actor,effect) {
  const rules=effectRules(effect), conditions=conditionRules(actor);
  if(!present(actor,effect)||!rules.save||conditions.dead)return false;
  if(rules.manualOnly) {
    const combat=game.combat;
    if(combat?.started&&combat.combatants.some(entry=>entry.actor?.uuid===actor.uuid)) {
      const turn=currentConditionTurn(actor);
      if(combat.combatant?.actor?.uuid!==actor.uuid||state(effect).lastSaveTurn===turn||actor.flags?.[SYSTEM_ID]?.conditionActionTurn===turn)return false;
    }
  }
  if(rules.delayTurns&&(state(effect).elapsedTurns??0)<rules.delayTurns
    && (game.time?.worldTime??0)-(effect.start?.time??0)<rules.delayTurns*ROUND_SECONDS)return false;
  if(rules.save.kind==="death")return actor.type==="character";
  if(rules.save.kind==="stun")return conditions.canStunSave;
  if(rules.save.kind==="stunModified")return true;
  if(effect.statuses.has("fisstech"))return !actor.effects.some(entry=>entry.statuses.has("fisstech-unconscious")&&!entry.disabled&&!entry.isSuppressed);
  return conditions.canAct;
}

/** Native document updates enforce actor ownership; one elected client resolves all requests. */
export async function requestEffectSave(actor,effect,{action=false}={}) {
  if(!actor.isOwner||!present(actor,effect))return;
  if(!action&&effectRules(effect).save?.kind==="death")return rollDeath(actor);
  if(pendingRequests.has(effect.uuid)||effect.flags?.[SYSTEM_ID]?.conditionRequest)return;
  if(!authority(actor))throw new Error("Нет активного владельца для обработки эффекта.");
  pendingRequests.add(effect.uuid);
  try{return await effect.update({[`flags.${SYSTEM_ID}.conditionRequest`]:{id:foundry.utils.randomID(),action,
    turn:currentConditionTurn(actor),requesterId:game.user.id,messageMode:game.settings.get("core","messageMode")}});
  }finally{pendingRequests.delete(effect.uuid);}
}

/** Called only inside the elected client's queue. Persist the turn before rolling to deduplicate manual/end-turn saves. */
export async function performEffectSave(actor,effect,{turn="",automatic=false,messageMode,requesterId,action=false}={}) {
  if(!actor.isOwner||!present(actor,effect))return;
  const rules=effectRules(effect);
  if(automatic&&rules.manualOnly)return;
  if(action&&rules.action){
    if(conditionRules(actor).canAct){
      // Standing spends movement, leaving the ordinary action available for a condition save.
      if(turn&&!effect.statuses.has("prone"))await actor.update({[`flags.${SYSTEM_ID}.conditionActionTurn`]:turn});
      await effect.delete();
    }
    return;
  }
  if(!canSaveEffect(actor,effect)||(turn&&state(effect).lastSaveTurn===turn))return;
  if(automatic&&turn&&actor.flags?.[SYSTEM_ID]?.conditionActionTurn===turn)return;
  const save=rules.save;
  // Death uses the existing round/damage workflow; it must never get an extra end-turn roll.
  if(save.kind==="death")return automatic?undefined:rollDeath(actor);
  const requester=game.users.find(user=>user.id===requesterId&&actor.testUserPermission(user,"OWNER"))??game.user;
  const requestedMode=["public","gm","blind","self"].includes(messageMode)?messageMode:game.settings.get("core","messageMode");
  // Core's self mode always addresses the executing client. A GM resolving an owner's
  // request instead uses an explicit whisper recipient, preserved by the gm mode.
  const mode=requestedMode==="self"&&requester!==game.user?"gm":requestedMode;
  const messageData={author:requester.id,...(requestedMode==="self"?{whisper:[requester.id]}:{})};
  await effect.update({[`flags.${SYSTEM_ID}.conditionState.lastSaveTurn`]:turn});
  if(turn)await actor.update({[`flags.${SYSTEM_ID}.conditionActionTurn`]:turn});
  let completed=false;
  try{
    if(save.kind==="stun"){
      const message=await rollStun(actor,{messageMode:mode,messageData});completed=Boolean(message);return message;
    }
    const skill=save.kind==="skill"?skillValue(actor.system,save.skill):null;
    const mealBonus=effect.statuses.has("poisoned")?Math.floor(stewRank(actor,"troll")/2):0;
    const base=skill?.total==null?null:skill.total+mealBonus;
    const threshold=save.kind==="stunModified"?actor.system.statistics.stun:null;
    if((save.kind==="skill"&&base==null)||(save.kind==="stunModified"&&threshold==null))throw new Error("Заполните параметры персонажа для этой проверки.");
    const target=save.kind==="stunModified"?Math.max(0,threshold+(save.modifier??0)):save.dc;
    const formula=save.kind==="stunModified"?"1d10":`1d10wc + ${base}`;
    const tooltip=save.kind==="stunModified"?`УСТ ${threshold} ${save.modifier??0}. Нужно выбросить строго меньше ${target}.`:`${game.i18n.localize(skill.label)}: параметр ${skill.attributeValue} + навык ${skill.level} + бонусы ${skill.bonus}${mealBonus?` + Рагу из тролля ${mealBonus}`:""}. СЛ ${target}.`;
    const display=trackRollDisplay();
    try{
      const roll=await evaluateRoll(formula,{allowInteractive:mode!=="blind"});
      const flavor=`<b>${esc(effect.name)}</b><p>${esc(save.action??"")} · ${save.kind==="stunModified"?"УСТ <":"СЛ"} <strong data-tooltip="${esc(tooltip)}">${target}</strong></p>`;
      const message=await roll.toMessage({...messageData,speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],skipLuck:automatic||save.kind==="stunModified",conditionSave:{effect:effect.uuid,automatic,target}}}},{messageMode:mode});
      if(!message)return;
      await display.wait(message);
      const total=message.rolls[0].total,success=save.kind==="stunModified"?total<target:total>=target;
      await message.update({flavor:`${flavor}<p><strong>${success?"Успех":"Неудача"}: ${total}</strong>${success&&!save.ends?" — одна иллюзия распознана; эффект остаётся.":""}</p>`});
      completed=true;
      if(!present(actor,effect))return message;
      if(success&&save.ends&&!await endToxicityPoison(actor,effect))await effect.delete();
      else if(effect.statuses.has("fisstech")&&total<10){
        const source=conditionSource(EFFECT_TEMPLATES.find(entry=>entry.key==="fisstech-unconscious"));
        delete source._id;
        await actor.createEmbeddedDocuments("ActiveEffect",[source]);
      }
      return message;
    }finally{display.close();}
  }finally{
    if(!completed&&present(actor,effect))await effect.update({[`flags.${SYSTEM_ID}.conditionState.lastSaveTurn`]:""});
    if(!completed&&turn&&actor.flags?.[SYSTEM_ID]?.conditionActionTurn===turn)await actor.update({[`flags.${SYSTEM_ID}.conditionActionTurn`]:""});
  }
}

export async function endTurnConditions(combat,combatant,context) {
  const actor=combatant?.actor;
  if(!actor||!actor.isOwner||context.skipped||context.round<1)return;
  // Native Foundry also calls _onEndTurn when initiative is reordered in place.
  if(combat.round===context.round&&combat.turn===context.turn)return;
  return conditionWrite(actor,async()=>{
    const turn=conditionTurn(combat,combatant,context.round);
    for(const effect of [...actor.effects]){
      if(!present(actor,effect)||state(effect).lastEndTurn===turn)continue;
      const rules=effectRules(effect);
      await effect.update({[`flags.${SYSTEM_ID}.conditionState.lastEndTurn`]:turn,
        [`flags.${SYSTEM_ID}.conditionState.elapsedTurns`]:(state(effect).elapsedTurns??0)+1});
      if(rules.autoSave&&rules.save&&rules.save.kind!=="death")await performEffectSave(actor,effect,{turn,automatic:true});
    }
  });
}
export function registerConditionSaves() {
  const dispatch=(effect,changes)=>{
    const actor=effect.parent, request=changes.flags?.[SYSTEM_ID]?.conditionRequest??changes[`flags.${SYSTEM_ID}.conditionRequest`];
    if(actor?.documentName!=="Actor"||!request?.id||authority(actor)!==game.user)return;
    conditionWrite(actor,async()=>{
      if(!present(actor,effect)||state(effect).lastRequest===request.id)return;
      try{await performEffectSave(actor,effect,request);}
      catch(error){console.error(`${SYSTEM_ID} | Condition save`,error);ui.notifications.error(error.message);}
      finally{if(present(actor,effect))await effect.update({[`flags.${SYSTEM_ID}.conditionState.lastRequest`]:request.id,
        [`flags.${SYSTEM_ID}.conditionRequest`]:null});}
    }).catch(error=>console.error(`${SYSTEM_ID} | Condition request`,error));
  };
  Hooks.on("updateActiveEffect",dispatch);
  // Reloading the elected client must not leave a submitted save permanently pending.
  Hooks.once("ready",()=>{
    const actors=new Map(game.actors.map(actor=>[actor.uuid,actor]));
    for(const scene of game.scenes)for(const token of scene.tokens){
      if(!token.actorLink&&token.actor)actors.set(token.actor.uuid,token.actor);
    }
    for(const actor of actors.values())for(const effect of actor.effects)dispatch(effect,{flags:effect.flags});
  });
}
