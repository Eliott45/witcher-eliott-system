import { SYSTEM_ID } from "../config.mjs";
import { PEASANT_SOURCE } from "../data/peasant-profession.mjs";
import { PEASANT_STEWS, peasantEffect } from "../data/peasant-rules.mjs";
import { conditionSource, CONDITION_BY_ID } from "../data/condition-definitions.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { consumptionPlan } from "../data/consumables.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction } from "./transaction.mjs";
import { workshopCheck, workshopNotice } from "./check.mjs";
import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";

export function peasantEffectSource(kind,name,level,{modifiers=[],seconds=86400,description="",dc=0}={}) {
  const source=conditionSource({id:`peasant.${kind}`,name,img:"icons/svg/upgrade.svg",description,rules:{...(seconds?{seconds}:{}),modifiers}});
  delete source._id;source.statuses=[];
  source.flags[SYSTEM_ID].peasant={kind,level,dc};
  source.flags[SYSTEM_ID].consumable={ruleId:`peasant.${kind}`,toxicity:0,category:"peasant"};
  return source;
}
export function peasantProduct(kind,name,level,{quantity=1,dc=0,description="",expires=null}={}) {
  return {name,type:"equipment",img:"icons/svg/item-bag.svg",system:{ruleId:`peasant.product.${kind}`,kind:"gear",quantity,carried:true,weight:.5,price:0,source:PEASANT_SOURCE,consumption:{mode:"consume"},
    description:`<p>${esc(description)}</p><p>Уровень изготовителя: ${level}${dc?`; СЛ ${dc}`:""}.</p><p><small>${PEASANT_SOURCE}</small></p>`},flags:{[SYSTEM_ID]:{peasantProduct:{kind,level,dc,expires}}}};
}
const statusSource=(status)=>{const source=conditionSource(CONDITION_BY_ID[status],key=>game.i18n.localize(key));delete source._id;return source;};
export async function usePeasantProduct(item) {
  const actor=item.actor,data=item.flags?.[SYSTEM_ID]?.peasantProduct;
  if(!actor?.isOwner||!data)return;
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:item.name},content:`<p>Использовать одну порцию: <b>${esc(item.name)}</b>?</p>${item.system.description}`,rejectClose:false});
  if(!confirmed)return;
  return inventoryWrite(actor,async()=>{
    if(!conditionRules(actor).canAct)throw new Error("Персонаж сейчас не может использовать предмет.");
    const plan=consumptionPlan(item),{kind,level,dc}=data,effects=[],remove=[],updates=[];
    if(data.expires!==null&&data.expires<=game.time.worldTime)throw new Error("Панацея испортилась: с изготовления прошли сутки.");
    if(kind==="panacea"){
      const roll=await evaluateRoll("1d100",{allowInteractive:game.settings.get("core","messageMode")!=="blind"});
      const message=await roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor:`Панацея: шанс ${level*5}%`,flags:{[SYSTEM_ID]:{skipLuck:true}}},{messageMode:game.settings.get("core","messageMode")});
      if(!message)return;
      if(roll.total<=level*5)remove.push(...actor.effects.filter(effect=>activeEffect(effect)&&["poisoned","intoxicated","nauseated"].some(status=>effect.statuses.has(status))).map(effect=>effect.id));
      await workshopNotice(actor,`<p>Панацея: ${roll.total<=level*5?"успех — отравление, опьянение и тошнота сняты":"не помогла"}.</p>`);
    } else if(kind==="grog"){
      if(!(await workshopCheck(actor,{name:item.name,skill:"endurance",dc})).success){
        const effect=statusSource("intoxicated");effect.name=level>=5?"Грог: сильное опьянение":"Грог: опьянение";
        if(level>=5)for(const modifier of effect.flags[SYSTEM_ID].condition.modifiers)modifier.value*=2;
        remove.push(...actor.effects.filter(e=>activeEffect(e)&&e.statuses.has("intoxicated")).map(e=>e.id));effects.push(effect);
      }
    } else if(kind.startsWith("stew.")){
      const recipe=PEASANT_STEWS.find(row=>`stew.${row.id}`===kind);
      if(!recipe)throw new Error("Неизвестный рецепт рагу.");
      const modifiers=recipe.id==="spring"?[{target:"skills.seduction",value:Math.floor(level/2)},{target:"skills.endurance",value:level*3}]:[];
      const source=peasantEffectSource(kind,item.name,level,{modifiers,description:recipe.description,dc});
      if(recipe.id==="mothers"){
        if(!immuneToCondition(actor,["nauseated"])){
          source.statuses=["nauseated"];source.flags[SYSTEM_ID].condition={...source.flags[SYSTEM_ID].condition,nausea:{every:3},save:{kind:"skill",skill:"endurance",dc,action:"Обычное действие",ends:true}};
        }
      }
      if(recipe.id==="broth")for(const effect of actor.effects){
        const wound=effect.flags?.[SYSTEM_ID]?.criticalWound,prior=effect.flags?.[SYSTEM_ID]?.peasantBrothReduction??0;
        const reduction=Math.max(1,Math.floor(level/2)),extra=Math.max(0,reduction-prior);
        if(wound?.state==="treated"&&wound.recoveryDays>0&&extra)updates.push({_id:effect.id,[`flags.${SYSTEM_ID}.criticalWound.recoveryDays`]:Math.max(1,wound.recoveryDays-extra),[`flags.${SYSTEM_ID}.peasantBrothReduction`]:reduction});
      }
      if(recipe.id==="winter")remove.push(...actor.effects.filter(e=>activeEffect(e)&&e.statuses.has("frozen")).map(e=>e.id));
      effects.push(source);
    } else if(kind==="talisman"){
      if(peasantEffect(actor,"talisman"))throw new Error("Один талисман уже действует. Его Удача расходуется отдельно; талисманы не складываются.");
      effects.push(peasantEffectSource(kind,"Талисман: следующая проверка",level,{seconds:0,description:`Следующая проверка с Удачей получает +${level}. Эффект расходуется целиком после броска и не восстанавливается.`,dc:0}));
    } else if(kind==="wreath")effects.push(peasantEffectSource(kind,"Венок из трав: память",level,{description:"Пока венок надет, помните всё происходящее в течение суток. Снимите эффект, если сняли венок."}));
    else if(kind==="totem"){
      if(!game.user.isGM)throw new Error("Тотем при себе срабатывает автоматически рядом с отмеченной порчей или проклятым существом. Для сюжетного проклятия ведущий может подтвердить почернение вручную.");
      const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:"Раскрытие чёрной магии"},content:"<p>В пределах 5 м находится проклятое существо или жертва порчи? Подтверждение превратит один тотем в почерневший.</p>",rejectClose:false});
      if(!confirmed)return;
      return (await import("../combat/peasant-totems.mjs")).blackenTotem(actor,item);
    } else if(kind==="cleaner")await workshopNotice(actor,"<p>Кровоочиститель удаляет пятна крови с объёма до 5 м³.</p>");
    else throw new Error("Неизвестный крестьянский предмет.");
    const creates=[];
    for(const effect of effects){
      const previous=peasantEffect(actor,effect.flags?.[SYSTEM_ID]?.peasant?.kind)
        ?? actor.effects.find(old=>activeEffect(old)&&effect.statuses.some(status=>old.statuses.has(status)));
      if(previous){
        // Updating the existing status avoids Foundry's duplicate-status preCreate guard.
        const seconds=effect.flags[SYSTEM_ID].condition.seconds;
        updates.push({_id:previous.id,...effect,start:foundry.documents.ActiveEffect.getEffectStart(),duration:{value:seconds??null,units:"seconds",expiry:seconds?"turnEnd":null,expired:false}});
        for(let i=remove.length-1;i>=0;i--)if(remove[i]===previous.id)remove.splice(i,1);
      }else creates.push(effect);
    }
    await inventoryTransaction(actor,{...plan,effectCreates:creates,effectDeletes:[...new Set(remove)],effectUpdates:updates});
  });
}
