import { SYSTEM_ID } from "../config.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { ambushState, delayedOrder, isDelayed, tacticsFlags, tacticalEffect } from "./tactics-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

const queues = new Map();
export function tacticsWrite(combat, work) {
  const job = (queues.get(combat.id) ?? Promise.resolve()).catch(() => {}).then(work);
  queues.set(combat.id, job);
  const clear = () => { if (queues.get(combat.id) === job) queues.delete(combat.id); };
  job.then(clear, clear);
  return job;
}
const activeGM = () => game.users.activeGM?.isSelf;
const effectsFor = (combat, combatant, kind) => combatant.actor?.effects.filter(effect => {
  const state = tacticsFlags(effect).tactic;
  return state?.combat === combat.id && state.combatant === combatant.id && (!kind || state.kind === kind);
}) ?? [];
async function removeTacticEffect(combat, combatant, kind) {
  const ids = effectsFor(combat, combatant, kind).map(effect => effect.id);
  if (ids.length) await combatant.actor.deleteEmbeddedDocuments("ActiveEffect", ids, {witcherTactic:true});
}

/** An owner writes a native Combatant flag; the active GM alone changes the encounter. */
export async function requestTactic(combatant, kind, data = {}) {
  if (!combatant?.isOwner) throw new Error("Добавьте токен персонажа в трекер боя.");
  if (!game.users.activeGM) throw new Error("Для управления порядком боя нужен подключённый мастер.");
  if (tacticsFlags(combatant).tacticRequest) throw new Error("Предыдущий запрос ещё обрабатывается.");
  const combat = combatant.parent;
  return combatant.update({[`flags.${SYSTEM_ID}.tacticRequest`]:{
    ...data, id:foundry.utils.randomID(), kind, round:combat.round, current:combat.combatant?.id ?? null,
    requester:game.user.id
  }}, {turnEvents:false});
}

export async function delayTurn(combat, combatant) {
  if (!combat.started || combat.combatant?.id !== combatant.id || combatant.isDefeated || !conditionRules(combatant.actor).canAct) throw new Error("Отложить ход можно только во время своего хода.");
  await combatant.update({[`flags.${SYSTEM_ID}.delay`]:{round:combat.round}}, {turnEvents:false});
  try {
    await combatant.actor.createEmbeddedDocuments("ActiveEffect", [tacticalEffect("delay", combat, combatant, "Ход отложен до конца текущего раунда. Нажмите часы в трекере, чтобы действовать после текущего существа.")]);
    await combat.nextTurn();
  } catch (error) {
    await combatant.update({[`flags.${SYSTEM_ID}.delay`]:null}, {turnEvents:false});
    await removeTacticEffect(combat, combatant, "delay");
    throw error;
  }
}

export async function resumeDelayedTurn(combat, combatant) {
  const plan = delayedOrder(combat, combatant);
  // Native combatTurn persists the new index on the server with the Combatant writes.
  // This is only a reorder: no time advance, start/end-turn saves, or effect expiry.
  await combat.updateEmbeddedDocuments("Combatant", plan.updates, {combatTurn:plan.turn, turnEvents:false, witcherOrder:true});
  await removeTacticEffect(combat, combatant, "delay");
}

export async function processTacticRequest(combatant, request) {
  const combat = combatant.parent;
  if (!activeGM() || !request || tacticsFlags(combatant).lastTacticRequest === request.id) return;
  const user = game.users.get(request.requester);
  try {
    if (!user || !combatant.testUserPermission(user, "OWNER")) throw new Error("Нет прав управлять этим участником боя.");
    if (request.round !== combat.round || request.current !== (combat.combatant?.id ?? null)) throw new Error("Ход уже сменился. Нажмите кнопку ещё раз.");
    if (request.kind === "group-initiative") {
      const { applyGroupInitiativeRequest } = await import("./group-initiative.mjs");
      await applyGroupInitiativeRequest(combat, combatant, request);
    }
    else if (request.kind === "delay") await delayTurn(combat, combatant);
    else if (request.kind === "resume") await resumeDelayedTurn(combat, combatant);
    else if (request.kind === "ambush-claim") {
      const {claimAmbushRoll} = await import("./group-ambush.mjs");
      await claimAmbushRoll(combatant,request);
    } else if (request.kind === "ambush-release") {
      const {releaseAmbushRoll} = await import("./group-ambush.mjs");
      await releaseAmbushRoll(combat,request.session,combatant.id,request.nonce);
    }
    else if (request.kind === "reveal") {
      const state=ambushState(combat,combatant);
      if(state){
        const targets=state.targets.filter(uuid=>uuid!==request.target);
        await combatant.update({[`flags.${SYSTEM_ID}.ambush`]:targets.length?{...state,targets}:null},{turnEvents:false});
        if(!targets.length)await removeTacticEffect(combat,combatant,"ambush");
      }
    }
  } catch (error) {
    console.error(`${SYSTEM_ID} | Combat tactics`, error);
    await foundry.documents.ChatMessage.create({content:`<p>${esc(error.message)}</p>`, whisper:[request.requester], flags:{[SYSTEM_ID]:{skipLuck:true}}});
  } finally {
    await combatant.update({[`flags.${SYSTEM_ID}.lastTacticRequest`]:request.id, [`flags.${SYSTEM_ID}.tacticRequest`]:null}, {turnEvents:false});
  }
}

export async function cleanupTactics(combat, {deleted = false} = {}) {
  if (!activeGM()) return;
  const updates = [];
  for (const combatant of combat.combatants) {
    const flags = tacticsFlags(combatant), update = {_id:combatant.id};
    if (deleted || (flags.delay && !isDelayed(combat, combatant))) {
      await removeTacticEffect(combat, combatant, "delay");
      if (flags.delay) update[`flags.${SYSTEM_ID}.delay`] = null;
    }
    if (deleted || combat.round > 1) {
      await removeTacticEffect(combat, combatant, "ambush");
      if (flags.ambush) update[`flags.${SYSTEM_ID}.ambush`] = null;
      if (flags.ambushReport) update[`flags.${SYSTEM_ID}.ambushReport`] = null;
    }
    if (Object.keys(update).length > 1) updates.push(update);
  }
  if (!deleted && updates.length) await combat.updateEmbeddedDocuments("Combatant", updates, {turnEvents:false, witcherOrder:true});
}

export async function resetTacticalOrder(combat) {
  if (!activeGM() || !combat.combatants.some(entry => Number.isFinite(tacticsFlags(entry).turnOrder))) return;
  const current = combat.combatant?.id;
  const turns = [...combat.combatants].sort((a, b) => ((b.initiative ?? -Infinity) - (a.initiative ?? -Infinity)) || (a.id > b.id ? 1 : -1));
  await combat.updateEmbeddedDocuments("Combatant", combat.combatants.map(entry => ({_id:entry.id, [`flags.${SYSTEM_ID}.turnOrder`]:null})),
    {turnEvents:false, witcherOrder:true, ...(current ? {combatTurn:turns.findIndex(entry => entry.id === current)} : {})});
}

export function renderTacticalTracker(app, html) {
  // Header-only and popout renders can reuse the tracker DOM.
  for(const element of html.querySelectorAll(".witcher-delay-toggle, .witcher-delay-label"))element.remove();
  for(const row of html.querySelectorAll(".witcher-is-delayed"))row.classList.remove("witcher-is-delayed");
  const combat = app.viewed;
  if (!combat?.started) return;
  for (const row of html.querySelectorAll(".combatant[data-combatant-id]")) {
    const combatant = combat.combatants.get(row.dataset.combatantId), delayed = isDelayed(combat, combatant);
    if (!combatant?.actor) continue;
    if (delayed) {
      row.classList.add("witcher-is-delayed");
      const label = document.createElement("small"); label.className = "witcher-delay-label"; label.textContent = "Ход отложен";
      row.querySelector(".token-name")?.append(label);
    }
    if (!combatant.isOwner || combatant.isDefeated || (!delayed && combat.combatant?.id !== combatant.id)) continue;
    const button = document.createElement("button"); button.type = "button"; button.className = `witcher-delay-toggle inline-control${delayed ? " active" : ""}`;
    button.innerHTML = '<i class="fa-solid fa-clock" aria-hidden="true"></i>';
    button.dataset.tooltip = delayed ? "Действовать после текущего существа" : "Отложить ход";
    button.setAttribute("aria-label", button.dataset.tooltip); button.setAttribute("aria-pressed", String(delayed));
    button.disabled = Boolean(tacticsFlags(combatant).tacticRequest);
    button.addEventListener("click", async event => {
      event.stopPropagation(); button.disabled = true;
      try { await requestTactic(combatant, delayed ? "resume" : "delay"); }
      catch (error) { ui.notifications.warn(error.message); button.disabled = false; }
    });
    row.append(button);
  }
}

export function registerCombatTactics() {
  const dispatch = (combatant, changes, _options, userId) => {
    const request = changes.flags?.[SYSTEM_ID]?.tacticRequest ?? changes[`flags.${SYSTEM_ID}.tacticRequest`];
    if (!activeGM() || !request || (userId && request.requester !== userId)) return;
    tacticsWrite(combatant.parent, () => processTacticRequest(combatant, request)).catch(console.error);
  };
  Hooks.on("updateCombatant", dispatch);
  Hooks.on("updateCombatant",(combatant,changes)=>{
    if(changes.flags?.[SYSTEM_ID])combatant.actor?.render(false);
  });
  Hooks.on("updateCombatant", (combatant, changes, options) => {
    if (activeGM() && "initiative" in changes && !options.witcherOrder) tacticsWrite(combatant.parent, () => resetTacticalOrder(combatant.parent)).catch(console.error);
  });
  Hooks.on("updateCombat", (combat, changes) => {
    if ("round" in changes) tacticsWrite(combat, () => cleanupTactics(combat)).catch(console.error);
  });
  Hooks.on("deleteCombat", combat => tacticsWrite(combat, () => cleanupTactics(combat, {deleted:true})).catch(console.error));
  Hooks.on("deleteCombatant", combatant => { if (activeGM()) removeTacticEffect(combatant.parent, combatant).catch(console.error); });
  // A manually removed/expired effect must remove its mechanical state as well.
  const clearEffectState=(effect,options)=>{
    const state=tacticsFlags(effect).tactic;
    if(!activeGM()||!state||options.witcherTactic)return;
    const combat=game.combats.get(state.combat),combatant=combat?.combatants.get(state.combatant);
    if(!combatant)return;
    tacticsWrite(combat,()=>combatant.update({[`flags.${SYSTEM_ID}.${state.kind==='delay'?'delay':'ambush'}`]:null},{turnEvents:false})).catch(console.error);
  };
  Hooks.on("deleteActiveEffect",clearEffectState);
  Hooks.on("updateActiveEffect",(effect,changes,options)=>{if(changes.disabled===true)clearEffectState(effect,options);});
  Hooks.on("renderCombatTracker", renderTacticalTracker);
  Hooks.once("ready", () => {
    if (!activeGM()) return;
    for (const combat of game.combats) {
      tacticsWrite(combat, () => cleanupTactics(combat)).catch(console.error);
      for (const combatant of combat.combatants) dispatch(combatant, {flags:combatant.flags});
    }
  });
}
