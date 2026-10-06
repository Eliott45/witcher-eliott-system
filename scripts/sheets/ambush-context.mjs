import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { groupAmbush, ambushMatrix } from "../combat/group-ambush.mjs";

export const AMBUSH_ROLES = [{id:"none",name:"Не участвует"},{id:"stealth",name:"Скрывается"},
  {id:"awareness",name:"Наблюдает"},{id:"participant",name:"Без проверки"}];
export function ambushCandidates(scene = globalThis.canvas?.scene) {
  return Array.from(scene?.tokens ?? []).filter(token => COMBAT_ACTOR_TYPES.includes(token.actor?.type))
    .sort((a,b) => b.disposition-a.disposition || a.name.localeCompare(b.name,"ru") || a.id.localeCompare(b.id));
}

const ROLE_LABELS = {stealth:"Скрытность",awareness:"Внимание",participant:"Без проверки"};
const ROLE_GROUPS = [{role:"stealth",title:"Скрываются",icon:"fa-user-ninja"},{role:"awareness",title:"Наблюдают",icon:"fa-eye"},
  {role:"participant",title:"Без проверки",icon:"fa-user"}];

/** Dice breakdown of an accepted check; blind rolls keep their faces from users who cannot read them. */
function rollDetail(row, user) {
  const message = row.message ? game.messages?.get?.(row.message) : null, roll = message?.rolls?.[0];
  if (!roll?.dice?.length || !(user.isGM || message.isContentVisible)) return null;
  const die = roll.dice[0], chain = die.options?.[SYSTEM_ID]?.criticalChains?.[0];
  const modifier = roll.total - die.total;
  return {die:die.total,modifier:modifier ? `${modifier > 0 ? "+" : "−"} ${Math.abs(modifier)}` : "",
    critical:chain?.kind === "critical",fumble:chain?.kind === "fumble",formula:roll.formula};
}

export function groupCardContext(combat, sessionId, user = game.user) {
  const session = groupAmbush(combat), current = session?.id === sessionId;
  if (!current) return {available:false,rows:[],groups:[],matrix:[],observers:[],canManage:false,hasMatrix:false,phase:"Эта засада уже завершена.",progress:"",status:"closed"};
  const active = session.status === "checks" && !combat.started;
  const visible = row => {
    const entry = combat.combatants.get(row.id);
    return entry && (user.isGM || (!entry.hidden && !entry.token?.hidden) || entry.testUserPermission(user,"OWNER"));
  };
  const rows = session.entries.filter(visible).map(row => {
    const entry = combat.combatants.get(row.id), owned = entry.testUserPermission(user,"OWNER"), rolled = Number.isFinite(row.total);
    return {...row,name:entry.name,img:entry.token?.texture?.src || "icons/svg/mystery-man.svg",
      label:ROLE_LABELS[row.role],rolled,totalLabel:rolled ? row.total : "—",detail:rolled ? rollDetail(row,user) : null,
      canRoll:active && owned && row.role !== "participant" && !rolled && !row.claim,
      pending:!!row.claim,canUnlock:user.isGM && active && !!row.claim,participant:row.role === "participant"};
  });
  const groups = ROLE_GROUPS.map(group => ({...group,rows:rows.filter(row => row.role === group.role)})).filter(group => group.rows.length);
  const observers = rows.filter(row => row.role === "awareness");
  const matrix = ambushMatrix(session).filter(row => visible(row)).map(row => {
    const own = rows.find(entry => entry.id === row.id);
    const cells = row.cells.filter(cell => observers.some(observer => observer.id === cell.observer)).map(cell => {
      const observer = observers.find(entry => entry.id === cell.observer);
      return {...cell,name:observer.name,total:observer.rolled ? observer.total : null,pending:cell.unseen === null,
        label:cell.unseen === null ? "…" : cell.unseen ? "+5" : "—",
        status:cell.unseen === null ? "ждём бросок" : cell.unseen ? "не заметил" : "заметил",
        hint:cell.unseen === null ? "Ожидается проверка" : cell.unseen ? "Не заметил · +5 к атакам" : "Заметил · без бонуса"};
    });
    return {name:own.name,img:own.img,total:own.rolled ? own.total : null,cells,unseenCount:cells.filter(cell => cell.unseen).length};
  });
  const phase = combat.round > 1 ? "Первый раунд завершён" : combat.started ? "Бой начался · бонусы до конца первого раунда"
    : ({checks:"Участники выполняют проверки",ready:"Проверки завершены",opening:"Проверки завершены",initiative:"Бросаем инициативу",cancelled:"Засада отменена"})[session.status];
  const checks = rows.filter(row => !row.participant), done = checks.filter(row => row.rolled).length;
  return {available:true,rows,groups,observers,matrix,canManage:Boolean(user.isGM),phase,hasMatrix:matrix.length>0 && observers.length>0,
    status:combat.started ? "started" : session.status === "opening" ? "ready" : session.status,
    progress:`${done} / ${checks.length}`,progressPercent:checks.length ? Math.round(done / checks.length * 100) : 100};
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
