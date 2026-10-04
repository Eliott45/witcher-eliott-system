import { SYSTEM_ID } from "../config.mjs";
import { SPELL_ELEMENTS,SPELL_GRADES,SPELL_DEFENSES,spellRange,spellDuration,SPELL_RANGE_KINDS,SPELL_DURATION_KINDS } from "../data/spells.mjs";
import { focusOptions,magicRoundKey,roundSpent,castingCost } from "../magic/rules.mjs";
import { castSpell,castingQuote,learnSpell,endConcentration,resetMagicRound } from "../magic/casting.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { skillValue } from "../data/skills.mjs";
import { textField,numberField,choiceField,formFields } from "../data/structured-fields.mjs";
import { escapeTooltip as escape } from "./statistics-tooltips.mjs";

export const SPELL_ICONS={mixed:"fa-solid fa-sparkles",earth:"fa-solid fa-mountain",air:"fa-solid fa-wind",fire:"fa-solid fa-fire",water:"fa-solid fa-droplet"};
export function spellEntry(item) {
  const s=item.system;
  return {id:item.id,uuid:item.uuid,name:item.name,img:item.img,element:s.element,grade:s.grade,
    icon:SPELL_ICONS[s.element],elementLabel:SPELL_ELEMENTS[s.element],gradeLabel:SPELL_GRADES[s.grade],
    cost:s.variableCost?"½ исходной стоимости":`${s.cost} ВЫН`,range:spellRange(s.range),duration:spellDuration(s.duration),
    defense:s.defense.map(key=>SPELL_DEFENSES[key]).join(" / "),damage:s.damage,durationFormula:s.duration.formula,
    source:s.source,search:`${item.name} ${s.description} ${SPELL_ELEMENTS[s.element]}`.replace(/<[^>]*>/g," ").toLocaleLowerCase("ru")};
}
export async function magicContext(actor) {
  const roundKey=magicRoundKey(game.combat),spent=roundSpent(actor.system.magic,roundKey),vigor=actor.system.statistics.vigor;
  const items=Array.from(actor.items??[]),active=items.find(item=>item.id===actor.system.magic.sustainedId),skill=skillValue(actor.system,"spellCasting");
  const canCast=actor.isOwner&&conditionRules(actor).canAct&&skill.total!==null;
  const spells=await Promise.all(items.filter(item=>item.type==="spell").map(async item=>({...spellEntry(item),
    description:await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description,{secrets:actor.isOwner,relativeTo:item})})));
  spells.sort((a,b)=>Object.keys(SPELL_GRADES).indexOf(a.grade)-Object.keys(SPELL_GRADES).indexOf(b.grade)||a.name.localeCompare(b.name,"ru"));
  return {spells,count:spells.length,spent,vigor,remaining:Math.max(0,vigor-spent),percent:vigor?Math.min(100,spent/vigor*100):spent?100:0,
    stamina:actor.system.stamina.value,staminaMax:actor.system.stamina.max,casting:skill.total??"—",canCast:canCast&&!active,
    combat:Boolean(game.combat?.started),round:game.combat?.round,
    active:active?spellEntry(active):null,canMaintain:canCast&&Boolean(active)&&actor.system.magic.maintainedRound!==roundKey,
    elements:Object.entries(SPELL_ELEMENTS).map(([id,label])=>({id,label,icon:SPELL_ICONS[id]})),
    grades:Object.entries(SPELL_GRADES).map(([id,label])=>({id,label}))};
}

export function bindSpellFilters(root,filters={},onChange=()=>{}) {
  for(const [key,value] of Object.entries(filters))root.querySelector(`[data-magic-${key}]`).value=value;
  const refresh=()=>{
    const query=root.querySelector("[data-magic-search]").value.trim().toLocaleLowerCase("ru");
    const element=root.querySelector("[data-magic-element]").value,grade=root.querySelector("[data-magic-grade]").value;
    let count=0;
    for(const row of root.querySelectorAll("[data-spell-row]")) {
      row.hidden=!(row.dataset.search.includes(query)&&(!element||row.dataset.element===element)&&(!grade||row.dataset.grade===grade));
      if(!row.hidden)count++;
    }
    root.querySelector("[data-magic-empty]").hidden=count>0;
    root.querySelector("[data-magic-count]").textContent=count;
    onChange({search:root.querySelector("[data-magic-search]").value,element,grade});
  };
  for(const input of root.querySelectorAll("[data-magic-search], [data-magic-element], [data-magic-grade]"))input.addEventListener("input",refresh);
  refresh();
}

export function bindMagic(sheet) {
  const root=sheet.element.querySelector("[data-tab=magic].witcher-character-content");
  bindSpellFilters(root,sheet.magicFilters,state=>{sheet.magicFilters=state;});
  sheet.openSpells??=new Set();
  for(const row of root.querySelectorAll("[data-spell-row]")) {
    const details=row.querySelector("details");details.open=sheet.openSpells.has(row.dataset.spellRow);
    details.addEventListener("toggle",()=>{if(details.open)sheet.openSpells.add(row.dataset.spellRow);else sheet.openSpells.delete(row.dataset.spellRow);});
  }
}

async function castDialog(actor,item,maintenance=false) {
  if(!actor.isOwner)return;
  // TODO(Dispel): no specific odd-cost rounding was found in core/errata/Sage. Let
  // the table supply an integer cost rather than silently truncate Actor resources.
  const focuses=focusOptions(actor),cost=maintenance?item.system.duration.maintenance:item.system.cost;
  const content=`<div class="witcher-cast-dialog"><p>${escape(item.name)} · ${escape(spellDuration(item.system.duration))}</p>`
    +(!maintenance&&item.system.variableCost?'<label>Стоимость сотворения, ВЫН<input name="variableCost" type="number" min="1" step="1" value="1" required></label><small>Рассеивание: половина исходной стоимости. Укажите согласованную с ведущим стоимость целыми пунктами.</small>':"")
    +(!maintenance?`<label>Фокус в руках<select name="focus"><option value="">Без фокуса</option>${focuses.map(f=>`<option value="${f.id}">${escape(f.name)} · −${f.rating} ВЫН</option>`).join("")}</select></label>`:"")
    +'<output data-cast-quote></output><label class="witcher-overload-confirm" data-overload-row hidden><input type="checkbox" name="overload"> Сотворить с перегрузкой и получить урон</label><p data-cast-error role="alert"></p></div>';
  return foundry.applications.api.DialogV2.wait({window:{title:maintenance?"Поддержание магии":"Сотворение заклинания"},classes:["witcher-picker"],position:{width:470},content,
    buttons:[{action:"cast",label:maintenance?"Оплатить поддержание":"Сотворить",default:true,callback:async(_e,button)=>{
      const form=button.form;
      await castSpell(actor,item.id,{maintenance,cost:item.system.variableCost&&!maintenance?Number(form.elements.variableCost.value):cost,focusId:form.elements.focus?.value??"",allowOverexertion:form.elements.overload.checked});
    }},{action:"cancel",label:"Отмена"}],render:(_event,dialog)=>{
      const root=dialog.element,form=root.querySelector("form")??root;
      const refresh=()=>{
        const error=root.querySelector("[data-cast-error]"),button=root.querySelector('[data-action="cast"]');
        const focusId=root.querySelector('[name="focus"]')?.value??"",selected=focuses.find(f=>f.id===focusId);
        const base=item.system.variableCost&&!maintenance?Number(root.querySelector('[name="variableCost"]').value):cost;
        try {
          const preview=castingCost({cost:base,focus:selected?.rating??0,spent:roundSpent(actor.system.magic,magicRoundKey(game.combat)),vigor:actor.system.statistics.vigor});
          root.querySelector("[data-cast-quote]").textContent=`${base} − ${selected?.rating??0} = ${preview.stamina} ВЫН (минимум 1)\nЗа раунд: ${preview.after} / ${preview.vigor}${preview.damage?`\nПерегрузка: ${preview.excess} × 5 = ${preview.damage} урона ПЗ + стихийный эффект`:""}`;
          root.querySelector("[data-overload-row]").hidden=!preview.damage;
          castingQuote(actor,item,{cost:base,focusId,maintenance});
          error.textContent="";button.disabled=preview.damage>0&&!root.querySelector('[name="overload"]').checked;
        }catch(err){error.textContent=err.message;button.disabled=true;}
      };
      form.addEventListener("input",refresh);refresh();
    }});
}
const action=fn=>async function(event,target){try{return await fn.call(this,event,target);}catch(error){console.error(`${SYSTEM_ID} | Magic`,error);ui.notifications.error(error.message);}};
export const magicActions={
  browseSpells:action(async function(){return (await import("./spell-browser.mjs")).browseSpells(this.actor);}),
  createSpell:action(async function(){if(!this.isEditable)return;const [item]=await this.actor.createEmbeddedDocuments("Item",[{name:"Новое заклинание",type:"spell",img:"icons/svg/book.svg"}]);return item.sheet.render({force:true});}),
  castSpell:action(function(_e,target){return castDialog(this.actor,this.actor.items.get(target.dataset.itemId));}),
  maintainSpell:action(function(){return castDialog(this.actor,this.actor.items.get(this.actor.system.magic.sustainedId),true);}),
  endConcentration:action(function(){return endConcentration(this.actor);}),
  resetMagicRound:action(function(){return resetMagicRound(this.actor);}),
  rollSpellDetail:action(async function(_e,target){
    if(!this.actor.isOwner)return;
    const item=this.actor.items.get(target.dataset.itemId);if(item?.type!=="spell")return;
    const duration=target.dataset.spellRoll==="duration",formula=duration?item.system.duration.formula:item.system.damage;
    if(!formula||!foundry.dice.Roll.validate(formula))throw new Error("Укажите корректную формулу в параметрах заклинания.");
    const roll=await new foundry.dice.Roll(formula).evaluate();
    return roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor:this.actor}),
      flavor:`${duration?"Длительность":"Базовый урон / одно попадание"}: ${escape(item.name)}${duration?` (${item.system.duration.kind==="hours"?"часов":"раундов"})`:" — масштабирование и защиту учитывайте отдельно"}`,
      flags:{[SYSTEM_ID]:{skipLuck:true,...(duration?{effectDuration:{value:roll.total*(item.system.duration.kind==="hours"?3600:1),units:item.system.duration.kind==="hours"?"seconds":"rounds"}}:{})}}},{messageMode:game.settings.get("core","messageMode")});
  })
};
export {learnSpell};

export function spellItemContext(item,editable) {
  if(item.type!=="spell")return null;
  const choices=record=>Object.entries(record).map(([id,name])=>({id,name}));
  const fields=[choiceField("grade","Уровень",choices(SPELL_GRADES)),choiceField("element","Стихия",choices(SPELL_ELEMENTS)),
    numberField("cost","Стоимость, ВЫН"),{key:"variableCost",label:"Переменная стоимость (при сотворении)",type:"boolean"},
    choiceField("range.kind","Вид дальности",choices(SPELL_RANGE_KINDS)),numberField("range.value","Дальность, м"),
    choiceField("duration.kind","Длительность",choices(SPELL_DURATION_KINDS)),textField("duration.formula","Формула длительности"),
    numberField("duration.maintenance","Поддержание, ВЫН/раунд"),textField("duration.text","Особая длительность"),
    textField("damage","Базовый урон / одно попадание, формула"),textField("source","Источник")];
  return {...spellEntry(item),groups:[{title:"Параметры заклинания",fields:formFields(fields,Object.fromEntries(fields.map(f=>[f.key,foundry.utils.getProperty(item.system,f.key)])),"system.").map(f=>({...f,readOnly:!editable,isBoolean:f.type==="boolean"}))}],
    defenses:Object.entries(SPELL_DEFENSES).map(([id,label])=>({id,label,selected:item.system.defense.includes(id)}))};
}
