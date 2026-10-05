import { SYSTEM_ID } from "../config.mjs";

export function effectTemplateSource(effect) {
  const data=effect.toObject?effect.toObject():structuredClone(effect);
  delete data._id;delete data.folder;delete data.ownership;
  data.transfer=false;data.start=null;data.origin=null;data.disabled=false;
  data.duration={...data.duration,expired:false};
  const flags=data.flags?.[SYSTEM_ID];
  if(flags){delete flags.conditionState;delete flags.conditionRequest;}
  return data;
}
export function effectItemSource(effect) {
  const template=effectTemplateSource(effect);
  return {name:effect.name,type:"effect",img:effect.img,system:{},effects:[template]};
}
export function initialEffectTemplate(item) {
  return {name:item.name,img:item.img,type:"base",system:{changes:[]},description:"",transfer:false,disabled:false,statuses:[],showIcon:2,
    start:null,duration:{value:null,units:"seconds",expiry:null,expired:false}};
}
export async function applyEffectItem(actor,item) {
  if(!actor.isOwner||item.type!=="effect"||!item.testUserPermission(game.user,"OBSERVER"))return null;
  const effects=Array.from(item.effects);
  if(!effects.length){ui.notifications.warn("В предмете нет шаблона эффекта.");return null;}
  return actor.createEmbeddedDocuments("ActiveEffect",effects.map(effect=>({...effectTemplateSource(effect),name:effects.length===1?item.name:effect.name,img:effects.length===1?item.img:effect.img,origin:item.uuid})));
}
