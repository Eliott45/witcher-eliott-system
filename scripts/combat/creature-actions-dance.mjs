import { SYSTEM_ID } from "../config.mjs";
import { tokenGap, tokenCenter } from "./attack-target.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { creatureFlags, activeCreatureGM, requireCreatureGM, creatureTargets, pickCreaturePoint, creaturePost, centerDistance, esc } from "./creature-actions-common.mjs";

export const noonCopyState = token => creatureFlags(token).noonCopy??creatureFlags(token?.actor).noonCopy??null;
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
  if(Array.from(scene.tokens).some(token=>noonCopyState(token)?.sourceActor===actor.uuid))throw new Error("Сначала уничтожьте существующие копии полуденницы.");
  const points=[];
  for(let index=0;index<3;index++) {
    const point=await pickCreaturePoint(source,{destination:options.positions?.[index],throughWalls:true,title:`Полуденный танец: место копии ${index+1}/3`});
    if(!point)return null;
    // Measure edges, exactly like attacks; a large victim must not be overlapped by the copy.
    const gap=centerDistance(point,tokenCenter(targets[0]),scene)-(Math.max(source.width??1,source.height??1)+Math.max(targets[0].width??1,targets[0].height??1))*scene.grid.distance/2;
    if(gap<5)throw new Error("Копия должна появиться не ближе 5 м от цели.");
    points.push(point);
  }
  const data=actor.toObject();delete data._id;delete data._stats;delete data.folder;
  data.name=`Копия: ${actor.name}`;data.effects=[];
  data.items=data.items.filter(item=>item.type==="weapon");
  data.system.health={value:1,max:1};data.system.creature={...data.system.creature,healthMax:1,naturalArmor:0,loot:[],lootGenerated:true,lore:[]};
  data.system.harvest=[];
  data.flags={ [SYSTEM_ID]:{noonCopy:{sourceActor:actor.uuid,sourceToken:source.uuid,scene:scene.id}} };
  const copyActor=await foundry.documents.Actor.implementation.create(data);
  if(!copyActor)throw new Error("Не удалось создать копии полуденницы.");
  try {
    const prototype=copyActor.prototypeToken.toObject(),size=source.getSize();
    const created=await scene.createEmbeddedDocuments("Token",points.map((point,index)=>{
      const token={...prototype,actorId:copyActor.id,actorLink:false,name:`${actor.name}: копия ${index+1}`,x:Math.round(point.x-size.width/2),y:Math.round(point.y-size.height/2),
        width:source.width,height:source.height,flags:{[SYSTEM_ID]:{noonCopy:{sourceActor:actor.uuid,sourceToken:source.uuid,templateActor:copyActor.id}}}};
      delete token._id;return token;
    }));
    if(created.length!==3)throw new Error("Созданы не все копии полуденницы.");
    return creaturePost(actor,{title:"Полуденный танец",text:"Созданы три копии. Они не атакуют; успешное попадание уничтожает копию. В начале хода полуденницы каждая вытягивает 3 ПЗ у ближайшего существа."});
  } catch(error) {
    const ids=Array.from(scene.tokens).filter(token=>token.actorId===copyActor.id).map(token=>token.id);
    if(ids.length)await scene.deleteEmbeddedDocuments("Token",ids);
    await copyActor.delete();throw error;
  }
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
  const copies=Array.from(scene?.tokens??[]).filter(token=>noonCopyState(token)?.sourceActor===actor.uuid);
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
