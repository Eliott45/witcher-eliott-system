import { schoolGearSnapshot, validateSchoolReaction, schoolReactionTarget } from "./school-gear-rules.mjs";
import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { actionQuote, actionNote, actionUpdate } from "./action-economy.mjs";
import { weaponAttack, signed, hitLocation } from "./weapon-rules.mjs";
import { damageTypeLabel, weaponDamageTraits } from "./damage-rules.mjs";
import { weaponHitTraits } from "./weapon-hit-effects.mjs";
import { chooseArrow, ammunitionWeapon } from "./bow-ammo.mjs";
import { useCreatureAction } from "./creature-actions.mjs";
import { creatureInvisible } from "../data/creature-modes.mjs";
import { afterCreatureAttack } from "./creature-modes.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { consumeAiming } from "./full-turn-rules.mjs";
import { selectedAttackTarget } from "./attack-target.mjs";
import { ambushAttack, ambushState, tacticsFlags } from "./tactics-rules.mjs";
import { unarmedAttack, consumeFeint } from "./brawling.mjs";
import { loadedBolt, firedUpdate } from "./crossbow-ammo.mjs";
import { actorEnvironment, rollFooting } from "./environment.mjs";
import { adrenalineDamage, consumeAdrenalineDamage } from "./adrenaline.mjs";
import { experimentalEffectContext, furyTargetError } from "./experimental-effects.mjs";
import { thrownWeaponPlan, settleThrownWeapon } from "./thrown-weapons.mjs";

/** Pair state of a fast attack: the second click in the same round (and extra-action status) is strike 2/2. */
export function fastPair(actor,attack,action) {
  if(!attack?.pair)return null;
  const key=action.roundKey||"free",pending=actor.flags?.[SYSTEM_ID]?.fastStrike;
  return {key,second:Boolean(pending&&pending.round===key&&pending.extra===action.extra)};
}

export function attackModifierMarkup(parts) {
  return `<ul class="witcher-attack-modifiers">${parts.filter(part=>part.value&&part.label!=="Основа навыка").map(part=>
    `<li class="${part.value>0?"is-bonus":"is-penalty"}"><span>${esc(part.label)}</span><b>${signed(part.value)}</b></li>`).join("")}</ul>`;
}

const pending = new WeakMap();
export function rollWeaponAttack(actor,itemId,options={}) {
  const creatureWeapon=actor.items.get(itemId)?.system.ruleId;
  if(creatureWeapon==="creature.weapon.endrega-drone.1")return useCreatureAction(actor,"needles",options);
  if(creatureWeapon==="creature.weapon.arachas.1")return useCreatureAction(actor,"web",options);
  if(pending.has(actor))return pending.get(actor);
  const work=inventoryWrite(actor,async()=>{
    const reaction = validateSchoolReaction(actor, options.schoolReaction, actor.items.get(itemId), options);
    if (reaction) options = { ...options, attackerUuid: reaction.attackerUuid, targetUuid: schoolReactionTarget(reaction, options.targetUuid) };
    const targetContext=selectedAttackTarget(actor,options),combat=options.combatId?game.combats.get(options.combatId):globalThis.game?.combat;
    if (experimentalEffectContext(actor).fury && !targetContext?.target) throw new Error("Бешенство: выберите ближайшую цель (T).");
    const furyError = furyTargetError(actor, targetContext?.target);
    if (furyError) throw new Error(furyError);
    const group=tacticsFlags(combat).groupAmbush;
    const actorCombatants=Array.from(combat?.combatants??[]).filter(entry=>entry.actor?.uuid===actor.uuid);
    if(group?.status==="checks"&&!combat.started&&group.entries.some(row=>actorCombatants.some(entry=>entry.id===row.id))) {
      throw new Error("Дождитесь завершения проверок засады.");
    }
    if(actorCombatants.some(entry=>tacticsFlags(entry).tacticRequest))throw new Error("Дождитесь завершения запроса в трекере боя.");
    if(!targetContext&&actorCombatants.some(entry=>ambushState(combat,entry)))throw new Error("Выберите цель атаки, чтобы учесть засаду.");
    const ambush=targetContext?ambushAttack(combat,targetContext.attacker,targetContext.target):{bonus:0};
    const item=itemId?actor.items.get(itemId):null,action=actionQuote(actor,{ignoreExtra:Boolean(reaction)}),attackOptions={...options,schoolReaction:Boolean(reaction),extraPenalty:action.penalty,targetContext,ambushBonus:ambush.bonus};
    // Unarmed strikes (core p.163) share the attack card; the second blow of a joint attack is part of the same action.
    const quote=options.unarmed?unarmedAttack(actor,options.unarmed,attackOptions):weaponAttack(actor,item,attackOptions);
    if(quote.blocked)throw new Error(quote.blocked);
    if (reaction && !targetContext) throw new Error("Токены участников этого обмена больше недоступны.");
    if (reaction && !quote.ranged && targetContext.distance > Math.max(item.system.range || 1, /длинное/iu.test(item.system.properties ?? "") ? 2 : 1)) throw new Error("Противник вне досягаемости оружия для ответного удара.");
    const arrow = await chooseArrow(actor,item,quote.attack.count,options.ammoId);
    if (arrow === false) return;
    const bolt=quote.ranged?loadedBolt(item):null, projectile=arrow || bolt;
    quote.weapon=ammunitionWeapon(quote.weapon,projectile);
    const thrown = thrownWeaponPlan(actor, item, quote, { targetContext, point: options.point });
    if (projectile && /несмертельн/iu.test(projectile.properties ?? "")) quote.nonLethal=true;
    if(options.free){action.stamina=0;}
    // The second strike of a fast attack belongs to the same action: no new STA for an extra action.
    const pair=reaction?null:fastPair(actor,quote.attack,action),strike=pair?(pair.second?2:1):0;
    if(pair?.second)action.stamina=0;
    const adrenalineDice = adrenalineDamage(actor);
    const display=trackRollDisplay(),messageMode=game.settings.get("core","messageMode");
    try {
      const rolls=[];
      for(let i=0;i<quote.attack.count;i++)rolls.push(await evaluateRoll(`1d10wc + ${quote.total}`,{allowInteractive:messageMode!=="blind"},{}, {flavor:`${quote.name} · ${i+1}/${quote.attack.count}`}));
      const math=quote.parts.filter(part=>part.value||part.label==="Основа навыка").map(part=>`${part.label}: ${signed(part.value)}`).join("; ");
      const types=damageTypeLabel(quote.weapon.damageType);
      const notes=[quote.ranged&&quote.band.distance!=null?`${quote.band.name} (дальность оружия ${quote.range} м).`:"",projectile?`${arrow?"Стрелы":"Болт"}: ${projectile.name}${projectile.properties?` (${projectile.properties})`:""}.`:"",quote.nonLethal?"Несмертельный урон: отнимает Выносливость.":"",quote.attack.charge?"С разбега: полный ход. Если удар заблокируют — Сила против Силы, чтобы сбить с ног.":"",
        quote.attack.push?"Толчок: цель отлетает на ТЕЛ/3 м.":"",quote.attack.dual?"Парная атака: блок и парирование — только с двумя оружиями или оружием и щитом.":"",quote.attack.hint&&quote.attack.special?quote.attack.hint:""].filter(Boolean);
      const flavor=`<section class="witcher-attack-chat"><h3>${esc(quote.name)} · ${esc(quote.attack.name)}${strike?` ${strike}/2`:""}</h3>${notes.map(note=>`<p class="witcher-attack-note">${esc(note)}</p>`).join("")}${types?`<p class="witcher-damage-type">Урон: ${esc(types)}</p>`:""}<p data-tooltip="${esc(math)}">База проверки <b>${signed(quote.total)}</b> · ${quote.attack.count} ${quote.attack.count===1?"бросок":"броска"}</p>`
        +(targetContext?`<p>Цель: <b>${esc(targetContext.target.name)}</b></p>`:"<small>Цель не выбрана — направление взгляда не учтено.</small>")
        +attackModifierMarkup(quote.parts)
        +(targetContext?.blind?"<small>Вне конуса зрения: бонус прицеливания не применяется.</small>":"")
        +`<p>${esc(quote.aim.name)}${quote.aim.id!=="random"?` · урон ×${quote.aim.multiplier} после брони`:" · место попадания после успешной атаки"}</p>`
        +(reaction?`<p>${esc(reaction.title)}: одно немедленное действие без дополнительной платы ВЫН.</p>`:actionNote(action))+(quote.damage?`<button type="button" data-weapon-damage><i class="fa-solid fa-dice-d6"></i> Урон: ${esc(quote.damage)}</button>`:"")
        +(quote.aim.id==="random"?'<div class="witcher-location-buttons"><button type="button" data-hit-location="humanoid">Место: гуманоид</button><button type="button" data-hit-location="monster">Место: чудовище</button></div>':"")
        +(actorEnvironment(actor)?.terrain.id==="snow"?'<button type="button" data-snow-footing><i class="fa-solid fa-person-falling"></i> Лёд и снег: Атлетика СЛ 14</button>':"")
        +`<small>Каждое попадание — отдельный урон и зона. Сравните атаку с защитой цели.</small></section>`;
      const message=await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),rolls,flavor,
        flags:{[SYSTEM_ID]:{...display.flags[SYSTEM_ID],action,...(reaction?{schoolReaction:{...options.schoolReaction}}:{}),weaponAttack:{...thrown,schoolGear:schoolGearSnapshot(actor,item),schoolShieldStrike:reaction?.school==="manticore",itemId:itemId??null,name:quote.name,mode:quote.attack.id,unarmed:options.unarmed??null,nonLethal:Boolean(quote.nonLethal),
          special:quote.attack.special??null,attackingInvisible:creatureInvisible(actor),charge:Boolean(quote.attack.charge),push:Boolean(quote.attack.push),dual:Boolean(quote.attack.dual),base:quote.total,count:quote.attack.count,
          damage:quote.damage,adrenalineDice,weaponProperties:quote.weapon.properties,traits:weaponDamageTraits(quote.weapon),hitTraits:weaponHitTraits(quote.weapon,actor),ammunition:projectile?{name:projectile.name,ruleId:projectile.ruleId}:null,location:quote.aim.id,multiplier:quote.aim.multiplier,body:quote.body,bonus:quote.bonus,
          target:targetContext?.target.uuid??null,attacker:targetContext?.attacker.uuid??null,parts:quote.parts,ranged:quote.ranged,band:quote.band.id,dc:quote.band.dc??null,thrown:quote.weapon.category==="thrown",combat:combat?.started?{id:combat.id,round:combat.round}:null,strike,damageTypes:damageTypeLabel(quote.weapon.damageType)}}}},messageMode));
      if(!message)return;
      if(thrown)try{await settleThrownWeapon(actor,item,message);}catch(error){ui.notifications.error(error.message);}
      if(adrenalineDice)await consumeAdrenalineDamage(actor);
      await display.wait(message);
      const update=options.free||reaction?{}:actionUpdate(actor,action);
      if(pair&&!pair.second){delete update["system.combatAction.extra"];delete update["system.combatAction.lastExtraRound"];}
      if(!options.free&&!reaction)update[`flags.${SYSTEM_ID}.fastStrike`]=pair&&!pair.second?{round:pair.key,extra:action.extra,itemId:itemId??""}:null;
      if(bolt)update.items=[firedUpdate(item)];
      if(arrow)update.items=[...(update.items??[]),{_id:arrow.item.id,"system.quantity":arrow.item.system.quantity-arrow.count}];
      if(Object.keys(update).length)await actor.update(update);
      await afterCreatureAttack(actor);
      await consumeAiming(actor);
      await consumeFeint(actor);
      return message;
    } finally {display.close();}
  });
  pending.set(actor,work);
  const clear=()=>{if(pending.get(actor)===work)pending.delete(actor);};work.then(clear,clear);
  return work;
}

export async function rollWeaponDamage(message) {
  const actor=message.speakerActor,attack=message.flags[SYSTEM_ID]?.weaponAttack;
  if(!actor?.isOwner||!message.isContentVisible||!attack)return;
  const mode=message.blind?"blind":message.whisper?.length?"gm":"public";
  const formula=attack.adrenalineDice?`${attack.damage} + ${attack.adrenalineDice}d6`:attack.damage;
  const roll=await evaluateRoll(formula,{allowInteractive:!message.blind});
  // Use the attack snapshot: changing grip/stats after the attack cannot change its damage.
  return roll.toMessage({speaker:{...message.speaker},whisper:[...message.whisper],blind:message.blind,
    flavor:`<h3>${esc(attack.name)} · урон</h3><p>До вычета брони. ${attack.location==="random"?"Определите место попадания (1d10).":`После брони примените множитель зоны ×${attack.multiplier}.`}</p><small>ПЗ цели и повреждение брони изменяются вручную.</small>`,
    flags:{[SYSTEM_ID]:{skipLuck:true,weaponDamage:{sourceId:message.id,itemId:attack.itemId}}}},{messageMode:mode});
}
export async function rollHitLocation(message,bodyPlan) {
  if(!message.speakerActor?.isOwner||!message.isContentVisible||message.flags[SYSTEM_ID]?.weaponAttack?.location!=="random")return;
  hitLocation(1,bodyPlan);
  const roll=await evaluateRoll("1d10",{allowInteractive:!message.blind});
  const location=hitLocation(roll.total,bodyPlan);
  return roll.toMessage({speaker:{...message.speaker},whisper:[...message.whisper],blind:message.blind,
    flavor:`<section class="witcher-attack-chat"><h3>${esc(message.flags[SYSTEM_ID].weaponAttack.name)} · ${location.name}</h3><p>${bodyPlan==="humanoid"?"Гуманоид":"Чудовище"}: ${roll.total} на 1d10 → урон ×${location.multiplier} после брони.</p>${location.id==="tail"?"<p>Если у чудовища нет хвоста и крыльев, попадание приходится в левую конечность (×½).</p>":""}</section>`,
    flags:{[SYSTEM_ID]:{skipLuck:true,hitLocation:{sourceId:message.id,bodyPlan,id:location.id,multiplier:location.multiplier}}}},
    {messageMode:message.blind?"blind":message.whisper?.length?"gm":"public"});
}
export function registerWeaponChat() {
  Hooks.on("renderChatMessageHTML",(message,html)=>{
    for(const button of html.querySelectorAll("[data-weapon-damage]")) {
      button.disabled=!message.speakerActor?.isOwner||!message.isContentVisible;
      button.addEventListener("click",async()=>{button.disabled=true;try{await rollWeaponDamage(message);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=!message.speakerActor?.isOwner;}});
    }
    for(const button of html.querySelectorAll("[data-snow-footing]")) {
      button.disabled=!message.speakerActor?.isOwner||Boolean(message.flags[SYSTEM_ID]?.footing);
      button.addEventListener("click",async()=>{button.disabled=true;try{await rollFooting(message.speakerActor);await message.setFlag(SYSTEM_ID,"footing",true);}catch(error){ui.notifications.error(error.message);button.disabled=false;}});
    }
    for(const button of html.querySelectorAll("[data-hit-location]")) {
      button.disabled=!message.speakerActor?.isOwner||!message.isContentVisible;
      button.addEventListener("click",async()=>{button.disabled=true;try{await rollHitLocation(message,button.dataset.hitLocation);}catch(error){ui.notifications.error(error.message);}finally{button.disabled=!message.speakerActor?.isOwner;}});
    }
  });
}
