import { SYSTEM_ID } from "../config.mjs";
import { attackerToken, tokenCenter } from "./attack-target.mjs";
import { pickCreaturePoint } from "./creature-actions-common.mjs";
import { crossesMarbles } from "./radolf-marbles.mjs";
import { peasantRank } from "../data/peasant-rules.mjs";
import { skillValue } from "../data/skills.mjs";
import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { serialQueue } from "../data/serial-queue.mjs";

export async function choosePeasantCircle(actor){
  if(!game.users.activeGM)throw new Error("Для круга нужен подключённый мастер.");
  const token=attackerToken(actor),point=await pickCreaturePoint(token,{previewRadius:20,title:"Выберите центр круга от вредителей"});
  return point?{actor,scene:token.parent,point,elevation:token.elevation??0}:null;
}
async function createRegion({scene,point,elevation},dc){
  const radius=20/scene.grid.distance*scene.grid.size;
  const [region]=await scene.createEmbeddedDocuments("Region",[{name:`Круг от вредителей · Стойкость СЛ ${dc}`,color:"#6f9544",visibility:2,
    shapes:[{type:"ellipse",x:point.x,y:point.y,radiusX:radius,radiusY:radius,rotation:0,hole:false,gridBased:false}],flags:{[SYSTEM_ID]:{peasantCircle:{dc,elevation}}}}]);
  return region;
}
export async function createPeasantCircle(choice,dc){
  if(game.users.activeGM?.isSelf)return createRegion(choice,dc);
  const actor=choice.actor,id=foundry.utils.randomID();let hook,timer;
  const pending=new Promise((resolve,reject)=>{
    hook=Hooks.on("updateActor",updated=>{
      if(updated.uuid!==actor.uuid)return;
      const answer=updated.flags?.[SYSTEM_ID]?.peasantCircleResult;
      if(answer?.id===id)answer.error?reject(new Error(answer.error)):resolve(answer.uuid);
    });
    timer=setTimeout(()=>reject(new Error("Мастер не ответил на размещение круга. Компоненты сохранены.")),30000);
  });pending.catch(()=>{});
  try{
    await actor.update({[`flags.${SYSTEM_ID}.peasantCircleRequest`]:{id,user:game.user.id,scene:choice.scene.id,point:choice.point,elevation:choice.elevation,dc,until:Date.now()+30000}});
    const uuid=await pending;
    return {delete:()=>actor.update({[`flags.${SYSTEM_ID}.peasantCircleRequest`]:{id,user:game.user.id,remove:uuid}})};
  }catch(error){
    await actor.update({[`flags.${SYSTEM_ID}.peasantCircleRequest`]:{id,user:game.user.id,cancel:true}});
    throw error;
  }finally{Hooks.off("updateActor",hook);clearTimeout(timer);}
}
export function circleEntry(region,from,to,elevation=0){
  const data=region.flags?.[SYSTEM_ID]?.peasantCircle,shape=region.shapes?.[0];
  if(!data||!shape||Math.abs(elevation-data.elevation)>.01)return false;
  if(((from.x-shape.x)/shape.radiusX)**2+((from.y-shape.y)/shape.radiusY)**2<=1)return false;
  return crossesMarbles({shapes:region.shapes,flags:{[SYSTEM_ID]:{marbles:{elevation:data.elevation}}}},from,to,elevation);
}
export function registerPeasantCircle(){
  const positions=new Map(),queue=serialQueue();
  const remember=token=>positions.set(token.uuid,{x:token.x,y:token.y,center:tokenCenter(token)});
  Hooks.once("ready",()=>{for(const scene of game.scenes)for(const token of scene.tokens)remember(token);});
  Hooks.on("createToken",remember);Hooks.on("deleteToken",token=>positions.delete(token.uuid));
  Hooks.on("updateToken",(token,changes,options)=>{
    const before=positions.get(token.uuid);remember(token);
    if(!game.users.activeGM?.isSelf||!before||options?.peasantRepelled||!("x"in changes||"y"in changes)||!["beast","insectoid"].includes(token.actor?.system.creature?.category))return;
    const after=tokenCenter(token),regions=Array.from(token.parent.regions).filter(region=>circleEntry(region,before.center,after,token.elevation??0));
    if(!regions.length)return;
    queue(token.uuid,async()=>{
      const base=skillValue(token.actor.system,"endurance")?.total;if(base==null)return;
      for(const region of regions){
        const dc=region.flags[SYSTEM_ID].peasantCircle.dc,roll=await evaluateRoll(`1d10wc + ${base}`);
        const message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor:token.actor}),flavor:`Круг от вредителей · Стойкость СЛ ${dc}`},{messageMode:game.settings.get("core","messageMode")});
        if(!message||message.rolls[0].total<dc){
          const current=tokenCenter(token);
          if(current.x===after.x&&current.y===after.y)await token.update({x:before.x,y:before.y},{peasantRepelled:true});
          break;
        }
      }
    }).catch(error=>{console.error(error);ui.notifications.warn(error.message);});
  });
  Hooks.on("updateActor",(actor,changes,_options,userId)=>{
    const request=changes.flags?.[SYSTEM_ID]?.peasantCircleRequest;
    if(!request||!game.users.activeGM?.isSelf)return;
    queue(actor.uuid,async()=>{
      const user=game.users.get(userId);if(request.user!==userId||!user||!actor.testUserPermission(user,"OWNER"))return;
      if(request.cancel){
        for(const scene of game.scenes)for(const region of scene.regions??[])if(region.flags?.[SYSTEM_ID]?.peasantCircle?.request===request.id&&region.flags[SYSTEM_ID].peasantCircle.actor===actor.uuid)await region.delete();
        return;
      }
      if(request.remove){const region=await fromUuid(request.remove);if(region?.flags?.[SYSTEM_ID]?.peasantCircle?.request===request.id&&region.flags[SYSTEM_ID].peasantCircle.actor===actor.uuid)await region.delete();return;}
      let result;
      try{
        const scene=game.scenes.get(request.scene);
        if(!scene||!peasantRank(actor,"wisdom")||!Number.isFinite(request.until)||request.until<Date.now()||!Number.isFinite(request.dc)||request.dc<14||!Number.isFinite(request.point?.x)||!Number.isFinite(request.point?.y))throw new Error("Некорректный запрос на круг.");
        const region=await createRegion({scene,point:request.point,elevation:request.elevation??0},request.dc);
        await region.update({[`flags.${SYSTEM_ID}.peasantCircle.request`]:request.id,[`flags.${SYSTEM_ID}.peasantCircle.actor`]:actor.uuid});result={uuid:region.uuid};
        if(request.until<Date.now()||actor.flags?.[SYSTEM_ID]?.peasantCircleRequest?.cancel){await region.delete();throw new Error("Размещение круга отменено; компоненты сохранены.");}
      }catch(error){result={error:error.message};}
      await actor.update({[`flags.${SYSTEM_ID}.peasantCircleResult`]:{id:request.id,...result}});
    }).catch(console.error);
  });
}
