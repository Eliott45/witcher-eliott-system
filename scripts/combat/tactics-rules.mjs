import { SYSTEM_ID } from "../config.mjs";

export const tacticsFlags = document => document?.flags?.[SYSTEM_ID] ?? {};
export const isDelayed = (combat, combatant) => Boolean(combat?.started && tacticsFlags(combatant).delay?.round === combat.round);
export const combatantForToken = (combat, token) => combat?.combatants.find(entry => entry.tokenId === token.id && entry.sceneId === token.parent.id);

export function ambushState(combat, combatant) {
  const state = tacticsFlags(combatant).ambush;
  return state && combat.round <= 1 && state.targets.length ? state : null;
}
export function ambushAttack(combat, attacker, target) {
  const combatant = combatantForToken(combat, attacker), state = ambushState(combat, combatant);
  if (!state) return {bonus:0, opening:false};
  return {combatant, bonus:state.targets.includes(target.uuid) ? 5 : 0, opening:Boolean(state.opening && !combat.started)};
}

/** Persist an explicit order while retaining the initiative numbers players rolled. */
export function delayedOrder(combat, combatant) {
  const current = combat.combatant;
  if (!isDelayed(combat, combatant) || !current || current.id === combatant.id) throw new Error("Вернуться можно вне своего хода в том же раунде.");
  const turns = combat.turns.filter(entry => entry.id !== combatant.id);
  const turn = turns.findIndex(entry => entry.id === current.id);
  turns.splice(turn + 1, 0, combatant);
  return {turn, updates:turns.map((entry, index) => ({_id:entry.id,
    [`flags.${SYSTEM_ID}.turnOrder`]:turns.length - index,
    ...(entry.id === combatant.id ? {[`flags.${SYSTEM_ID}.delay`]:null} : {})
  }))};
}

export function tacticalEffect(kind, combat, combatant, description) {
  return {name:kind === "delay" ? "Отложенный ход" : "Засада", type:"base", img:`icons/svg/${kind === "delay" ? "clockwork" : "eye"}.svg`,
    description:`<p>${description}</p>`, disabled:false, transfer:false, statuses:[], showIcon:2,
    start:null, duration:{value:null, units:"seconds", expiry:null, expired:false},
    flags:{[SYSTEM_ID]:{tactic:{kind, combat:combat.id, combatant:combatant.id, round:combat.round}}}};
}
