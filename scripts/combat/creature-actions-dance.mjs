import { SYSTEM_ID } from "../config.mjs";
import { tokenGap, tokenCenter } from "./attack-target.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { creatureFlags, activeCreatureGM, requireCreatureGM, creatureTargets, pickCreaturePoint, creaturePost, centerDistance, esc } from "./creature-actions-common.mjs";

export const noonCopyState = token => creatureFlags(token).noonCopy??creatureFlags(token?.actor).noonCopy??null;
/** "noon" — the noonwraith's dance (only defends); "fog" — the foglet's illusions (act, but their hits deal no damage). */
export const copyKind = state => state?.kind??"noon";
const copiesOf = (scene,actor,kind) => Array.from(scene?.tokens??[]).filter(token=>noonCopyState(token)?.sourceActor===actor.uuid&&copyKind(noonCopyState(token))===kind);
export function nearestDanceVictim(copy,sourceUuid) {
  return Array.from(copy.parent?.tokens??[]).filter(token=>token.actor&&token.uuid!==copy.uuid&&token.actor.uuid!==sourceUuid&&!noonCopyState(token)
    &&!token.actor.effects.some(effect=>activeEffect(effect)&&effect.statuses.has("dead")))
    .map(token=>({token,distance:tokenGap(copy,token)})).sort((a,b)=>a.distance-b.distance||a.token.uuid.localeCompare(b.token.uuid))[0]?.token??null;
}

/** Three unlinked tokens share one disposable Actor with the source's defense statistics. */
export async function createNoonDance(actor,options={}) {
  requireCreatureGM(actor);
  const {source,scene,targets}=creatureTargets(actor,options);
  if(targets.length!==1)throw new Error("Выберите одну цель: каждая копия должна появиться не ближе 5 м от неё.");
  if(copiesOf(scene,actor,"noon").length)throw new Error("Сначала уничтожьте существующие копии полуденницы.");
  const points=[];
  for(let index=0;index<3;index++) {
    const point=await pickCreaturePoint(source,{destination:options.positions?.[index],throughWalls:true,title:`Полуденный танец: место копии ${index+1}/3`});
    if(!point)return null;
    // Measure edges, exactly like attacks; a large victim must not be overlapped by the copy.
    const gap=centerDistance(point,tokenCenter(targets[0]),scene)-(Math.max(source.width??1,source.height??1)+Math.max(targets[0].width??1,targets[0].height??1))*scene.grid.distance/2;
    if(gap<5)throw new Error("Копия должна появиться не ближе 5 м от цели.");
    points.push(point);
  }
  await spawnCopies(actor,source,scene,points,{kind:"noon",name:index=>`${actor.name}: копия ${index+1}`});
  return creaturePost(actor,{title:"Полуденный танец",text:"Созданы три копии. Они не атакуют; успешное попадание уничтожает копию. В начале хода полуденницы каждая вытягивает 3 ПЗ у ближайшего существа."});
}

/** Unlinked tokens sharing one disposable Actor with the source's weapons and defenses, one HP and no loot. */
async function spawnCopies(actor,source,scene,points,{kind,name}) {
  const data=actor.toObject();delete data._id;delete data._stats;delete data.folder;
  // Foglet copies must look exactly like it; the GM tells them apart by the copy flag.
  data.name=kind==="fog"?actor.name:`Копия: ${actor.name}`;data.effects=[];
  data.items=data.items.filter(item=>item.type==="weapon");
  data.system.health={value:1,max:1};data.system.creature={...data.system.creature,healthMax:1,naturalArmor:0,loot:[],lootGenerated:true,lore:[],invisible:false};
  data.system.harvest=[];
  const state={sourceActor:actor.uuid,sourceToken:source.uuid,...(kind==="noon"?{}:{kind})};
  data.flags={ [SYSTEM_ID]:{noonCopy:{...state,scene:scene.id}} };
  const copyActor=await foundry.documents.Actor.implementation.create(data);
  if(!copyActor)throw new Error("Не удалось создать копии.");
  try {
    const prototype=copyActor.prototypeToken.toObject(),size=source.getSize();
    const created=await scene.createEmbeddedDocuments("Token",points.map((point,index)=>{
      const token={...prototype,actorId:copyActor.id,actorLink:false,name:name(index),x:Math.round(point.x-size.width/2),y:Math.round(point.y-size.height/2),
        width:source.width,height:source.height,flags:{[SYSTEM_ID]:{noonCopy:{...state,templateActor:copyActor.id}}}};
      delete token._id;return token;
    }));
    if(created.length!==points.length)throw new Error("Созданы не все копии.");
    return created;
  } catch(error) {
    const ids=Array.from(scene.tokens).filter(token=>token.actorId===copyActor.id).map(token=>token.id);
    if(ids.length)await scene.deleteEmbeddedDocuments("Token",ids);
    await copyActor.delete();throw error;
  }
}

/** Monster Hunter's Journal p.19: four copies placed inside the fog, indistinguishable from the foglet. */
export async function createFogCopies(actor,options={}) {
  requireCreatureGM(actor);
  const source=options.sourceToken,scene=source.parent;
  if(copiesOf(scene,actor,"fog").length)throw new Error("Сначала развейте существующие копии туманника.");
  const points=[];
  for(let index=0;index<4;index++) {
    const point=await pickCreaturePoint(source,{destination:options.positions?.[index],throughWalls:true,title:`Иллюзорные копии: место копии ${index+1}/4`});
    if(!point)return null;
    if(options.inFog&&!options.inFog(point))throw new Error("Копия должна появиться в тумане.");
    points.push(point);
  }
  await spawnCopies(actor,source,scene,points,{kind:"fog",name:()=>source.name??actor.name});
  return creaturePost(actor,{title:"Иллюзорные копии",text:`Созданы четыре неотличимые копии. В начале хода туманника каждая перемещается и действует; защита от них считается обычной защитой, но их попадания не наносят урона. Любое попадание развеивает копию. Внимание СЛ ${options.dc??16} распознаёт иллюзию.`});
}

/** Remove every copy of one kind made by this actor, with their disposable Actors. */
export async function dismissCopies(actor,kind) {
  if(!activeCreatureGM())return;
  for(const scene of game.scenes??[]) for(const token of copiesOf(scene,actor,kind))await destroyNoonCopy(token);
}

/** Called for an actual hit, before damage/immunity: one hit destroys a copy regardless of damage. */
export async function destroyNoonCopy(token) {
  if(!activeCreatureGM()||!token||!noonCopyState(token))return false;
  const templateId=noonCopyState(token).templateActor??token.actorId,scene=token.parent;
  await scene.deleteEmbeddedDocuments("Token",[token.id]);
  const remains=Array.from(game.scenes??[]).some(scene=>Array.from(scene.tokens??[]).some(token=>token.actorId===templateId));
  const template=game.actors.get(templateId);
  if(!remains&&creatureFlags(template).noonCopy)await template.delete();
  return true;
}

/** One tick per surviving copy in its creator's turn; HP and each receipt are persisted together. */
export function tickNoonDance(combat,combatant,context={}) {
  if(!activeCreatureGM()||!combat?.started||context.skipped||!(context.round??combat.round))return;
  const actor=combatant?.actor;if(!actor?.isOwner)return;
  const scene=combat.scene??globalThis.canvas?.scene;
  const copies=copiesOf(scene,actor,"noon");
  if(!copies.length)return;
  return inventoryWrite(actor,async()=>{
    if(actor.effects.some(effect=>activeEffect(effect)&&effect.statuses.has("dead")))return;
    const round=context.round??combat.round;
    for(const copy of copies) {
      const key=`${combat.id}:${round}:${copy.id}`,state=creatureFlags(copy).danceTick;
      if(state?.key===key&&state.done)continue;
      let victim=state?.key===key?(globalThis.fromUuidSync?.(state.victim)??scene.tokens.find(token=>token.uuid===state.victim)):nearestDanceVictim(copy,actor.uuid);
      if(!victim?.actor?.isOwner)continue;
      if(state?.key!==key)await copy.update({[`flags.${SYSTEM_ID}.danceTick`]:{key,victim:victim.uuid,done:false}});
      const target=victim.actor;
      if(!creatureFlags(target).noonDrainReceipts?.includes(key)) {
        await inventoryWrite(target,()=>target.update({"system.health.value":target.system.health.value-3,
          [`flags.${SYSTEM_ID}.noonDrainReceipts`]:[...(creatureFlags(target).noonDrainReceipts??[]).slice(-49),key]}));
      }
      if(!creatureFlags(actor).noonHealReceipts?.includes(key))await actor.update({"system.health.value":Math.min(actor.system.health.max,actor.system.health.value+3),
        [`flags.${SYSTEM_ID}.noonHealReceipts`]:[...(creatureFlags(actor).noonHealReceipts??[]).slice(-49),key]});
      await copy.update({[`flags.${SYSTEM_ID}.danceTick.done`]:true});
      await creaturePost(actor,{title:"Полуденный танец",text:`${esc(copy.name)} вытягивает 3 ПЗ у ${esc(target.name)}; полуденница восстанавливает до 3 ПЗ.`});
    }
  });
}
