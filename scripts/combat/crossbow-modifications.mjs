import { SYSTEM_ID } from "../config.mjs";
import { hasCrossbowMod } from "../data/crossbow-modifications.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { actionQuote, actionUpdate, actionRoundKey } from "./action-economy.mjs";
import { fullTurnStart, consumeAiming } from "./full-turn-rules.mjs";
import { loadUpdate, isCrossbow } from "./crossbow-ammo.mjs";
import { inventoryTransaction, copyPhysical } from "../workshop/transaction.mjs";
import { workshopNotice } from "../workshop/check.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

function turnEffect(actor,name,full=false) {
  return {name,type:"base",img:"icons/svg/clockwork.svg",statuses:[],system:{},start:fullTurnStart(actor),
    duration:{value:1,units:"rounds",expiry:"turnStart",expired:false},
    description:`<p>${full?"Потрачен полный ход.":"Передвижение потрачено на перезарядку."} Доступно снова в начале следующего хода.</p>`,
    flags:{[SYSTEM_ID]:{...(full?{creatureFullTurn:true}:{}),condition:{immobilized:true,expiry:"turnStart"}}}};
}
export const crossbowFullTurn = (actor,name) => game.combat?.started?[turnEffect(actor,`Полный ход: ${name}`,true)]:[];
export function movementReloadAvailable(actor,item) {
  const key=actionRoundKey(actor);
  return hasCrossbowMod(item,"windlass")&&conditionRules(actor).canMove&&(!key||actor.flags?.[SYSTEM_ID]?.crossbowMovementRound!==key);
}
export async function reloadCrossbow(actor,item,ammoId,{movement=false}={}) {
  if(!actor?.isOwner)return;
  return inventoryWrite(actor,async()=>{
    if(!isCrossbow(item)||item.actor!==actor||item.system.loaded)return;
    const quote=actionQuote(actor,{ignoreExtra:movement});
    if(movement&&!movementReloadAvailable(actor,item))throw new Error("Для перезарядки передвижением нужен улучшенный ворот и ещё не потраченное передвижение.");
    const {ammo,items}=loadUpdate(actor,item,ammoId),round=actionRoundKey(actor);
    await inventoryTransaction(actor,{updates:items,actorUpdate:{...actionUpdate(actor,quote),...(movement&&round?{[`flags.${SYSTEM_ID}.crossbowMovementRound`]:round}:{})},
      effectCreates:movement&&round?[turnEffect(actor,"Передвижение: перезарядка арбалета")]:[]});
    await consumeAiming(actor);
    await workshopNotice(actor,`<p>${esc(item.name)} заряжен: ${esc(ammo.name)} — ${movement?"передвижение":`действие${quote.extra?`; дополнительно, ${quote.stamina} ВЫН`:""}`}.</p>`);
  });
}
export async function removeCrossbowModification(target,id) {
  const actor=target.actor;if(!actor?.isOwner)return;
  return inventoryWrite(actor,async()=>{
    actionQuote(actor,{ignoreExtra:true});
    const entry=target.system.installations.find(entry=>entry.id===id&&entry.category==="crossbow");if(!entry)return;
    if(target.system.quantity!==1)throw new Error("Для снятия модификации нужен один экземпляр арбалета.");
    const source=await foundry.utils.fromUuid(entry.sourceUuid);if(!source)throw new Error("Исходная модификация недоступна в каталоге.");
    const bonus=entry.bonuses.filter(b=>b.target==="reliability").reduce((sum,b)=>sum+b.value,0);
    await inventoryTransaction(actor,{updates:[{_id:target.id,"system.installations":target.system.installations.filter(row=>row.id!==id),"system.reliability.value":Math.max(0,target.system.reliability.value-bonus)}],
      creates:[copyPhysical(source,1)],effectCreates:crossbowFullTurn(actor,"Снятие модификации")});
    await workshopNotice(actor,`<p>${esc(entry.name)} снято с ${esc(target.name)} и возвращено в инвентарь. Полный ход.</p>`);
  });
}
/** A move already made this round cannot also pay for the windlass reload. */
export function registerCrossbowMovement() {
  Hooks.on("updateToken",(token,changes,options={})=>{
    if(options.teleport||game.user!==game.users.activeGM||!token.actor||!["x","y","elevation"].some(key=>key in changes))return;
    const actor=token.actor,round=actionRoundKey(actor);
    if(!round||actor.flags?.[SYSTEM_ID]?.crossbowMovementRound===round)return;
    return inventoryWrite(actor,()=>actor.update({[`flags.${SYSTEM_ID}.crossbowMovementRound`]:round}));
  });
}
