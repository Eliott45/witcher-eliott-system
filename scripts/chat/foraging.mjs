import { SYSTEM_ID } from "../config.mjs";
import { foragingState, saveForaging, resolveForaging } from "../workshop/foraging.mjs";
import { workshopCheck } from "../workshop/check.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

const queues = new Map(), rolling = new Set();
export function foragingWrite(card, work) {
  const job = (queues.get(card.id) ?? Promise.resolve()).catch(()=>{}).then(work);
  queues.set(card.id,job);
  const clear = () => {if (queues.get(card.id) === job) queues.delete(card.id);};
  job.then(clear,clear); return job;
}
const postedRoll = (card, nonce) => game.messages.find(message => {
  const check = message.flags[SYSTEM_ID]?.foragingRoll;
  const state = foragingState(card);
  return check?.card === card.id && check.nonce === nonce && message.author?.id === state.claim?.user && message.speakerActor?.uuid === state.actor;
});

/** Actor ownership provides native permission checks; only the elected GM changes the request. */
export async function processForagingRequest(actor, request, userId) {
  if (!game.users.activeGM?.isSelf || request.user !== userId) return;
  const card = game.messages.get(request.card), state = foragingState(card), user = game.users.get(userId);
  if (!state || state.actor !== actor.uuid || !user || !actor.testUserPermission(user,"OWNER")) return;
  if (request.kind === "claim") {
    if (state.status !== "waiting" || !conditionRules(actor).canAct) return;
    await saveForaging(card,{...state,status:"rolling",claim:{id:request.nonce,user:userId}});
  } else if (request.kind === "release" && state.status === "rolling" && state.claim?.id === request.nonce && state.claim.user === userId) {
    // A committed die must never become another opportunity to roll.
    if (!postedRoll(card,request.nonce)) await saveForaging(card,{...state,status:"waiting",claim:null});
  }
}

async function signal(actor, card, kind, nonce) {
  return actor.update({[`flags.${SYSTEM_ID}.foragingRequest`]:{card:card.id,kind,nonce,user:game.user.id,id:foundry.utils.randomID()}});
}
export async function rollForagingRequest(card) {
  const state = foragingState(card), actor = state && await fromUuid(state.actor);
  if (!actor?.isOwner || state.status !== "waiting" || rolling.has(card.id)) return;
  if (!game.users.activeGM) throw new Error("Нужен подключённый мастер.");
  if (!conditionRules(actor).canAct) throw new Error("Персонаж сейчас не может выполнять это действие.");
  rolling.add(card.id);
  const nonce = foundry.utils.randomID();
  let message;
  try {
    let hook, timer;
    const granted = new Promise((resolve,reject) => {
      hook = Hooks.on("updateChatMessage",updated => {
        if (updated.id !== card.id) return;
        const current = foragingState(updated);
        if (current?.status === "rolling" && current.claim?.id === nonce && current.claim.user === game.user.id) resolve();
        else if (current?.status !== "waiting") reject(new Error("Эта проверка уже выполняется."));
      });
      timer = setTimeout(()=>reject(new Error("Мастер не подтвердил проверку. Повторите запрос.")),15000);
    });
    granted.catch(()=>{});
    try { await signal(actor,card,"claim",nonce); await granted; }
    finally { Hooks.off("updateChatMessage",hook); clearTimeout(timer); }
    const flags = {foragingRoll:{card:card.id,nonce,ready:false}};
    if (state.options.check) {
      const check = await workshopCheck(actor,{name:`Собирательство: ${state.name}`,skill:"wildernessSurvival",dc:state.options.dc,flags});
      message = check.message;
      await message.update({[`flags.${SYSTEM_ID}.foragingRoll.ready`]:true});
    } else {
      message = await foundry.documents.ChatMessage.create({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),
        content:`<p>Сбор: ${esc(state.name)}</p>`,flags:{[SYSTEM_ID]:{skipLuck:true,foragingRoll:{...flags.foragingRoll,ready:true}}}},
        {messageMode:game.settings.get("core","messageMode")});
    }
    return message;
  } finally {
    if (!message) await signal(actor,card,"release",nonce).catch(()=>{});
    rolling.delete(card.id);
  }
}

export async function resumeForaging(card) {
  const state = foragingState(card);
  if (!game.user.isGM || !state || !["rolling","resolving"].includes(state.status)) return;
  const message = postedRoll(card,state.claim?.id);
  if (message) {
    // The owner may have disconnected after the die was committed but before display finished.
    await message.update({[`flags.${SYSTEM_ID}.foragingRoll.ready`]:true});
    if (game.users.activeGM?.isSelf) return resolveForaging(card,message);
  } else await saveForaging(card,{...state,status:"waiting",claim:null});
}
export async function renderForaging(message, html) {
  const state = foragingState(message), root = html.querySelector(".witcher-foraging-card");
  if (!state || !root) return;
  root.querySelector(".witcher-foraging-controls")?.remove();
  const actor = await fromUuid(state.actor);
  if (!actor?.isOwner || state.status === "complete") return;
  const retry = game.user.isGM && ["rolling","resolving"].includes(state.status);
  if (state.status !== "waiting" && !retry) return;
  const button = document.createElement("button"); button.type = "button"; button.className = "witcher-foraging-controls";
  button.textContent = retry ? "Продолжить проверку" : state.options.check ? "Бросить Выживание" : "Собрать";
  button.addEventListener("click",async () => {
    button.disabled=true;
    try { if (retry) await foragingWrite(message,()=>resumeForaging(message)); else await rollForagingRequest(message); }
    catch(error) {ui.notifications.warn(error.message);}
    finally {ui.chat?.updateMessage(message,{notify:false});}
  });
  root.append(button);
}

export function registerForaging() {
  game.system.api = {...game.system.api,forage:async () => {
    try {
      if (!game.user.isGM) throw new Error("Макрос собирательства доступен ведущему.");
      const {openForagingWindow} = await import("../sheets/foraging-window.mjs");
      return await openForagingWindow();
    } catch(error) {console.error(error);ui.notifications.warn(error.message);}
  }};
  Hooks.on("renderChatMessageHTML",renderForaging);
  Hooks.on("updateActor",(actor,changes,_options,userId) => {
    const request = changes.flags?.[SYSTEM_ID]?.foragingRequest;
    const card = request && game.messages.get(request.card);
    if (card && game.users.activeGM?.isSelf) foragingWrite(card,()=>processForagingRequest(actor,request,userId)).catch(console.error);
  });
  const accept = message => {
    const check = message.flags[SYSTEM_ID]?.foragingRoll, card = check?.ready && game.messages.get(check.card);
    if (card && game.users.activeGM?.isSelf) foragingWrite(card,()=>resolveForaging(card,message)).catch(error=>{console.error(error);ui.notifications.warn(error.message);});
  };
  Hooks.on("createChatMessage",accept);
  Hooks.on("updateChatMessage",accept);
  Hooks.once("ready",() => {
    if (game.users.activeGM?.isSelf) for (const message of game.messages) accept(message);
  });
}
