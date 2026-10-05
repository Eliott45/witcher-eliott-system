import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { trackRollDisplay } from "./roll-display.mjs";

const pending=new Map();
const label=key=>game.i18n.localize(`WITCHER.Critical.Manual.${key}`);
export const hasPendingCritical=()=>pending.size>0;
/** A display copy of an already rolled face, never a second random draw. */
export function faceRoll(face) {
  return foundry.dice.Roll.fromData({class:"Roll",formula:"1d10",options:{},evaluated:true,total:face,
    terms:[{class:"Die",number:1,faces:10,modifiers:[],options:{},evaluated:true,results:[{result:face,active:true}]}]});
}
// Persist readiness too: Foundry skips no-op updates, so changing only our local
// waiter would otherwise leave the initially disabled controls on screen.
const flag=(record,status)=>({id:record.id,userId:game.user.id,status,waiting:!record.busy&&!!record.waiter,kind:record.chain.kind,results:[...record.chain.results],total:record.chain.total});
function content(record,status) {
  const chain=record.chain;
  return `<section class="witcher-manual-critical"><strong>${esc(label(chain.kind==="fumble"?"Fumble":"Success"))}</strong><div class="witcher-chain-path">${chain.results.map(face=>`<span class="witcher-chain-die">${face}</span>`).join('<span class="witcher-chain-arrow">→</span>')}<b>= ${chain.total}</b></div><small>${esc(label(status==="complete"?"Complete":status==="cancelled"?"Cancelled":"Pending"))}</small></section>`;
}
async function publish(record,status) {
  return record.message.update({content:content(record,status),[`flags.${SYSTEM_ID}.manualCritical`]:flag(record,status)});
}
/** Keep Roll.evaluate pending, so downstream success checks/resources never see a partial total. */
export async function beginManualCritical(first,chain) {
  const record={id:foundry.utils.randomID(),chain,busy:true,message:null,waiter:null};
  pending.set(record.id,record);
  const display=trackRollDisplay(),mode=game.settings.get("core","messageMode");
  try {
    record.message=await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({
      speaker:{alias:game.user.name},rolls:[faceRoll(first.result)],content:content(record,"pending"),
      flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],skipLuck:true,manualCritical:flag(record,"pending")}}
    },mode));
    if(!record.message)throw new Error(label("Cancelled"));
    await display.wait(record.message);
    first.hidden=true; // DSN already displayed this face; the final Roll retains it in its tooltip.
  } catch(error) {pending.delete(record.id);throw error;} finally {display.close();}
  return {
    async wait() {
      const choice=new Promise((resolve,reject)=>{record.waiter={resolve,reject};});
      choice.catch(()=>{}); // A cancel click may arrive while the message update is in flight.
      record.busy=false;
      try {await publish(record,"pending");}catch(error){record.waiter=null;throw error;}
      return choice;
    },
    async show(next,complete) {
      const message=record.message;
      if(game.dice3d)await game.dice3d.showForRoll(faceRoll(next.result),game.user,true,message.whisper.length?[...message.whisper]:null,message.blind,null,message.speaker);
      next.hidden=true;
      await publish(record,complete?"complete":"pending");
    },
    async close(error) {
      pending.delete(record.id);record.waiter=null;
      if(error)await publish(record,"cancelled").catch(()=>{});
    }
  };
}
export function continueManualCritical(message,{cancel=false}={}) {
  const data=message.flags[SYSTEM_ID]?.manualCritical,record=data&&pending.get(data.id);
  if(!record||record.busy||!record.waiter||data.userId!==game.user.id||!message.isOwner)return false;
  record.busy=true;const waiter=record.waiter;record.waiter=null;
  if(cancel)waiter.reject(new Error(label("Cancelled")));else waiter.resolve();
  return true;
}
export function renderManualCritical(message,html) {
  const data=message.flags[SYSTEM_ID]?.manualCritical;
  if(!data||data.status!=="pending"||data.userId!==game.user.id||!message.isOwner)return;
  html.querySelector(".witcher-critical-controls")?.remove();
  const panel=document.createElement("div");panel.className="witcher-critical-controls";
  const record=pending.get(data.id);
  if(!record)panel.textContent=label("Interrupted");
  else {
    for(const cancel of [false,true]) {
      const button=document.createElement("button");button.type="button";
      button.className=cancel?"witcher-critical-cancel":"witcher-critical-continue";
      button.textContent=cancel?label("Cancel"):`+ ${label("Continue")}`;
      button.disabled=record.busy||!record.waiter;
      button.addEventListener("click",()=>{for(const control of panel.querySelectorAll("button"))control.disabled=true;continueManualCritical(message,{cancel});});
      panel.append(button);
    }
  }
  // Blind rolls still need a control for their author, without exposing hidden faces or totals.
  html.append(panel);
}
export function registerManualCriticalChat() {
  Hooks.on("renderChatMessageHTML",renderManualCritical);
  Hooks.on("deleteChatMessage",message=>continueManualCritical(message,{cancel:true}));
}
