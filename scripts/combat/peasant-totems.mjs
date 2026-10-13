import { SYSTEM_ID } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { available } from "../data/workshop.mjs";
import { tokenGap } from "./attack-target.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction } from "../workshop/transaction.mjs";
import { consumptionPlan } from "../data/consumables.mjs";
import { workshopNotice } from "../workshop/check.mjs";

export const cursedForTotem = actor => actor?.system.creature?.category === "cursed"
  || Array.from(actor?.effects ?? []).some(effect => activeEffect(effect) && effect.flags?.[SYSTEM_ID]?.hexEffect);
/** Caller holds the inventory queue. Keep the physical, now inert totem. */
export async function blackenTotem(actor,item) {
  if(item.flags?.[SYSTEM_ID]?.peasantProduct?.kind!=="totem"||!available(item))return;
  await inventoryTransaction(actor,{...consumptionPlan(item),creates:[{name:"Почерневший тотем",type:"equipment",img:"icons/svg/oak.svg",
    system:{kind:"gear",quantity:1,weight:.5,source:"Фургончик Родольфа",description:"<p>Обнаружил чёрную магию и почернел. Повторно не срабатывает.</p>"}}]});
  await workshopNotice(actor,"<p>Тотем почернел: в пределах 5 м есть проклятое существо или жертва порчи.</p>");
}
export function registerPeasantTotems() {
  const check = async scene => {
    if(!game.users.activeGM?.isSelf||!scene)return;
    const targets=Array.from(scene.tokens).filter(token=>cursedForTotem(token.actor));
    if(!targets.length)return;
    const seen=new Set();
    for(const token of scene.tokens){
      const actor=token.actor;
      if(!actor||seen.has(actor.uuid)||!targets.some(target=>tokenGap(token,target)<=5))continue;
      seen.add(actor.uuid);
      await inventoryWrite(actor,async()=>{
        for(const item of actor.items)if(item.flags?.[SYSTEM_ID]?.peasantProduct?.kind==="totem"&&available(item)){
          // Every intact totem in this stack reacts once; blackenTotem spends exactly one.
          const quantity=item.system.quantity;
          for(let i=0;i<quantity;i++)await blackenTotem(actor,item);
        }
      });
    }
  };
  const run=scene=>check(scene).catch(error=>{console.error(error);ui.notifications.warn(error.message);});
  Hooks.on("updateToken",token=>run(token.parent));Hooks.on("createToken",token=>run(token.parent));
  const changed=document=>{if(document.parent?.documentName==="Actor")run(globalThis.canvas?.scene);};
  Hooks.on("createActiveEffect",changed);Hooks.on("updateActiveEffect",changed);
  Hooks.on("createItem",changed);Hooks.on("updateItem",changed);
}
