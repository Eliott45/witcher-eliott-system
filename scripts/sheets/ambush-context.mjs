import { COMBAT_ACTOR_TYPES } from "../config.mjs";
import { groupAmbush, ambushMatrix } from "../combat/group-ambush.mjs";

export const AMBUSH_ROLES = [{id:"none",name:"Не участвует"},{id:"stealth",name:"Скрывается"},
  {id:"awareness",name:"Наблюдает"},{id:"participant",name:"Без проверки"}];
export function ambushCandidates(scene = globalThis.canvas?.scene) {
  return Array.from(scene?.tokens ?? []).filter(token => COMBAT_ACTOR_TYPES.includes(token.actor?.type))
    .sort((a,b) => b.disposition-a.disposition || a.name.localeCompare(b.name,"ru") || a.id.localeCompare(b.id));
}

export function groupCardContext(combat, sessionId, user = game.user) {
  const session = groupAmbush(combat), current = session?.id === sessionId;
  if (!current) return {available:false,rows:[],matrix:[],observers:[],canManage:false,hasMatrix:false,phase:"Эта засада уже завершена.",progress:""};
  const active = session.status === "checks" && !combat.started;
  const visible = row => {
    const entry = combat.combatants.get(row.id);
    return entry && (user.isGM || (!entry.hidden && !entry.token?.hidden) || entry.testUserPermission(user,"OWNER"));
  };
  const rows = session.entries.filter(visible).map(row => {
    const entry = combat.combatants.get(row.id), owned = entry.testUserPermission(user,"OWNER");
    return {...row,name:entry.name,img:entry.token?.texture?.src || "icons/svg/mystery-man.svg",
      label:row.role === "stealth" ? "Скрытность" : row.role === "awareness" ? "Внимание" : "Без проверки",
      rolled:Number.isFinite(row.total),totalLabel:Number.isFinite(row.total) ? row.total : "—",
      canRoll:active && owned && row.role !== "participant" && !Number.isFinite(row.total) && !row.claim,
      pending:!!row.claim,canUnlock:user.isGM && active && !!row.claim,participant:row.role === "participant"};
  });
  const observers = rows.filter(row => row.role === "awareness");
  const matrix = ambushMatrix(session).filter(row => visible(row)).map(row => ({name:rows.find(entry => entry.id === row.id).name,
    cells:row.cells.filter(cell => observers.some(observer => observer.id === cell.observer)).map(cell => ({
      ...cell,pending:cell.unseen === null,label:cell.unseen === null ? "…" : cell.unseen ? "+5" : "—",
      hint:cell.unseen === null ? "Ожидается проверка" : cell.unseen ? "Не заметил · +5 к атакам" : "Заметил · без бонуса"
    }))}));
  const phase = combat.round > 1 ? "Первый раунд завершён" : combat.started ? "Бой начался · бонусы до конца первого раунда"
    : ({checks:"Участники выполняют проверки",ready:"Проверки завершены",opening:"Проверки завершены",initiative:"Бросаем инициативу",cancelled:"Засада отменена"})[session.status];
  return {available:true,rows,observers,matrix,canManage:Boolean(user.isGM),phase,hasMatrix:matrix.length>0 && observers.length>0,
    progress:`${rows.filter(row => row.rolled).length} / ${rows.filter(row => !row.participant).length}`};
}

export function ambushWindowContext(scene, {roles = new Map(),busy = false} = {}) {
  const encounters = [game.combat,...game.combats].filter(Boolean);
  const combat = encounters.find(entry => entry.scene?.id === scene?.id && groupAmbush(entry) && groupAmbush(entry).status !== "cancelled" && (entry === game.combat || !entry.started));
  const session = groupAmbush(combat), locked = !!session, rows = ambushCandidates(scene).map(token => {
    const role = roles.get(token.id) ?? "none";
    return {id:token.id,name:token.name,img:token.texture?.src || "icons/svg/mystery-man.svg",hidden:!!token.hidden,
      search:token.name.toLocaleLowerCase(),roles:AMBUSH_ROLES.map(entry => ({...entry,selected:entry.id === role}))};
  });
  return {sceneName:scene?.name ?? "Сцена",rows,locked,busy,combatId:combat?.id ?? "",sessionId:session?.id ?? "",
    card:locked ? groupCardContext(combat,session.id) : null,
    canPublish:!busy && !locked && [...roles.values()].includes("stealth") && [...roles.values()].includes("awareness"),
    canCancel:locked && !busy && !combat.started,
    canStart:!busy && !combat?.started && ["ready","opening","initiative"].includes(session?.status)};
}
