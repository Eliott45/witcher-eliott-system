import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction } from "../workshop/transaction.mjs";
import { dose, temporaryHealth } from "../workshop/witcher-elixirs.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { creatureEffectImmunity } from "./creature-spirits.mjs";

const flags=document=>document?.flags?.[SYSTEM_ID]??{};
/** The same damage reactions as sufferDamage, committed with armor/effects and an idempotency receipt. */
export function applyCreatureDamage(actor,result,key,{effects=[]}={}) {
  return inventoryWrite(actor,async()=>{
    if(flags(actor).creatureReceipts?.includes(key))return false;
    const total=result.immune?0:Math.max(0,result.total),updates=[],effectUpdates=[];
    const actorUpdate={ [`flags.${SYSTEM_ID}.creatureReceipts`]:[...(flags(actor).creatureReceipts??[]).slice(-99),key] };
    for(const id of result.ablate??[]) {
      if(id==="natural")actorUpdate["system.creature.naturalArmor"]=Math.max(0,actor.system.creature.naturalArmor-1);
      else {const item=actor.items.get(id);if(item?.system.stoppingPower?.value>0)updates.push({_id:id,"system.stoppingPower.value":item.system.stoppingPower.value-1});}
    }
    const reaction=(effect,patch)=>{if(effect)effectUpdates.push({_id:effect.id,[`flags.${SYSTEM_ID}.elixirState`]:{...flags(effect).elixirState,...patch}});};
    let absorbed=0;
    if(total>0) {
      const moon=dose(actor,"potion.full-moon");absorbed=moon?Math.min(temporaryHealth(actor),total):0;
      if(absorbed)reaction(moon,{temporary:temporaryHealth(actor)-absorbed});
      reaction(dose(actor,"potion.swallow"),{hitSince:true});
      const griffin=dose(actor,"decoction.griffin");if(griffin&&total>5)reaction(griffin,{armor:(flags(griffin).elixirState?.armor??0)+2});
      const wyvern=dose(actor,"decoction.wyvern");if(wyvern&&flags(wyvern).elixirState?.bonus)reaction(wyvern,{bonus:0});
    }
    actorUpdate["system.health.value"]=actor.system.health.value-total+absorbed;
    const effectCreates=effects.filter(source=>!immuneToCondition(actor,source.statuses??[])&&!creatureEffectImmunity(actor,source)
      &&!actor.effects.some(effect=>activeEffect(effect)&&Array.from(source.statuses??[]).some(status=>effect.statuses.has(status))));
    await inventoryTransaction(actor,{updates,effectUpdates,effectCreates,actorUpdate});
    if(total>0){const {onCreatureDamaged}=await import("./creature-modes.mjs");await onCreatureDamaged(actor,total);}
    return {total,absorbed};
  });
}
