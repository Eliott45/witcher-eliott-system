import { dimeritiumState, rollDimeritium, dimeritiumResistance, rollDimeritiumResistance, dimeritiumBanner, DIMERITIUM_CONTACT } from "../magic/dimeritium.mjs";
import { RITUAL_INTERRUPTIONS } from "../magic/rules.mjs";
import { actorToken } from "../combat/environment.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { activePowerBenefits } from "../magic/power-place-rules.mjs";
import { MAGIC_KINDS,MAGIC_CATEGORIES,HEX_DANGERS,magicCategory,MAGIC_TRADITIONS,SPELL_ELEMENTS,SPELL_GRADES,SPELL_DEFENSES,spellRange,spellDuration,SPELL_RANGE_KINDS,SPELL_DURATION_KINDS } from "../data/spells.mjs";
import { focusOptions,magicRoundKey,roundSpent,spellCostLabel,castingSkill,CASTING_SKILL_LABELS,maintenanceCost,ritualComponents,hexIdentification,signPotency } from "../magic/rules.mjs";
import { castSpell,castingQuote,learnSpell,endConcentration,resetMagicRound } from "../magic/casting.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { skillValue } from "../data/skills.mjs";
import { textField,numberField,choiceField,formFields } from "../data/structured-fields.mjs";
import { escapeTooltip as escape } from "./statistics-tooltips.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { matchingGlyphs } from "../data/rune-glyphs.mjs";

export const SPELL_ICONS={mixed:"fa-solid fa-sparkles",earth:"fa-solid fa-mountain",air:"fa-solid fa-wind",fire:"fa-solid fa-fire",water:"fa-solid fa-droplet"};
const MAGIC_GROUPS=[
  {id:"spell",label:"Обычная магия",icon:"fa-solid fa-sparkles"},
  {id:"sign",label:"Знаки",icon:"fa-solid fa-hand-sparkles"},
  {id:"ritual",label:"Ритуалы",icon:"fa-solid fa-circle-nodes"},
  {id:"hex",label:"Порчи",icon:"fa-solid fa-skull"}
];
export function spellEntry(item) {
  const s=item.system,tradition=magicCategory(s),ritual=s.kind==="ritual",hex=s.kind==="hex";
  return {id:item.id,uuid:item.uuid,name:item.name,img:item.img,kind:s.kind??"spell",element:s.element,grade:s.grade,tradition,traditionLabel:MAGIC_TRADITIONS[tradition],deity:s.deity,
    icon:ritual?"fa-solid fa-circle-nodes":hex?"fa-solid fa-skull":tradition==="sign"?"fa-solid fa-hand-sparkles":tradition==="druid"?"fa-solid fa-leaf":tradition==="priest"?"fa-solid fa-hands-praying":SPELL_ICONS[s.element],elementLabel:tradition==="mage"?SPELL_ELEMENTS[s.element]:MAGIC_CATEGORIES[tradition],gradeLabel:hex?`Опасность: ${HEX_DANGERS[s.hex.danger]}`:SPELL_GRADES[s.grade],
    cost:spellCostLabel(s),range:spellRange(s.range),duration:spellDuration(s.duration),
    skillLabel:CASTING_SKILL_LABELS[castingSkill(s)],isRitual:ritual,isHex:hex,
    ritual:ritual?{...s.ritual,dcLabel:s.ritual.dcHint||(s.ritual.dc?`${s.ritual.dc}`:"Без проверки"),components:ritualComponents(s)}:null,
    hex:hex?{...s.hex,educationDC:hexIdentification(s.hex.danger)[0],trainingDC:hexIdentification(s.hex.danger)[1]}:null,
    defense:s.defense.map(key=>SPELL_DEFENSES[key]).join(" / "),damage:s.damage,durationFormula:s.duration.formula,
    source:s.source,search:`${item.name} ${s.description} ${SPELL_ELEMENTS[s.element]} ${s.deity??""} ${MAGIC_CATEGORIES[tradition]} ${ritual?ritualComponents(s):""}`.replace(/<[^>]*>/g," ").toLocaleLowerCase("ru")};
}
export async function magicContext(actor) {
  const roundKey=magicRoundKey(game.combat),spent=roundSpent(actor.system.magic,roundKey),vigor=actor.system.statistics.vigor;
  const items=Array.from(actor.items??[]),active=items.find(item=>item.id===actor.system.magic.sustainedId),skill=skillValue(actor.system,"spellCasting");
  const canCast=actor.isOwner&&conditionRules(actor).canAct&&skill.total!==null;
  const spells=await Promise.all(items.filter(item=>item.type==="spell").map(async item=>({...spellEntry(item),
    description:await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description,{secrets:actor.isOwner,relativeTo:item})})));
  spells.sort((a,b)=>Object.keys(SPELL_GRADES).indexOf(a.grade)-Object.keys(SPELL_GRADES).indexOf(b.grade)||a.name.localeCompare(b.name,"ru"));
  const groups=MAGIC_GROUPS.map(group=>({...group,spells:spells.filter(spell=>spell.kind===group.id)})).filter(group=>group.spells.length);
  const dimeritium=dimeritiumBanner(actor,dimeritiumState(actor,actorToken(actor)));
  const interruptions=spells.some(spell=>spell.kind==="ritual")?RITUAL_INTERRUPTIONS:[];
  return {dimeritium,interruptions,spells,groups,powerBenefits:activePowerBenefits(actor).map(effect=>({name:effect.name,minutes:Math.ceil((effect.flags[SYSTEM_ID].powerPlace.expiresAt-game.time.worldTime)/60)})),count:spells.length,spent,vigor,remaining:Math.max(0,vigor-spent),percent:vigor?Math.min(100,spent/vigor*100):spent?100:0,
    stamina:actor.system.stamina.value,staminaMax:actor.system.stamina.max,casting:skill.total??"—",ritualCasting:skillValue(actor.system,"ritualCrafting").total??"—",hexCasting:skillValue(actor.system,"hexWeaving").total??"—",canCast:canCast&&!active,
    combat:Boolean(game.combat?.started),round:game.combat?.round,
    active:active?{...spellEntry(active),duration:`Поддержание · ${maintenanceCost(active.system,actor.system.magic.sustainedCost)} ВЫН/раунд`}:null,canMaintain:canCast&&Boolean(active)&&actor.system.magic.maintainedRound!==roundKey,
    elements:Object.entries(SPELL_ELEMENTS).map(([id,label])=>({id,label,icon:SPELL_ICONS[id]})),
    traditions:Object.entries(MAGIC_CATEGORIES).map(([id,label])=>({id,label})),
    grades:Object.entries(SPELL_GRADES).map(([id,label])=>({id,label}))};
}

export function bindSpellFilters(root,filters={},onChange=()=>{}) {
  for(const [key,value] of Object.entries(filters))root.querySelector(`[data-magic-${key}]`).value=value;
  const refresh=()=>{
    const query=root.querySelector("[data-magic-search]").value.trim().toLocaleLowerCase("ru");
    const tradition=root.querySelector("[data-magic-tradition]").value;
    const element=root.querySelector("[data-magic-element]").value,grade=root.querySelector("[data-magic-grade]").value;
    let count=0;
    for(const row of root.querySelectorAll("[data-spell-row]")) {
      row.hidden=!(row.dataset.search.includes(query)&&(!tradition||row.dataset.tradition===tradition)&&(!element||row.dataset.element===element)&&(!grade||row.dataset.grade===grade));
      if(!row.hidden)count++;
    }
    for(const group of root.querySelectorAll("[data-magic-group]")) {
      const visible=group.querySelectorAll("[data-spell-row]:not([hidden])").length;
      group.hidden=visible===0;
      group.querySelector("[data-magic-group-count]").textContent=visible;
    }
    root.querySelector("[data-magic-empty]").hidden=count>0;
    root.querySelector("[data-magic-count]").textContent=count;
    onChange({search:root.querySelector("[data-magic-search]").value,element,grade,tradition});
  };
  for(const input of root.querySelectorAll("[data-magic-search], [data-magic-element], [data-magic-grade], [data-magic-tradition]"))input.addEventListener("input",refresh);
  refresh();
}

export function bindMagic(sheet) {
  const root=sheet.element.querySelector("[data-tab=magic].witcher-magic-page");
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
  const focuses=focusOptions(actor,item),glyphs=maintenance?[]:matchingGlyphs(equippedItems(actor.items),item),cost=maintenance?maintenanceCost(item.system,actor.system.magic.sustainedCost):item.system.cost,ritual=item.system.kind==="ritual"&&!maintenance;
  const content=`<div class="witcher-cast-dialog"><p>${escape(item.name)} · ${escape(spellDuration(item.system.duration))}</p>`
    +`<small>Воля + ${CASTING_SKILL_LABELS[castingSkill(item.system)]}</small>`
    +(ritual?`<section class="witcher-ritual-setup"><strong>Подготовка: ${item.system.ritual.preparationRounds} раундов</strong><p>${escape(ritualComponents(item.system))}</p><p>${escape(item.system.ritual.requirements)}</p>${item.system.ritual.dc?`<div class="witcher-cast-grid"><label>СЛ<input name="ritualDC" type="number" min="1" step="1" value="${item.system.ritual.dc}"></label><label>Помощники (до 4)<input name="helpers" type="number" min="0" max="4" step="1" value="0"></label></div><small>${escape(item.system.ritual.dcHint)}</small>`:"<p>Без проверки и без расхода Удачи.</p>"}<label class="witcher-cast-confirm"><input name="prepared" type="checkbox"> Подготовка завершена, ингредиенты учтены вручную</label><small>Расходуются и при неудаче; телекоммуникатор сохраняется. Предметы из инвентаря автоматически не списываются.</small></section>`:"")
    +(item.system.kind==="hex"?"<small>Нужна личная ненависть к цели. При натуральной 1: отдельный 1d100, 01–50 — порча на заклинателя вместо цели.</small>":"")
    +(!maintenance&&item.system.variableCost?`<label>Стоимость сотворения, ВЫН<input name="variableCost" type="number" min="${Math.max(1,cost)}" step="${item.system.costStep??1}" ${item.system.costMax?`max="${item.system.costMax}"`:""} value="${Math.max(1,cost)}" required></label><small>${escape(item.system.costHint||(item.system.ruleId==="spell.dispel"?"Рассеивание: половина исходной стоимости. Укажите согласованную с ведущим целую стоимость.":"Выберите стоимость по описанию магии."))}</small>`:"")
    +(!maintenance?`<label>Фокус в руках<select name="focus"><option value="">Без фокуса</option>${focuses.map(f=>`<option value="${f.id}">${escape(f.name)}${f.rating?` · −${f.rating} ВЫН`:""}${f.greater?" · +2 к СЛ эффекта":""}</option>`).join("")}</select></label>`:"")
    +(glyphs.length?`<label>Глиф · бонус на это сотворение<select name="glyphChoice"><option value="dc">+3 к устанавливаемой заклинанием СЛ</option>${item.system.damage?'<option value="damage">+1d6 урона</option>':""}</select></label><small>${escape(glyphs.map(entry=>`${entry.name} (${entry.itemName})`).join(", "))}. Одинаковые глифы не складываются.</small>`:"")
    +'<output data-cast-quote></output><label class="witcher-overload-confirm" data-overload-row hidden><input type="checkbox" name="overload"> Сотворить с перегрузкой и получить урон</label><p data-cast-error role="alert"></p></div>';
  return foundry.applications.api.DialogV2.wait({window:{title:maintenance?"Поддержание магии":ritual?"Проведение ритуала":"Сотворение магии"},classes:["witcher-picker"],position:{width:520},content,
    buttons:[{action:"cast",label:maintenance?"Оплатить поддержание":"Сотворить",default:true,callback:async(_e,button)=>{
      const form=button.form;
      await castSpell(actor,item.id,{maintenance,cost:item.system.variableCost&&!maintenance?Number(form.elements.variableCost.value):cost,focusId:form.elements.focus?.value??"",glyphChoice:form.elements.glyphChoice?.value??"dc",allowOverexertion:form.elements.overload.checked,prepared:form.elements.prepared?.checked??false,dc:form.elements.ritualDC?Number(form.elements.ritualDC.value):undefined,helpers:Number(form.elements.helpers?.value??0)});
    }},{action:"cancel",label:"Отмена"}],render:(_event,dialog)=>{
      const root=dialog.element,form=root.querySelector("form")??root;
      const refresh=()=>{
        const error=root.querySelector("[data-cast-error]"),button=root.querySelector('[data-action="cast"]');
        const focusId=root.querySelector('[name="focus"]')?.value??"";
        const base=item.system.variableCost&&!maintenance?Number(root.querySelector('[name="variableCost"]').value):cost;
        try {
          const dcInput=root.querySelector('[name="ritualDC"]'),helpers=Number(root.querySelector('[name="helpers"]')?.value??0);
          const preview=castingQuote(actor,item,{cost:base,focusId,maintenance,glyphChoice:form.elements.glyphChoice?.value??"dc",dc:dcInput?Number(dcInput.value):undefined,helpers});
          root.querySelector("[data-cast-quote]").textContent=`${base} − ${preview.focus?.rating??0} = ${preview.stamina} ВЫН (минимум 1)\nЗа раунд: ${preview.after} / ${preview.vigor}${preview.damage?`\nПерегрузка: ${preview.excess} × 5 = ${preview.damage} урона ПЗ + стихийный эффект`:""}${preview.difficulty?.target?`\nСЛ: ${preview.difficulty.base} − ${helpers} = ${preview.difficulty.target}`:""}\n${signPotency(item.system,base)}`;
          root.querySelector("[data-overload-row]").hidden=!preview.damage;
          if(preview.power.label)root.querySelector("[data-cast-quote]").textContent+=`\n${preview.power.label}: +${preview.power.vigor} к пределу, +${preview.power.casting} к Сотворению этой стихии`;
          error.textContent="";button.disabled=(preview.damage>0&&!root.querySelector('[name="overload"]').checked)||(ritual&&!root.querySelector('[name="prepared"]').checked);
        }catch(err){error.textContent=err.message;button.disabled=true;}
      };
      form.addEventListener("input",refresh);refresh();
    }});
}
const action=fn=>async function(event,target){try{return await fn.call(this,event,target);}catch(error){console.error(`${SYSTEM_ID} | Magic`,error);ui.notifications.error(error.message);}};
export const magicActions={
  ritualInterruption:action(async function(_e,target){if(this.isEditable)await (await import("../magic/casting.mjs")).rollRitualInterruption(this.actor,target.dataset.interruption);}),
  rollDimeritium:action(async function(){if(this.isEditable)await rollDimeritium(this.actor);}),
  toggleDimeritiumContact:action(async function(){if(!this.isEditable)return;const {setStatus}=await import("../combat/status-effects.mjs");await setStatus(this.actor,DIMERITIUM_CONTACT,!this.actor.statuses.has(DIMERITIUM_CONTACT));}),
  resistDimeritium:action(async function(){if(this.isEditable)await rollDimeritiumResistance(this.actor,dimeritiumState(this.actor,actorToken(this.actor)));}),
  browseSpells:action(async function(){return (await import("./spell-browser.mjs")).browseSpells(this.actor);}),
  createSpell:action(async function(){if(!this.isEditable)return;const priest=this.actor.system.details.profession==="priest",witcher=this.actor.system.details.profession==="witcher";const [item]=await this.actor.createEmbeddedDocuments("Item",[{name:witcher?"Новый знак":priest?"Новая инвокация":"Новое заклинание",type:"spell",img:"icons/svg/book.svg",system:{kind:witcher?"sign":"spell",tradition:priest?"priest":"mage"}}]);return item.sheet.render({force:true});}),
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
      flavor:`${duration?"Длительность":"Базовый урон / одно попадание"}: ${escape(item.name)}${duration?` (${item.system.duration.kind==="hours"?"часов":item.system.duration.kind==="days"?"дней":"раундов"})`:" — масштабирование и защиту учитывайте отдельно"}`,
      flags:{[SYSTEM_ID]:{skipLuck:true,...(duration?{effectDuration:{value:roll.total*(item.system.duration.kind==="hours"?3600:item.system.duration.kind==="days"?86400:1),units:["hours","days"].includes(item.system.duration.kind)?"seconds":"rounds"}}:{})}}},{messageMode:game.settings.get("core","messageMode")});
  })
};
export {learnSpell};

export function spellItemContext(item,editable) {
  if(item.type!=="spell")return null;
  const choices=record=>Object.entries(record).map(([id,name])=>({id,name}));
  const fields=[choiceField("kind","Вид магии",choices(MAGIC_KINDS)),choiceField("tradition","Традиция заклинания / инвокации",choices(MAGIC_TRADITIONS)),textField("deity","Божество (если требуется)"),choiceField("grade","Уровень",choices(SPELL_GRADES)),choiceField("element","Стихия",choices(SPELL_ELEMENTS)),
    numberField("cost","Стоимость, ВЫН"),{key:"variableCost",label:"Переменная стоимость (при сотворении)",type:"boolean"},
    numberField("costStep","Шаг переменной стоимости"),numberField("costMax","Максимальная стоимость (0 — без ограничения)"),textField("costHint","Подсказка стоимости"),
    choiceField("range.kind","Вид дальности",choices(SPELL_RANGE_KINDS)),numberField("range.value","Дальность, м"),
    choiceField("duration.kind","Длительность",choices(SPELL_DURATION_KINDS)),textField("duration.formula","Формула длительности"),
    numberField("duration.maintenance","Поддержание, ВЫН/раунд"),choiceField("duration.maintenanceMode","Расчёт поддержания",choices({fixed:"Фиксированное",fullCost:"Исходная стоимость",halfCost:"Половина исходной стоимости"})),textField("duration.text","Особая длительность"),
    textField("damage","Базовый урон / одно попадание, формула"),textField("source","Источник")];
  if(item.system.kind==="ritual")fields.push(numberField("ritual.dc","СЛ (0 — без проверки)"),numberField("ritual.alternateDC","Альтернативная СЛ"),textField("ritual.dcHint","Варианты сложности"),numberField("ritual.preparationRounds","Подготовка, раундов"),textField("ritual.requirements","Дополнительные требования / замена ингредиентов"));
  if(item.system.kind==="hex")fields.push(choiceField("hex.danger","Опасность",choices(HEX_DANGERS)),textField("hex.lifting","Условия снятия"));
  return {...spellEntry(item),components:item.system.ritual?.components.map((c,index)=>({...c,index})),groups:[{title:"Параметры магии",fields:formFields(fields,Object.fromEntries(fields.map(f=>[f.key,foundry.utils.getProperty(item.system,f.key)])),"system.").map(f=>({...f,readOnly:!editable,isBoolean:f.type==="boolean"}))}],
    defenses:Object.entries(SPELL_DEFENSES).map(([id,label])=>({id,label,selected:item.system.defense.includes(id)}))};
}
