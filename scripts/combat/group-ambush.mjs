import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { combatantForToken, tacticsFlags, tacticalEffect } from "./tactics-rules.mjs";
import { requestTactic, tacticsWrite } from "./combat-tactics.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { creatureProfile } from "../data/creature-modes.mjs";

export const groupAmbush = combat => tacticsFlags(combat).groupAmbush;
export const ambushComplete = session => session.entries.every(row => row.role === "participant" || Number.isFinite(row.total));
export function ambushMatrix(session, combat = null) {
  const observers = session.entries.filter(row => row.role === "awareness");
  const stealth = session.entries.filter(row => row.role === "stealth");
  // Core p.275: the archers share their highest check, preserving each original die in the card.
  const specialists = stealth.filter(row => row.groupStealth ?? creatureProfile(combat?.combatants.get(row.id)?.actor)?.id === "scoiatael-archer");
  const groupTotal = specialists.length && specialists.every(row => Number.isFinite(row.total)) ? Math.max(...specialists.map(row => row.total)) : null;
  return stealth.map(row => {
    const sharedStealth = specialists.includes(row) && specialists.length > 1;
    const effectiveTotal = sharedStealth ? groupTotal : row.total;
    return {...row, effectiveTotal, sharedStealth, cells:observers.map(observer => ({
      observer:observer.id, unseen:Number.isFinite(effectiveTotal) && Number.isFinite(observer.total) ? effectiveTotal > observer.total : null
    }))};
  });
}
const save = (combat, session) => combat.update({[`flags.${SYSTEM_ID}.groupAmbush`]:session}, {turnEvents:false});
function requireGM() { if (!game.user.isGM) throw new Error("Настраивать засаду может только мастер."); }
function requireSession(combat, id, status = "checks") {
  const session = groupAmbush(combat);
  if (!session || session.id !== id || session.status !== status || combat.started) throw new Error("Эта подготовка засады уже завершена.");
  return structuredClone(session);
}
async function clearBonuses(combat) {
  for (const entry of combat.combatants) {
    const ids = entry.actor?.effects.filter(effect => {
      const flag = tacticsFlags(effect).tactic;
      return flag?.kind === "ambush" && flag.combat === combat.id && flag.combatant === entry.id;
    }).map(effect => effect.id) ?? [];
    if (ids.length) await entry.actor.deleteEmbeddedDocuments("ActiveEffect", ids, {witcherTactic:true});
  }
  await combat.updateEmbeddedDocuments("Combatant", combat.combatants.map(entry => ({_id:entry.id,
    [`flags.${SYSTEM_ID}.ambush`]:null, [`flags.${SYSTEM_ID}.ambushReport`]:null})), {turnEvents:false});
}

/** Only the GM chooses participants; token IDs keep separate copies of an NPC independent. */
export async function createGroupAmbush(scene, assignments) {
  requireGM();
  if (!scene) throw new Error("Откройте сцену с участниками засады.");
  const roles = new Map(assignments.map(row => [row.tokenId, row.role]));
  const tokens = [...roles].map(([id,role]) => ({token:scene.tokens.get(id),role}));
  if (tokens.some(({token,role}) => !COMBAT_ACTOR_TYPES.includes(token?.actor?.type) || !["stealth","awareness","participant"].includes(role))) throw new Error("Один из участников больше не доступен.");
  for (const role of ["stealth","awareness"]) {
    if (!tokens.some(row => row.role === role)) throw new Error("Выберите хотя бы одного скрывающегося и одного наблюдателя.");
    if (tokens.some(row => row.role === role && skillValue(row.token.actor.system, role).total === null)) throw new Error("Заполните Скрытность и Внимание выбранных участников.");
  }
  let combat = game.combat;
  if (combat?.scene?.id !== scene.id) combat = game.combats.find(entry => entry.scene?.id === scene.id && !entry.started);
  if (!combat) combat = await foundry.documents.Combat.create({scene:scene.id,active:true});
  return tacticsWrite(combat, async () => {
    if (combat.started) throw new Error("Подготовьте засаду до начала боя.");
    if (groupAmbush(combat) && !["cancelled","started"].includes(groupAmbush(combat).status)) throw new Error("Сначала завершите или отмените текущую засаду.");
    const missing = tokens.filter(({token}) => !combatantForToken(combat,token));
    if (missing.length) await combat.createEmbeddedDocuments("Combatant", missing.map(({token}) => ({tokenId:token.id,actorId:token.actorId,sceneId:scene.id,hidden:token.hidden})), {turnEvents:false});
    await clearBonuses(combat);
    await combat.updateEmbeddedDocuments("Combatant", tokens.map(({token}) => ({_id:combatantForToken(combat,token).id,initiative:null})), {turnEvents:false});
    const session = {id:foundry.utils.randomID(),status:"checks",entries:tokens.map(({token,role}) => ({
      id:combatantForToken(combat,token).id,token:token.uuid,role,total:null,claim:null,message:null,
      groupStealth:role === "stealth" && creatureProfile(token.actor)?.id === "scoiatael-archer"
    }))};
    await save(combat,session);
    await publishGroupCard(combat,session);
    return combat;
  });
}

export async function publishGroupCard(combat, session = groupAmbush(combat)) {
  requireGM();
  return foundry.documents.ChatMessage.create({content:'<section class="witcher-group-ambush"><h3>Групповая засада</h3><p>Скрытность против Внимания · по одному броску на участника.</p></section>',
    flags:{[SYSTEM_ID]:{skipLuck:true,groupAmbushCard:{combat:combat.id,session:session.id}}}});
}

export async function requestAmbush(actor) {
  if (actor && !actor.isOwner) return;
  const scene = globalThis.canvas?.scene;
  if (!scene) throw new Error("Откройте сцену с участниками засады.");
  return foundry.documents.ChatMessage.create({speaker:actor ? foundry.documents.ChatMessage.getSpeaker({actor}) : {alias:game.user.name},
    content:'<section class="witcher-group-ambush"><h3>Запрос на засаду</h3><p>Мастер выбирает участников и публикует общую проверку.</p></section>',
    flags:{[SYSTEM_ID]:{skipLuck:true,ambushRequest:{scene:scene.id}}}});
}

/** The elected GM grants a single roll slot; the owning player then rolls on their own client. */
export async function claimAmbushRoll(combatant, request) {
  const combat = combatant.parent, session = requireSession(combat, request.session);
  const row = session.entries.find(entry => entry.id === combatant.id);
  if (!row || row.role === "participant" || Number.isFinite(row.total)) throw new Error("Этот участник уже бросил или участвует без проверки.");
  if (row.claim) throw new Error("Бросок этого участника уже выполняется.");
  if (!conditionRules(combatant.actor).canAct) throw new Error("Персонаж сейчас не может действовать.");
  row.claim = {id:request.nonce,user:request.requester};
  await save(combat,session);
}

export async function releaseAmbushRoll(combat, sessionId, combatantId, nonce) {
  const session = requireSession(combat,sessionId), row = session.entries.find(entry => entry.id === combatantId);
  if (!row?.claim || (nonce && row.claim.id !== nonce)) return;
  // A posted die is authoritative even if the owner's client disconnected before receiving its acknowledgement.
  const message = game.messages.find(message => {
    const check = tacticsFlags(message).groupAmbushRoll;
    return check?.session === session.id && check.nonce === row.claim.id;
  });
  if (message) return acceptAmbushRoll(message);
  row.claim = null;
  await save(combat,session);
}

const rolling = new Set();
export async function rollGroupParticipant(combatant, sessionId) {
  const combat = combatant.parent, key = `${combat.id}:${combatant.id}`;
  if (!combatant.isOwner || rolling.has(key)) return;
  if (!game.users.activeGM) throw new Error("Нужен подключённый мастер.");
  const initial = requireSession(combat,sessionId), ownRow = initial.entries.find(row => row.id === combatant.id);
  if (!ownRow || ownRow.role === "participant" || Number.isFinite(ownRow.total) || ownRow.claim) return;
  const nonce = foundry.utils.randomID();
  rolling.add(key);
  let message;
  try {
    // Subscribe before sending the request: even a fast GM cannot race the listener.
    let hook, timer;
    const granted = new Promise((resolve,reject) => {
      hook = Hooks.on("updateCombat", updated => {
        if (updated.id !== combat.id) return;
        const session = groupAmbush(combat), row = session?.entries.find(entry => entry.id === combatant.id);
        if (session?.id !== sessionId || session.status !== "checks") reject(new Error("Подготовка засады завершена."));
        else if (row?.claim?.id === nonce && row.claim.user === game.user.id) resolve(row);
        else if (row?.claim || Number.isFinite(row?.total)) reject(new Error("Бросок уже выполняется другим владельцем."));
      });
      timer = setTimeout(() => reject(new Error("Мастер не подтвердил бросок. Повторите запрос.")),15000);
    });
    granted.catch(() => {});
    let row;
    try {
      await requestTactic(combatant,"ambush-claim",{session:sessionId,nonce});
      row = await granted;
    } finally { Hooks.off("updateCombat",hook); clearTimeout(timer); }
    const base = skillValue(combatant.actor.system,row.role).total;
    if (base === null) throw new Error("Заполните навык участника.");
    const display = trackRollDisplay();
    try {
      const mode = combatant.hidden || combatant.token?.hidden ? "blind" : "public";
      const roll = await new foundry.dice.Roll(`1d10wc + ${base}`).evaluate({allowInteractive:mode !== "blind"});
      const current = groupAmbush(combat);
      if (combat.started || current?.id !== sessionId || current.status !== "checks" || current.entries.find(entry => entry.id === combatant.id)?.claim?.id !== nonce) throw new Error("Проверка отменена мастером.");
      message = await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor:combatant.actor,token:combatant.token}),
        flavor:`<h3>Засада · ${row.role === "stealth" ? "Скрытность" : "Внимание"}</h3>`,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],groupAmbushRoll:{combat:combat.id,session:sessionId,combatant:combatant.id,nonce}}}}, {messageMode:mode});
      if (message) await display.wait(message);
    } finally { display.close(); }
    return message;
  } finally {
    if (!message && groupAmbush(combat)?.id === sessionId && groupAmbush(combat)?.status === "checks") {
      await requestTactic(combatant,"ambush-release",{session:sessionId,nonce}).catch(() => {});
    }
    rolling.delete(key);
  }
}

/** Called inside the elected GM's encounter queue, including recovery after a reload. */
export async function acceptAmbushRoll(message) {
  if (!game.users.activeGM?.isSelf) return;
  const check = tacticsFlags(message).groupAmbushRoll, combat = check && game.combats.get(check.combat);
  const stored = groupAmbush(combat);
  if (!stored || stored.id !== check.session || stored.status !== "checks" || combat.started) return;
  const session = structuredClone(stored), row = session.entries.find(entry => entry.id === check.combatant);
  const participant = combat.combatants.get(check.combatant), user = game.users.get(row?.claim?.user);
  if (!row?.claim || row.claim.id !== check.nonce || Number.isFinite(row.total) || !participant || !user
    || message.author.id !== user.id || !participant.testUserPermission(user,"OWNER")
    || message.speakerActor?.uuid !== participant.actor.uuid || message.rolls.length !== 1 || !Number.isFinite(message.rolls[0].total)) return;
  row.total = message.rolls[0].total; row.message = message.id; row.claim = null;
  await save(combat,session);
  if (ambushComplete(session)) await applyGroupAmbush(combat);
}

export async function applyGroupAmbush(combat) {
  const session = groupAmbush(combat);
  if (!session || session.status !== "checks" || combat.started || !ambushComplete(session)) return;
  for (const row of ambushMatrix(session, combat)) {
    const participant = combat.combatants.get(row.id);
    if (!participant) throw new Error("Участник удалён из боя. Отмените засаду и выберите состав заново.");
    const targets = row.cells.filter(cell => cell.unseen).map(cell => session.entries.find(entry => entry.id === cell.observer).token);
    await participant.update({[`flags.${SYSTEM_ID}.ambush`]:targets.length ? {targets,group:session.id} : null}, {turnEvents:false});
    const exists = participant.actor.effects.some(effect => tacticsFlags(effect).tactic?.combat === combat.id && tacticsFlags(effect).tactic?.combatant === participant.id && tacticsFlags(effect).tactic?.kind === "ambush");
    if (targets.length && !exists) await participant.actor.createEmbeddedDocuments("ActiveEffect",[tacticalEffect("ambush",combat,participant,"+5 к атакам против не заметивших вас целей до конца первого раунда.")]);
  }
  await save(combat,{...session,status:"ready"});
}

export async function cancelGroupAmbush(combat) {
  requireGM();
  if (combat.started) throw new Error("Бой уже начался.");
  await clearBonuses(combat);
  await save(combat,{...groupAmbush(combat),status:"cancelled"});
}

export async function startGroupCombat(combat) {
  requireGM();
  const session = groupAmbush(combat);
  if (combat.started || !session || !["ready","opening","initiative"].includes(session.status)) return;
  await save(combat,{...session,status:"initiative"});
  const opening = combat.combatants.filter(entry => tacticsFlags(entry).ambush?.opening);
  if (opening.length) await combat.updateEmbeddedDocuments("Combatant",opening.map(entry => ({_id:entry.id,
    [`flags.${SYSTEM_ID}.ambush.opening`]:false})),{turnEvents:false});
  // A failed/reloaded start can continue without rerolling those already in initiative.
  const missing = combat.combatants.filter(entry => !Number.isFinite(entry.initiative));
  if (missing.length) await combat.rollInitiative(missing.map(entry => entry.id),{updateTurn:false});
  if (!combat.started && combat.combatants.every(entry => Number.isFinite(entry.initiative))) await combat.startCombat();
  if (combat.started) await save(combat,{...groupAmbush(combat),status:"started"});
}

/** Resume a preparation saved by the former opening-attack UI without starting combat. */
export async function restoreGroupPreparation(combat) {
  if (!game.users.activeGM?.isSelf) return;
  const session = groupAmbush(combat);
  if (session?.status !== "opening" || combat.started) return;
  await save(combat,{...session,status:"ready"});
}
