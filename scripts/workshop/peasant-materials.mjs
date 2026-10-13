import { available } from "../data/workshop.mjs";
import { plantIngredient } from "../data/peasant-rules.mjs";
import { MATERIALS } from "../data/workshop-materials.mjs";
import { CORE_EQUIPMENT } from "../data/core-equipment.mjs";
import { SUBSTANCES } from "../data/workshop.mjs";

/** One shared remaining-quantity ledger prevents ingredients paying for two requirements. */
export function peasantMaterialPlan(actor, recipe) {
  const items=Array.from(actor.items).filter(available).sort((a,b)=>Number(a.system.ruleId?.startsWith("substance."))-Number(b.system.ruleId?.startsWith("substance."))||a.name.localeCompare(b.name,"ru"));
  const remaining=new Map(items.map(item=>[item.id,item.system.quantity])),expenses=new Map(),missing=[];
  const take=(count,predicate,label,distinct=false)=>{
    const kinds=new Set();
    for(const item of items){
      if(!predicate(item)||!(remaining.get(item.id)>0)||distinct&&kinds.has(item.system.ruleId))continue;
      const amount=Math.min(count,distinct?1:remaining.get(item.id));
      if(!amount)break;
      remaining.set(item.id,remaining.get(item.id)-amount);expenses.set(item.id,(expenses.get(item.id)||0)+amount);
      kinds.add(item.system.ruleId);count-=amount;
    }
    if(count)missing.push(`${label}: не хватает ${count}`);
  };
  for(const row of recipe.materials??[])take(row.quantity,item=>item.system.ruleId===row.id,[...MATERIALS,...CORE_EQUIPMENT].find(item=>item.id===row.id)?.name??row.id);
  for(const [substance,count] of Object.entries(recipe.substances??{}))take(count,item=>item.system.material?.substance===substance,SUBSTANCES.find(row=>row.id===substance)?.name??substance);
  if(recipe.plants)take(recipe.plants,plantIngredient,"Растительные ингредиенты");
  if(recipe.ingredients)take(recipe.ingredients,item=>Boolean(item.system.material?.substance),"Алхимические ингредиенты");
  if(recipe.distinctIngredients)take(recipe.distinctIngredients,item=>Boolean(item.system.material?.substance)&&!item.system.ruleId?.startsWith("substance."),"Разные алхимические ингредиенты",true);
  if(recipe.alcohol)take(1,item=>["gear.beer","gear.spirits","gear.wine"].includes(item.system.ruleId),"Порция алкоголя");
  return {complete:!missing.length,missing,expenses:[...expenses].map(([itemId,quantity])=>({itemId,quantity,name:actor.items.get(itemId).name}))};
}
