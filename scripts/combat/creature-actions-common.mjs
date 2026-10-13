import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { attackerToken, tokenDocument, tokenCenter, tokenGap } from "./attack-target.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { circlePreview } from "../canvas/circle-preview.mjs";

export { esc };
export const creatureFlags = document => document?.flags?.[SYSTEM_ID]??{};
export const activeCreatureGM = () => Boolean(globalThis.game?.user?.isGM&&game.user===game.users?.activeGM);
export function requireCreatureGM(actor) {
  if(!activeCreatureGM())throw new Error("Особые действия существ выполняет активный ведущий.");
  if(!actor?.isOwner)throw new Error("Нет права управлять существом.");
}
export const creatureRoll = formula => evaluateRoll(formula,{allowInteractive:game.settings.get("core","messageMode")!=="blind"});
export async function creaturePost(actor,{title,text="",rolls=[],flags={},content=""}) {
  const Message=foundry.documents.ChatMessage;
  return Message.create(Message.applyMode({speaker:Message.getSpeaker({actor}),rolls,
    content:content||`<section class="witcher-attack-chat"><h3>${esc(title)}</h3><p>${text}</p></section>`,
    flags:{[SYSTEM_ID]:{skipLuck:true,...flags}}},game.settings.get("core","messageMode")));
}
export function creatureEffect(actor,status,{rounds=null,name=null,flags={},rules={}}={}) {
  const source=conditionSource(CONDITION_BY_ID[status]);delete source._id;
  if(name)source.name=name;
  source.start=fullTurnStart(actor);
  if(rounds!==null)source.duration={value:rounds,units:"rounds",expiry:"turnStart",expired:false};
  source.flags[SYSTEM_ID]={...source.flags[SYSTEM_ID],...flags,condition:{...source.flags[SYSTEM_ID].condition,...rules}};
  return source;
}
export async function addCreatureEffect(actor,source,key) {
  if((actor.effects??[]).some(effect=>creatureFlags(effect).creatureActionKey===key))return null;
  source.flags[SYSTEM_ID].creatureActionKey=key;
  return actor.createEmbeddedDocuments("ActiveEffect",[source]);
}
export async function markCreatureFullTurn(actor,name,key) {
  if(!game.combat?.started)return;
  const source={name:`Полный ход: ${name}`,type:"base",system:{},img:"icons/svg/clockwork.svg",statuses:[],
    description:"<p>Действие полного хода выполнено. Новые действия доступны в начале следующего хода.</p>",
    start:fullTurnStart(actor),duration:{value:1,units:"rounds",expiry:"turnStart",expired:false},
    flags:{[SYSTEM_ID]:{creatureFullTurn:true}}};
  await addCreatureEffect(actor,source,key);
}
export function creatureTargets(actor,options={}) {
  const source=options.sourceToken??attackerToken(actor),scene=source.parent;
  const chosen=options.targets??Array.from(game.user.targets??[]);
  const targets=chosen.map(tokenDocument).filter(target=>target.actor&&target.parent?.id===scene?.id&&target.uuid!==source.uuid);
  if(targets.length!==chosen.length)throw new Error("Выберите другие существа на той же сцене.");
  return {source,scene,targets};
}
export function creaturesInRadius(source,radius) {
  return Array.from(source.parent?.tokens??[]).filter(token=>token.actor&&token.uuid!==source.uuid&&tokenGap(source,token)<=radius);
}
export const centerDistance = (a,b,scene) => Math.hypot(a.x-b.x,a.y-b.y)/scene.grid.size*scene.grid.distance;
export async function pickCreaturePoint(source,{destination=null,max=Infinity,min=0,title="Выберите точку на сцене",throughWalls=false,previewRadius=0}={}) {
  const center=tokenCenter(source),scene=source.parent;
  let point=destination;
  if(!point) {
    ui.notifications.info(`${title}. Щёлкните по сцене; Esc — отмена.`);
    point=await new Promise(resolve=>{
      const stage=canvas.stage, clearPreview=previewRadius>0?circlePreview(scene,center,previewRadius):()=>{};
      const finish=value=>{stage.off("pointerdown",click);document.removeEventListener("keydown",key);Hooks.off("canvasTearDown",teardown);clearPreview();resolve(value);};
      const click=event=>{if(event.button===0)finish({x:event.global.x,y:event.global.y,...event.getLocalPosition(stage)});else if(event.button===2)finish(null);};
      const key=event=>{if(event.key==="Escape")finish(null);};
      const teardown=Hooks.on("canvasTearDown",()=>finish(null));
      stage.on("pointerdown",click);document.addEventListener("keydown",key);
    });
  }
  if(!point)return null;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw new Error("Некорректная точка назначения.");
  const distance=centerDistance(center,point,scene);
  if(distance>max+0.001||distance<min)throw new Error(`Расстояние должно быть от ${min} до ${max} м.`);
  if(!throughWalls&&source.object?.checkCollision(point,{origin:center,type:"move",mode:"any"}))throw new Error("Путь пересекает преграду.");
  return point;
}
export async function moveCreatureTo(source,point) {
  const size=source.getSize();
  await source.update({x:Math.round(point.x-size.width/2),y:Math.round(point.y-size.height/2)});
}
export function liveCreatureWeb(actor) {
  return (actor.effects??[]).find(effect=>activeEffect(effect)&&creatureFlags(effect).creatureWeb)??null;
}
