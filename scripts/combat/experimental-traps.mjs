import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { isCarried } from "../data/containers.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { skillValue } from "../data/skills.mjs";
import { isTrap, bombProfile, postDeviceBlast, applyBlast } from "./bombs.mjs";
import { attackerToken, tokenCenter } from "./attack-target.mjs";
import { actionQuote, actionUpdate } from "./action-economy.mjs";
import { creaturePost, esc } from "./creature-actions-common.mjs";
import { registerDragonClouds, dragonClouds, igniteDragonClouds, setCloudDrift, advanceDragonCloud } from "./dragon-clouds.mjs";

const trap = region => region.flags?.[SYSTEM_ID]?.experimentalTrap;
const activeGM = () => game.user === game.users?.activeGM;
export const installedTraps = scene => Array.from(scene?.regions ?? []).filter(region=>trap(region)&&!trap(region).triggered&&!trap(region).disarmed);
export function experimentalDeviceContext(actor) {
  const scene=actor.isToken?actor.token.parent:globalThis.canvas?.scene;
  return { isGM:Boolean(globalThis.game?.user?.isGM), traps:Array.from(actor.items??[]).filter(item=>isTrap(item)&&isCarried(item,actor.items)&&item.system.quantity>0)
    .map(item=>({id:item.id,name:item.name,quantity:item.system.quantity,radius:bombProfile(item).radius})),
    placed:game.user.isGM?installedTraps(scene).map(region=>({uuid:region.uuid,name:region.name})):[],
    clouds:game.user.isGM?dragonClouds(scene).map(region=>({uuid:region.uuid,name:region.name,drift:region.flags[SYSTEM_ID].dragonCloud.drift,direction:region.flags[SYSTEM_ID].dragonCloud.direction})):[] };
}
function configDialog(scene) {
  return foundry.applications.api.DialogV2.prompt({window:{title:"Установить ловушку"},content:`<p>Размер зоны срабатывания и СЛ определяет ведущий. Радиус взрыва берётся из описания предмета.</p>
    <label>Радиус срабатывания, м <input name="triggerRadius" type="number" min="0.1" step="0.1" value="${scene.grid.distance/2}"></label>
    <label>СЛ обнаружения <input name="noticeDC" type="number" min="1" value="14"></label><label>СЛ обезвреживания <input name="disarmDC" type="number" min="1" value="14"></label>`,
    ok:{label:"Выбрать место",callback:(_event,button)=>Object.fromEntries(new FormData(button.form))},rejectClose:false});
}
async function pickPoint(){
  ui.notifications.info("Выберите центр растяжки на сцене; Esc отменяет установку.");
  return new Promise(resolve=>{const done=value=>{canvas.stage.off("pointerdown",click);document.removeEventListener("keydown",key);resolve(value);};
    const click=event=>{if(event.button===0)done(event.getLocalPosition(canvas.stage));},key=event=>{if(event.key==="Escape")done(null);};
    canvas.stage.on("pointerdown",click);document.addEventListener("keydown",key);});
}
export async function installTrap(actor,item,{point=null,triggerRadius=null,noticeDC=null,disarmDC=null}={}) {
  if(!actor?.isOwner||!isTrap(item))return;
  if(!activeGM())throw new Error("Установку скрытой ловушки на сцене выполняет активный ведущий.");
  const token=attackerToken(actor),scene=token.parent;
  if(triggerRadius===null){const choice=await configDialog(scene);if(!choice)return;({triggerRadius,noticeDC,disarmDC}=choice);}
  triggerRadius=Number(triggerRadius);noticeDC=Number(noticeDC);disarmDC=Number(disarmDC);
  if(!Number.isFinite(triggerRadius)||triggerRadius<=0||triggerRadius>100||![noticeDC,disarmDC].every(value=>Number.isInteger(value)&&value>0&&value<=100))throw new Error("Укажите корректный радиус и целые СЛ от 1 до 100.");
  point??=await pickPoint();if(!point)return;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error("Некорректное место установки.");
  return inventoryWrite(actor,async()=>{
    const action=actionQuote(actor);
    if(!isCarried(item,actor.items)||item.system.quantity<1)throw new Error("Ловушки нет при себе.");
    const radius=triggerRadius/scene.grid.distance*scene.grid.size;
    const [region]=await scene.createEmbeddedDocuments("Region",[{name:item.name,color:"#b84237",visibility:0,
      shapes:[{type:"ellipse",x:point.x,y:point.y,radiusX:radius,radiusY:radius,rotation:0,hole:false,gridBased:false}],
      flags:{[SYSTEM_ID]:{experimentalTrap:{actor:actor.uuid,itemId:item.id,profile:bombProfile(item),noticeDC,disarmDC,triggered:false,disarmed:false}}}}]);
    try{await actor.update({...actionUpdate(actor,action),items:[{_id:item.id,"system.quantity":item.system.quantity-1}]});}
    catch(error){await region.delete();throw error;}
    return region;
  });
}
const triggering = new WeakMap();
export function triggerTrap(region) {
  if(triggering.has(region))return triggering.get(region);
  const work=(async()=>{
    const state=trap(region);if(!activeGM()||!state||state.triggered||state.disarmed)return;
    const {x,y}=region.shapes[0];
    const previous=state.blast?globalThis.fromUuidSync?.(state.blast):null;
    const message=previous??await postDeviceBlast(globalThis.fromUuidSync?.(state.actor),region.parent,{x,y},{name:region.name,profile:state.profile});
    if(!message)throw new Error("Не удалось создать карточку ловушки.");
    if(!previous)await region.update({[`flags.${SYSTEM_ID}.experimentalTrap.blast`]:message.uuid});
    await applyBlast(message);
    await region.update({[`flags.${SYSTEM_ID}.experimentalTrap.triggered`]:true});
  })();
  triggering.set(region,work);const clear=()=>triggering.delete(region);work.then(clear,clear);return work;
}
/** Segment test catches crossing a small trigger even if the token ends beyond it. */
export function crossesTrap(region,from,to) {
  const shape=region.shapes[0];if(!(shape?.radiusX>0&&shape.radiusY>0))return false;
  const a={x:(from.x-shape.x)/shape.radiusX,y:(from.y-shape.y)/shape.radiusY},b={x:(to.x-shape.x)/shape.radiusX,y:(to.y-shape.y)/shape.radiusY};
  if(a.x*a.x+a.y*a.y<=1)return false;
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/den)):0;
  return (a.x+t*dx)**2+(a.y+t*dy)**2<=1;
}
export async function checkTrap(actor,region,kind) {
  if(!actor?.isOwner||!game.user.isGM||!trap(region))return;
  const state=trap(region);if(state.triggered||state.disarmed)return;
  const key=kind==="disarm"?"trapCrafting":"awareness",dc=kind==="disarm"?state.disarmDC:state.noticeDC,action=actionQuote(actor);
  const roll=await evaluateRoll(`1d10wc + ${skillValue(actor.system,key).total+action.penalty}`),success=roll.total>=dc;
  await actor.update(actionUpdate(actor,action));
  await creaturePost(actor,{title:kind==="disarm"?"Обезвредить ловушку":"Обнаружить ловушку",rolls:[roll],text:`${esc(region.name)}: ${roll.total} против СЛ${dc} — ${success?"успех":"провал"}.`});
  if(success&&kind==="disarm")await region.update({[`flags.${SYSTEM_ID}.experimentalTrap.disarmed`]:true});
  return success;
}
export const experimentalDeviceActions = {
  installTrap:async function(_event,button){if(!this.isEditable)return;try{await installTrap(this.actor,this.actor.items.get(button.dataset.itemId));await this.render();}catch(error){ui.notifications.warn(error.message);}},
  deviceTrap:async function(_event,button){if(!this.isEditable)return;try{const region=fromUuidSync(button.dataset.region);if(button.dataset.kind==="trigger")await triggerTrap(region);else await checkTrap(this.actor,region,button.dataset.kind);await this.render();}catch(error){ui.notifications.warn(error.message);}},
  deviceCloud:async function(_event,button){if(!this.isEditable)return;try{const region=fromUuidSync(button.dataset.region),kind=button.dataset.kind;
    if(kind==="ignite")await igniteDragonClouds(region.parent,{x:region.shapes[0].x,y:region.shapes[0].y});
    else {await setCloudDrift(region,button.closest("[data-cloud-row]").querySelector("[data-cloud-drift]").value);if(kind==="move")await advanceDragonCloud(region);}await this.render();}catch(error){ui.notifications.warn(error.message);}}
};
export function registerExperimentalDevices() {
  registerDragonClouds();
  const positions=new Map();
  Hooks.on("preUpdateToken",(token,changes)=>{if(activeGM()&&("x" in changes||"y" in changes))positions.set(token.uuid,tokenCenter(token));});
  Hooks.on("updateToken",async(token,changes)=>{
    if(!activeGM()||!("x" in changes||"y" in changes))return;
    const from=positions.get(token.uuid);positions.delete(token.uuid);if(!from||!token.actor)return;
    for(const region of installedTraps(token.parent))if(crossesTrap(region,from,tokenCenter(token)))await triggerTrap(region);
  });
}
