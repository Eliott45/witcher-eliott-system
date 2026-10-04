import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { setStatus } from "../combat/status-effects.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { escapeTooltip as escape } from "../sheets/statistics-tooltips.mjs";
import { skillCalculationTooltip } from "../sheets/skills-context.mjs";
import { SPELL_DEFENSES, spellRange, spellDuration } from "../data/spells.mjs";
import { castingCost, focusOptions, magicRoundKey, roundSpent, magicFumble, ELEMENTAL_MISHAPS, learnedSpell } from "./rules.mjs";

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

export function castingQuote(actor,item,{cost,focusId="",maintenance=false}={}) {
  if(item?.type!=="spell"||item.parent!==actor)throw new Error("Сначала добавьте заклинание в книгу персонажа.");
  const conditions=conditionRules(actor);
  if(!actor.isOwner || !(item.system.ruleId==="spell.dispel"?conditions.canDefend:conditions.canAct))throw new Error("Персонаж сейчас не может творить магию.");
  const active=actor.items.get(actor.system.magic.sustainedId);
  if(maintenance) {
    if(active?.id!==item.id||item.system.duration.kind!=="sustained")throw new Error("Это заклинание не поддерживается.");
  } else if(active)throw new Error("Сначала прекратите поддержание: концентрация не позволяет творить другое заклинание.");
  const skill=skillValue(actor.system,"spellCasting");
  if(skill.total===null)throw new Error("Укажите Волю персонажа.");
  const roundKey=magicRoundKey(game.combat);
  if(maintenance && actor.system.magic.maintainedRound===roundKey)throw new Error("Поддержание в этом раунде уже оплачено.");
  // Focus is selected from equipped inventory each time, not a second editable bonus on Actor.
  // TODO(core pp.102,167): focus explicitly discounts casting; upkeep discount is not
  // specified. Preserve the printed upkeep until an official clarification covers it.
  const focus=maintenance?null:focusOptions(actor).find(entry=>entry.id===focusId);
  if(!maintenance&&focusId&&!focus)throw new Error("Фокусирующий предмет больше не экипирован.");
  const base=maintenance?item.system.duration.maintenance:item.system.variableCost?Number(cost):item.system.cost;
  const quote=castingCost({cost:base,focus:focus?.rating??0,spent:roundSpent(actor.system.magic,roundKey),vigor:actor.system.statistics.vigor});
  if(quote.stamina>actor.system.stamina.value)throw new Error(`Недостаточно Выносливости: нужно ${quote.stamina}, доступно ${actor.system.stamina.value}.`);
  return {...quote,roundKey,skill,focus};
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
    const item=actor.items.get(itemId),quote=castingQuote(actor,item,options);
    if(quote.excess && !options.allowOverexertion)throw new Error("Подтвердите перегрузку магии перед броском.");
    const display=trackRollDisplay(),messageMode=game.settings.get("core","messageMode");
    let posted;
    try {
      const roll=options.maintenance?null:await new foundry.dice.Roll(`1d10wc + ${quote.skill.total}`).evaluate({allowInteractive:messageMode!=="blind"});
      const fumble=roll?magicFumble(roll):{severity:0,failed:false,elemental:false,explosion:false};
      const element=actor.system.details.profession==="priest"?"mixed":item.system.element;
      const elemental=fumble.elemental||quote.excess>0;
      const title=options.maintenance?"Поддержание":"Сотворение";
      const calc=skillCalculationTooltip(actor.system,quote.skill,{localize:key=>game.i18n.localize(key),format:(key,data)=>game.i18n.format(key,data)});
      const summary=[`${quote.base} − ${quote.focus?.rating??0} = ${quote.stamina} ВЫН (минимум 1)`,
        `За раунд: ${quote.before} + ${quote.stamina} = ${quote.after}; предел ${quote.vigor}`];
      if(quote.damage)summary.push(`Перегрузка: ${quote.excess} × 5 = ${quote.damage} урона`);
      if(fumble.severity)summary.push(`Магический провал ${fumble.severity}: ${fumble.severity} урона; ${fumble.failed?"заклинание не сработало":"заклинание всё ещё может сработать"}`);
      if(elemental)summary.push(ELEMENTAL_MISHAPS[element]);
      // TODO(core p.166): focus explosions affect nearby tokens/objects. Keep that adjudication
      // with the GM until area damage and equipment destruction have a shared combat workflow.
      if(fumble.explosion)summary.push("Фокусирующие предметы при себе взрываются: 1d10 урона в радиусе 2 м. Разрешите взрыв и уничтожение предметов с ведущим.");
      if(quote.focus?.greater)summary.push("Улучшенное фокусирующее: +2 к устанавливаемой заклинанием СЛ для противника (не к броску атаки).");
      const flavor=`<section class="witcher-magic-chat"><h3>${title}: ${escape(item.name)}</h3>`
        +`<p data-tooltip="${escape(calc)}">Воля + Сотворение заклинаний: ${quote.skill.total}</p>`
        +`<p>${escape(spellRange(item.system.range))} · ${escape(spellDuration(item.system.duration))}</p>`
        +`<p>Защита: ${escape(item.system.defense.map(key=>SPELL_DEFENSES[key]).join(" / "))}</p>`
        +`<ul>${summary.map(line=>`<li>${escape(line)}</li>`).join("")}</ul>`
        +`<details><summary>Действие заклинания</summary>${await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description,{secrets:false,relativeTo:item})}</details></section>`;
      const flags={[SYSTEM_ID]:{...display.flags[SYSTEM_ID],...(options.maintenance?{skipLuck:true}:{}),
        magicCast:{spellId:item.id,spellName:item.name,roundKey:quote.roundKey,stamina:quote.stamina,overload:quote.damage,fumble,maintenance:Boolean(options.maintenance)}}};
      const data={speaker:foundry.documents.ChatMessage.getSpeaker({actor}),flavor,flags};
      posted=roll?await roll.toMessage(data,{messageMode}):await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({...data,content:"Поддержание оплачено."},messageMode));
      if(!posted)throw new Error("Сообщение не создано; ресурсы не потрачены.");
      await display.wait(posted);
      const concentration=item.system.duration.kind==="sustained"&&!fumble.failed&&!(elemental&&element==="earth")
        &&actor.system.stamina.value>quote.stamina&&actor.system.health.value>quote.damage+fumble.severity;
      await actor.update({"system.stamina.value":Math.max(0,actor.system.stamina.value-quote.stamina),
        "system.health.value":actor.system.health.value-quote.damage-fumble.severity,
        "system.magic.roundKey":quote.roundKey,"system.magic.spent":quote.after,
        "system.magic.sustainedId":concentration?item.id:"","system.magic.maintainedRound":concentration?quote.roundKey:""});
      if(elemental) {
        const status={earth:"stunned",fire:"burning",water:"frozen"}[element];
        if(status)await setStatus(actor,status,true);
      }
      return posted;
    } catch(error) {
      if(posted)ui.notifications.error("Результат уже в чате, но расход магии не завершён. Проверьте ПЗ, Выносливость и состояния перед повторным броском.");
      throw error;
    } finally {display.close();}
  });
}

export function endConcentration(actor) {return inventoryWrite(actor,()=>actor.update({"system.magic.sustainedId":"","system.magic.maintainedRound":""}));}
export function resetMagicRound(actor) {
  if(game.combat?.started)throw new Error("В бою счётчик обновляется при смене раунда.");
  return inventoryWrite(actor,()=>actor.update({"system.magic.roundKey":"free","system.magic.spent":0,"system.magic.maintainedRound":""}));
}
