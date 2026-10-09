import { SYSTEM_ID } from "../config.mjs";
import { actionQuote, actionNote, actionUpdate } from "../combat/action-economy.mjs";
import { consumeAiming } from "../combat/full-turn-rules.mjs";
import { powerBonus } from "./power-place-rules.mjs";
import { skillValue } from "../data/skills.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { setStatus } from "../combat/status-effects.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as escape } from "../sheets/statistics-tooltips.mjs";
import { skillCalculationTooltip } from "../sheets/skills-context.mjs";
import { SPELL_DEFENSES, spellRange, spellDuration } from "../data/spells.mjs";
import { createSpellStrikes, furySpellTargetError } from "./spell-strikes.mjs";
import { creatureSuppression } from "../combat/creature-spirits.mjs";
import { DIMERITIUM_RESISTED } from "./dimeritium.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { matchingGlyphs, glyphBonus, spellDescriptionWithDC } from "../data/rune-glyphs.mjs";
import { adrenalineDamage, consumeAdrenalineDamage, adrenalineAbsorptionPlan } from "../combat/adrenaline.mjs";
import { temporaryHealthAbsorptionPlan } from "../workshop/witcher-elixirs.mjs";
import { inventoryTransaction } from "../workshop/transaction.mjs";
import { castingCost, spellBaseCost, focusOptions, magicRoundKey, roundSpent, magicFumble, ELEMENTAL_MISHAPS, learnedSpell, castingSkill, CASTING_SKILL_LABELS, maintenanceCost, ritualDifficulty, ritualComponents, signPotency, castingComponents, RITUAL_INTERRUPTIONS } from "./rules.mjs";

export async function learnSpell(actor,source) {
  return inventoryWrite(actor,async()=>{
    if(source.type!=="spell"||!source.testUserPermission(game.user,"OBSERVER"))throw new Error("Заклинание недоступно.");
    const existing=learnedSpell(actor,source);
    if(existing)return existing;
    const copy=source.toObject(); delete copy._id; copy.folder=null;
    copy.flags={...copy.flags,core:{...copy.flags?.core,sourceId:source.uuid}};
    const [created]=await actor.createEmbeddedDocuments("Item",[copy]);
    return created;
  });
}

export function castingQuote(actor,item,{cost,focusId="",maintenance=false,dc,helpers=0,glyphChoice="dc"}={}) {
  if(item?.type!=="spell"||item.parent!==actor)throw new Error("Сначала добавьте заклинание в книгу персонажа.");
  if(!maintenance){const frenzy=furySpellTargetError(actor,item);if(frenzy)throw new Error(frenzy);}
  // A mage who passed «Устойчивость к двимериту» keeps the ability to cast (core p.66).
  if(creatureSuppression(actor).dimeritium&&!actor.statuses?.has?.(DIMERITIUM_RESISTED))throw new Error("В зоне двимеритовой бомбы нельзя использовать магию. Маг может пройти Устойчивость к двимериту на вкладке «Магия».");
  if(item.system.ruleId==="sign.yrden"&&!game.user.isGM&&!game.users?.activeGM)throw new Error("Для размещения Ирдена нужен подключённый ведущий.");
  const conditions=conditionRules(actor);
  if(!actor.isOwner || !(item.system.ruleId==="spell.dispel"?conditions.canDefend:conditions.canAct))throw new Error("Персонаж сейчас не может творить магию.");
  const active=actor.items.get(actor.system.magic.sustainedId);
  if(maintenance) {
    if(active?.id!==item.id||item.system.duration.kind!=="sustained")throw new Error("Это заклинание не поддерживается.");
  } else if(active)throw new Error("Сначала прекратите поддержание: концентрация не позволяет творить другое заклинание.");
  const skillKey=castingSkill(item.system),skill=skillValue(actor.system,skillKey),power=powerBonus(actor,item.system);
  if(skill.total===null)throw new Error("Укажите Волю персонажа.");
  const poweredSkill={...skill,total:skill.total+power.casting};
  const roundKey=magicRoundKey(game.combat);
  if(maintenance && actor.system.magic.maintainedRound===roundKey)throw new Error("Поддержание в этом раунде уже оплачено.");
  // Focus is selected from equipped inventory each time, not a second editable bonus on Actor.
  // TODO(core pp.102,167): focus explicitly discounts casting; upkeep discount is not
  // specified. Preserve the printed upkeep until an official clarification covers it.
  const focus=maintenance?null:focusOptions(actor,item).find(entry=>entry.id===focusId);
  const glyph=glyphBonus(maintenance?[]:matchingGlyphs(equippedItems(actor.items),item),glyphChoice);
  if(glyph.damageDice&&!item.system.damage)throw new Error("У этого заклинания нет урона: выберите бонус глифа к СЛ.");
  if(!maintenance&&focusId&&!focus)throw new Error("Фокусирующий предмет больше не экипирован.");
  const base=maintenance?maintenanceCost(item.system,actor.system.magic.sustainedCost??0):spellBaseCost(item.system,cost);
  if(maintenance&&base<1)throw new Error("Не сохранена стоимость поддерживаемого знака. Прекратите поддержание и сотворите его заново.");
  const quote=castingCost({cost:base,focus:focus?.rating??0,spent:roundSpent(actor.system.magic,roundKey),vigor:actor.system.statistics.vigor+power.vigor});
  if(quote.stamina>actor.system.stamina.value)throw new Error(`Недостаточно Выносливости: нужно ${quote.stamina}, доступно ${actor.system.stamina.value}.`);
  const action = maintenance ? {extra:false,penalty:0,stamina:0,roundKey:""} : actionQuote(actor,{cost:quote.stamina});
  return {...quote,action,roundKey,skill:{...poweredSkill,total:poweredSkill.total+action.penalty},skillKey,focus,glyph,effectDC:glyph.dc+(focus?.greater?2:0),power,difficulty:item.system.kind==="ritual"?ritualDifficulty(item.system,{dc,helpers}):null};
}

const pendingCasts=new WeakMap();
/** Repeated clicks while the same cast is pending share its result instead of casting twice. */
export function castSpell(actor,itemId,options={}) {
  if(pendingCasts.has(actor))return pendingCasts.get(actor);
  const work=performCast(actor,itemId,options);
  pendingCasts.set(actor,work);
  const clear=()=>{if(pendingCasts.get(actor)===work)pendingCasts.delete(actor);};
  work.then(clear,clear);
  return work;
}

/** Post first, settle after Dice So Nice: exhaustion and fumble states appear after the result. */
function performCast(actor,itemId,options) {
  return inventoryWrite(actor,async()=>{
    // TODO(core pp.117–119,168): preparation is confirmed by the table. Until the
    // combat workflow tracks multi-round actions, charge ritual STA at resolution
    // using the shared round limit rather than invent a distribution across rounds.
    const item=actor.items.get(itemId),quote=castingQuote(actor,item,options);
    const adrenaline=!options.maintenance&&item.system.damage?adrenalineDamage(actor):0;
    const kind=item.system.kind??"spell",ritual=kind==="ritual",hex=kind==="hex";
    if(ritual&&!options.maintenance&&!options.prepared)throw new Error("Подтвердите завершение подготовки и ручной учёт ингредиентов.");
    if(quote.excess && !options.allowOverexertion)throw new Error("Подтвердите перегрузку магии перед броском.");
    const display=trackRollDisplay(),messageMode=game.settings.get("core","messageMode");
    let posted;
    try {
      const roll=options.maintenance||(ritual&&!quote.difficulty.target)?null:await new foundry.dice.Roll(`1d10wc + ${quote.skill.total}`).evaluate({allowInteractive:messageMode!=="blind"});
      const fumble=roll?magicFumble(roll):{severity:0,failed:false,elemental:false,explosion:false};
      if(ritual||hex){fumble.failed=false;fumble.elemental=false;fumble.explosion=false;}
      const fumbleDamage=fumble.severity?(hex?0:ritual?quote.stamina:fumble.severity):0;
      const backlash=hex&&fumble.severity?await new foundry.dice.Roll("1d100").evaluate({allowInteractive:messageMode!=="blind"}):null;
      const reflected=Boolean(backlash&&backlash.total<=50);
      const element=actor.system.details.profession==="priest"||["druid","priest"].includes(item.system.tradition)?"mixed":item.system.element;
      const elemental=fumble.elemental||quote.excess>0;
      const title=options.maintenance?"Поддержание":ritual?"Ритуал":hex?"Порча":kind==="sign"?"Знак":["druid","priest"].includes(item.system.tradition)?"Инвокация":"Сотворение";
      const calc=skillCalculationTooltip(actor.system,quote.skill,{localize:key=>game.i18n.localize(key),format:(key,data)=>game.i18n.format(key,data)});
      const summary=[`${quote.base} − ${quote.focus?.rating??0} = ${quote.stamina} ВЫН (минимум 1)`,
        `За раунд: ${quote.before} + ${quote.stamina} = ${quote.after}; предел ${quote.vigor}`];
      if(quote.power.label)summary.push(`${quote.power.label}: +${quote.power.vigor} к пределу этой стихии${quote.power.casting?`; +${quote.power.casting} к Сотворению`:""}.`);
      if(quote.damage)summary.push(`Перегрузка: ${quote.excess} × 5 = ${quote.damage} урона`);
      // A spell's own fumble is shown by the magic fumble panel (magic-fumble.mjs); rituals and hexes keep their line.
      if(fumble.severity&&(hex||ritual))summary.push(hex?`Обратная порча: 1d100 = ${backlash.total}; 01–50 — на заклинателя. ${reflected?"Порча поражает заклинателя вместо цели; примените её описание к нему.":"Обратной порчи нет; сравните проверку с защитой цели."}`:ritual?`Критический провал ритуала: ${quote.stamina} потраченных ВЫН = ${fumbleDamage} урона ПЗ.`:`Магический провал ${fumble.severity}: ${fumbleDamage} урона; ${fumble.failed?"заклинание не сработало":"заклинание всё ещё может сработать"}`);
      if(!options.maintenance&&quote.skillKey==="spellCasting")summary.push(castingComponents(actor.system.skills?.spellCasting??0));
      if(kind==="sign")summary.push(signPotency(item.system,options.maintenance?actor.system.magic.sustainedCost:quote.base));
      if(ritual&&!options.maintenance){summary.push(`Подготовка: ${item.system.ritual.preparationRounds} раундов завершена. Ингредиенты учитываются вручную при любом результате: ${ritualComponents(item.system)||"нет расходуемых предметов"}`);if(item.system.ritual.requirements)summary.push(item.system.ritual.requirements);}
      if(elemental&&(hex||ritual))summary.push(ELEMENTAL_MISHAPS[element]);
      // TODO(core p.166): focus explosions affect nearby tokens/objects. Keep that adjudication
      // with the GM until area damage and equipment destruction have a shared combat workflow.

      if(quote.focus?.greater)summary.push("Улучшенное фокусирующее: +2 к устанавливаемой заклинанием СЛ для противника (не к броску атаки).");
      if(quote.glyph.sources.length)summary.push(`Глиф: ${quote.glyph.dc?"+3 к устанавливаемой заклинанием СЛ":"+1d6 урона"}. Бонус выбран для этого сотворения.`);
      if(adrenaline)summary.push(`Адреналин: +${adrenaline}d6 урона первого попадания; кости и ВЫН уже потрачены до действия.`);
      const flavor=`<section class="witcher-magic-chat"><h3>${title}: ${escape(item.name)}</h3>`
        +`<p data-tooltip="${escape(calc)}">Воля + ${CASTING_SKILL_LABELS[quote.skillKey]}: ${quote.skill.total}</p>`
        +`<p>${escape(spellRange(item.system.range))} · ${escape(spellDuration(item.system.duration))}</p>`
        +`<p>Защита: ${escape(item.system.defense.map(key=>SPELL_DEFENSES[key]).join(" / "))}</p>`+actionNote(quote.action)
        +`<ul>${summary.map(line=>`<li>${escape(line)}</li>`).join("")}</ul>`
        +`<details><summary>Действие магии</summary>${await foundry.applications.ux.TextEditor.implementation.enrichHTML(spellDescriptionWithDC(item.system.description,quote.effectDC),{secrets:false,relativeTo:item})}${hex?`<p>Снятие: ${escape(item.system.hex.lifting)}</p>`:""}</details></section>`;
      const flags={[SYSTEM_ID]:{...display.flags[SYSTEM_ID],...(!roll?{skipLuck:true}:{}),
        magicCast:{kind,element,elemental,spellId:item.id,spellName:item.name,roundKey:quote.roundKey,stamina:quote.stamina,powerCost:quote.base,overload:quote.damage,fumble,fumbleDamage,reflected,difficulty:quote.difficulty,glyph:quote.glyph,effectDC:quote.effectDC,adrenalineDice:adrenaline,maintenance:Boolean(options.maintenance)}}};
      const data={speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor,flags};
      posted=backlash?await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({...data,rolls:[roll,backlash]},messageMode))
        :roll?await roll.toMessage(data,{messageMode}):await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({...data,content:options.maintenance?"Поддержание оплачено.":"Ритуал без проверки."},messageMode));
      if(!posted)throw new Error("Сообщение не создано; ресурсы не потрачены.");
      if(adrenaline)await consumeAdrenalineDamage(actor);
      await display.wait(posted);
      const ritualSuccess=options.maintenance||!ritual||posted.flags[SYSTEM_ID].magicCast.succeeded;
      const moon=temporaryHealthAbsorptionPlan(actor,quote.damage+fumbleDamage);
      const backlashHP=adrenalineAbsorptionPlan(actor,quote.damage+fumbleDamage-moon.absorbed);
      const concentration=item.system.duration.kind==="sustained"&&ritualSuccess&&!fumble.failed&&!(elemental&&element==="earth")
        &&actor.system.stamina.value>quote.stamina+quote.action.stamina&&actor.system.health.value>backlashHP.remaining;
      await inventoryTransaction(actor,{effectUpdates:moon.effectUpdates,actorUpdate:{...actionUpdate(actor,quote.action,quote.stamina),...backlashHP.actorUpdate,
        "system.health.value":actor.system.health.value-backlashHP.remaining,
        "system.magic.roundKey":quote.roundKey,"system.magic.spent":quote.after,
        "system.magic.sustainedId":concentration?item.id:"","system.magic.maintainedRound":concentration?quote.roundKey:"",
        "system.magic.sustainedCost":concentration?(options.maintenance?actor.system.magic.sustainedCost:quote.base):0}});
      if(elemental) {
        const status={earth:"stunned",fire:"burning",water:"frozen"}[element];
        if(status)await setStatus(actor,status,true);
      }
      if(!options.maintenance)await consumeAiming(actor);
      // Core p.168: each targeted token defends against this casting check (a failed spell reaches nobody).
      if(!options.maintenance&&!ritual&&!hex&&roll&&!fumble.failed)await createSpellStrikes(actor,item,posted,{total:posted.rolls[0]?.total??roll.total});
      return posted;
    } catch(error) {
      if(posted)ui.notifications.error("Результат уже в чате, но расход магии не завершён. Проверьте ПЗ, Выносливость и состояния перед повторным броском.");
      throw error;
    } finally {display.close();}
  });
}

export function endConcentration(actor) {return inventoryWrite(actor,()=>actor.update({"system.magic.sustainedId":"","system.magic.maintainedRound":"","system.magic.sustainedCost":0}));}
export function resetMagicRound(actor) {
  if(game.combat?.started)throw new Error("В бою счётчик обновляется при смене раунда.");
  return inventoryWrite(actor,()=>actor.update({"system.magic.roundKey":"free","system.magic.spent":0,"system.magic.maintainedRound":""}));
}

/** Core p.168: a disturbed ritualist rolls Ritual Crafting against 15/18/16 to keep the ritual going. */
export async function rollRitualInterruption(actor,id) {
  const entry=RITUAL_INTERRUPTIONS.find(row=>row.id===id);
  if(!entry)throw new Error("Неизвестная помеха.");
  const skill=skillValue(actor.system,"ritualCrafting");
  const roll=await new foundry.dice.Roll(`1d10wc + ${skill.total??0}`).evaluate();
  return roll.toMessage({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flags:{[SYSTEM_ID]:{skillCheck:{key:"ritualCrafting",base:skill.total??0,label:"Прерывание ритуала"}}},
    flavor:`<section class="witcher-magic-chat"><h3>Прерывание ритуала · СЛ ${entry.dc}</h3><p>${escape(entry.name)}. Проведение ритуалов против СЛ ${entry.dc}: при успехе концентрация сохранена и ритуал продолжается, при провале ритуал сорван.</p></section>`});
}
