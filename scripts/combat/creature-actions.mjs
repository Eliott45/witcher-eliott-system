import { SYSTEM_ID } from "../config.mjs";
import { creatureProfile, creatureInvisible } from "../data/creature-modes.mjs";
import { skillValue } from "../data/skills.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { fullTurnStart, consumeAiming } from "./full-turn-rules.mjs";
import { actionQuote, actionUpdate, actionRoundKey } from "./action-economy.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { tokenGap, tokenCenter, withinFacing, facingModifiers } from "./attack-target.mjs";
import { weaponAttack, combatModifierParts } from "./weapon-rules.mjs";
import { weaponHitTraits } from "./weapon-hit-effects.mjs";
import { weaponDamageTraits, armorAt, resolveDamage, monsterMaterial, fireVulnerable } from "./damage-rules.mjs";
import { defenseChoices } from "./attack-exchange.mjs";
import { rollDefense } from "./defense-rolls.mjs";
import { spiritState, creatureSuppression, creatureMentalImmunity, creatureEffectImmunity, hymInShadow } from "./creature-spirits.mjs";
import { CREATURE_ACTIONS, needleDice, chargeProfile, pounceDistance, validateCreatureRange } from "./creature-actions-rules.mjs";
import { creatureFlags, activeCreatureGM, requireCreatureGM, creatureRoll, creaturePost, creatureEffect, addCreatureEffect,
  markCreatureFullTurn, creatureTargets, creaturesInRadius, pickCreaturePoint, moveCreatureTo, liveCreatureWeb, esc } from "./creature-actions-common.mjs";
import { createNoonDance, tickNoonDance, destroyNoonCopy, noonCopyState } from "./creature-actions-dance.mjs";
import { applyCreatureDamage } from "./creature-actions-damage.mjs";
import { registerCreatureVision } from "./creature-actions-vision.mjs";
import { rotfiendBlastHit, rotfiendBlastEffects } from "./rotfiend.mjs";
export { isCreatureSpecial, creatureSpecialDefenses, creatureHypnosisPenalty, creatureHypnosisSource } from "./creature-actions-rules.mjs";
export { tickNoonDance, destroyNoonCopy } from "./creature-actions-dance.mjs";

const pending=new Map();
function once(key,work) {
  if(pending.has(key))return pending.get(key);
  const result=Promise.resolve().then(work);pending.set(key,result);
  const clean=()=>{if(pending.get(key)===result)pending.delete(key);};result.then(clean,clean);return result;
}
function blocked(actor,id) {
  if(!activeCreatureGM())return "Действия выполняет активный ведущий";
  if(!actor.isOwner)return "Нет прав управления";
  if(CREATURE_ACTIONS[id]?.reaction)return "";
  if(!conditionRules(actor).canAct)return "Существо сейчас не может действовать";
  if(actor.effects.some(effect=>activeEffect(effect)&&creatureFlags(effect).creatureFullTurn))return "Полный ход уже потрачен";
  if(id==="teleport"&&!spiritState(actor).canTeleport)return `Телепортация подавлена: ${spiritState(actor).reason}`;
  if(id==="shadow-step"&&!hymInShadow(actor))return "Шаг сквозь тень возможен только в полумраке или темноте";
  if(["charge","hypnosis"].includes(id)&&creatureSuppression(actor).dimeritium&&["golem","fiend"].includes(creatureProfile(actor)?.id))return "Способность подавлена двимеритовой бомбой";
  return "";
}
export function creatureActions(actor) {
  const profile=creatureProfile(actor);
  if(actor?.type!=="npc"||!profile||creatureFlags(actor).noonCopy)return [];
  return Object.entries(CREATURE_ACTIONS).filter(([,rule])=>rule.profiles.includes(profile.id)).map(([id,rule])=>{
    const reason=blocked(actor,id);
    return {id,name:rule.name,disabled:Boolean(reason),reason,hint:reason||rule.hint||(rule.fullTurn?"Действие полного хода":rule.movement?"Перемещение":"Выберите цели на сцене")};
  });
}

async function payAction(actor,quote,rule,key) {
  const update=actionUpdate(actor,quote);if(Object.keys(update).length)await actor.update(update);
  await consumeAiming(actor);
  if(rule.fullTurn)await markCreatureFullTurn(actor,rule.name,key);
}
function oneTarget(actor,options,rule) {
  const context=creatureTargets(actor,options);
  if(context.targets.length!==1)throw new Error("Выберите одну цель клавишей T.");
  context.target=context.targets[0];context.distance=tokenGap(context.source,context.target);
  validateCreatureRange(rule,context.distance);return context;
}

async function postCreatureAttack(actor,id,rule,profile,options,quote) {
  const charge=id==="charge"?chargeProfile(profile.id):null;
  // A charge with its own printed distances (graveir: 5–10 m) replaces the Run limit.
  const {source,target,distance}=oneTarget(actor,options,charge?.min!==undefined?{...rule,min:charge.min,max:charge.max}:rule);
  let chargeEnd=null,overrun=null;
  if(charge) {
    if(charge.max===undefined&&distance>actor.system.statistics.run)throw new Error("Для разбега цель должна находиться в пределах Бега существа.");
    const a=tokenCenter(source),b=tokenCenter(target),length=Math.hypot(b.x-a.x,b.y-a.y)||1,grid=source.parent.grid;
    const separation=(Math.max(source.width,source.height)+Math.max(target.width,target.height))*grid.size/2;
    chargeEnd={x:b.x-(b.x-a.x)/length*separation,y:b.y-(b.y-a.y)/length*separation};
    if(source.object?.checkCollision(chargeEnd,{origin:a,type:"move",mode:"any"}))throw new Error("Разбег перекрыт преградой.");
    // On a miss the graveir runs on in a straight line for whatever is left of its charge.
    if(charge.overrun){const pixels=Math.max(0,charge.max-distance)/grid.distance*grid.size;overrun={from:chargeEnd,to:{x:chargeEnd.x+(b.x-a.x)/length*pixels,y:chargeEnd.y+(b.y-a.y)/length*pixels}};}
  }
  const weaponName=charge?.weapon??(id==="rock"?"Метательные камни":id==="web"?"Паутина":null);
  const item=weaponName?Array.from(actor.items).find(item=>item.type==="weapon"&&item.name===weaponName):null;
  if(weaponName&&!item)throw new Error(`Не найдено естественное оружие «${weaponName}». Восстановите предметы существа.`);
  let parts,total,damage,traits,hitTraits={},ranged=id!=="charge",band={id:"normal",dc:15};
  if(item) {
    const result=weaponAttack(actor,item,{mode:"npc",modifier:charge?charge.modifier??-4:0,extraPenalty:quote.penalty,ignoreNaturalRange:Boolean(charge),
      targetContext:{attacker:source,target,distance,...facingModifiers(source,target)}});
    if(result.blocked)throw new Error(result.blocked);
    parts=result.parts;total=result.total;damage=charge?.damage??(id==="web"?null:result.damage);traits=weaponDamageTraits(result.weapon);hitTraits=weaponHitTraits(result.weapon,actor);band=result.band;
  } else {
    const skill=skillValue(actor.system,rule.skill);
    if(skill.total===null)throw new Error("Заполните навык особой атаки.");
    parts=[{label:"Навык",value:skill.total},{label:"Дополнительное действие",value:quote.penalty},...combatModifierParts(actor,"combat.attack"),...facingModifiers(source,target).parts];
    total=parts.reduce((sum,part)=>sum+part.value,0);damage=null;traits={types:[],piercing:"none",silver:false,silverDice:""};
  }
  const roll=await creatureRoll(`1d10wc + ${total}`);
  const attack={itemId:item?.id??null,name:rule.name,mode:"creature",base:total,count:1,damage,location:charge?.location??"random",multiplier:1,body:0,bonus:0,
    target:target.uuid,attacker:source.uuid,parts,ranged,band:band.id,dc:band.dc??15,thrown:id==="rock",traits,hitTraits,attackingInvisible:creatureInvisible(actor),
    special:rule.special?`creature:${id}`:null,noCritical:Boolean(rule.special),defenses:rule.defenses,
    combat:game.combat?.started?{id:game.combat.id,round:game.combat.round}:null,
    creatureAction:{id,...(charge?{pushMeters:charge.pushMeters,...(charge.collision?{collision:charge.collision}:{}),...(charge.blockSave?{blockSave:charge.blockSave}:{}),...(overrun?{overrun}:{})}:{}),sourceDistance:distance}};
  const message=await creaturePost(actor,{title:rule.name,text:`Цель: <b>${esc(target.name)}</b>. ${rule.fullTurn?"Полный ход. ":""}${damage?`Урон ${esc(damage)}.`:"Результат применяется после защиты."}`,rolls:[roll],flags:{weaponAttack:attack,action:quote}});
  if(message){await payAction(actor,quote,rule,message.id);if(chargeEnd)await moveCreatureTo(source,chargeEnd);}
  return message;
}

async function areaAction(actor,id,rule,options,quote) {
  const {source,targets}=creatureTargets(actor,options);
  // A howl and a needle burst affect everyone in their radius, not only the selected enemies.
  const affected=id==="hypnosis"?Array.from(source.parent.tokens).filter(target=>target.actor&&target.uuid!==source.uuid&&withinFacing(target,source))
    :creaturesInRadius(source,rule.radius);
  if(!affected.length)throw new Error("В области действия нет других существ.");
  // A GM can explicitly select observers for hypnosis when walls or averted eyes matter.
  const finalTargets=id==="hypnosis"&&targets.length?affected.filter(target=>targets.some(chosen=>chosen.uuid===target.uuid)):affected;
  if(!finalTargets.length)throw new Error("Выбранные цели не смотрят на беса.");
  const attack=id==="hypnosis"?await creatureRoll(`1d10wc + ${skillValue(actor.system,"spellCasting").total+quote.penalty}`):null;
  const data={id,source:source.uuid,dc:rule.dc??null,total:attack?.total??null,
    targets:finalTargets.map(target=>({uuid:target.uuid,name:target.name,done:false}))};
  const message=await creaturePost(actor,{title:rule.name,text:finalTargets.map(target=>esc(target.name)).join(", "),rolls:attack?[attack]:[],flags:{creatureArea:data,action:quote}});
  if(message)await payAction(actor,quote,rule,message.id);
  return message;
}

/** Special NPC buttons. One elected GM and a shared action queue prevent simultaneous execution. */
export function useCreatureAction(actor,id,options={}) {
  return once(`action:${actor.uuid}`,()=>inventoryWrite(actor,async()=>{
    requireCreatureGM(actor);
    const profile=creatureProfile(actor),rule=CREATURE_ACTIONS[id];
    if(actor.type!=="npc"||!profile||!rule?.profiles.includes(profile.id)||creatureFlags(actor).noonCopy)throw new Error("У этого существа нет такого действия.");
    const reason=blocked(actor,id);if(reason)throw new Error(reason);
    if(rule.reaction) {
      const source=creatureEffect(actor,"staggered");
      await actor.createEmbeddedDocuments("ActiveEffect",[source]);
      return creaturePost(actor,{title:"Чувствительный слух",text:"Бес ошеломлён громким резким звуком до начала следующего хода."});
    }
    if(rule.movement) {
      const {source}=creatureTargets(actor,{...options,targets:[]}),max=["teleport","shadow-step"].includes(id)?10:pounceDistance(profile.id,actor.system.statistics);
      const round=actionRoundKey(actor);
      if(round&&creatureFlags(actor).creatureMovementRound===round)throw new Error("Особое передвижение в этом раунде уже использовано.");
      const point=await pickCreaturePoint(source,{destination:options.destination,max,title:rule.name,throughWalls:id==="teleport"});
      if(!point)return null;
      await moveCreatureTo(source,point);
      if(round)await actor.update({[`flags.${SYSTEM_ID}.creatureMovementRound`]:round});
      return creaturePost(actor,{title:rule.name,text:`Перемещение выполнено: до ${max} м${id==="pounce"?" без разбега":""}. Обычное действие остаётся.`});
    }
    const quote=actionQuote(actor);
    if(rule.fullTurn&&quote.extra)throw new Error("Действие полного хода нельзя выполнить дополнительным действием.");
    if(["needles","scream","hypnosis"].includes(id))return areaAction(actor,id,rule,options,quote);
    if(rule.hym||rule.pesta) {
      const message=rule.hym?await (await import("./hym.mjs")).useHymAction(actor,id,options,quote):await (await import("./pesta.mjs")).usePestaAction(actor,id,options);
      if(message)await payAction(actor,quote,rule,message.id);return message;
    }
    if(rule.fog) {
      const {useFogAction}=await import("./creature-fog.mjs");
      const message=await useFogAction(actor,id,options);if(message)await payAction(actor,quote,rule,message.id);return message;
    }
    if(id==="dance") {
      const message=await createNoonDance(actor,options);if(message)await payAction(actor,quote,rule,message.id);return message;
    }
    return postCreatureAttack(actor,id,rule,profile,options,quote);
  }));
}

function resolveToken(uuid) {return globalThis.fromUuidSync?.(uuid)??globalThis.canvas?.scene?.tokens?.find(token=>token.uuid===uuid)??null;}

/** Linked defenses call this on the elected GM; keys on both message and effect make retries harmless. */
export function applyCreatureSpecial(message,index,outcome) {
  return once(`special:${message.id}:${index}`,async()=>{
    if(!activeCreatureGM()||!outcome?.hit)return false;
    const attack=creatureFlags(message).weaponAttack,id=attack?.special?.replace("creature:","");
    if(!["web","whirlwind","swarm"].includes(id))return false;
    const target=resolveToken(attack.target)?.actor;if(!target?.isOwner)return false;
    const key=`${message.id}:${index}`,done=creatureFlags(message).creatureSpecialDone??{};
    if(done[index])return false;
    if(id==="swarm") {
      // Monster Hunter's Journal p.31: 2d6 to every body part and a 50% chance of disease.
      const {bodyWideHit,PESTA}=await import("./pesta.mjs");
      const hit=await bodyWideHit(target,"2d6"),immune=immuneToCondition(target,["diseased"])||hit.damage.total===0&&spiritState(target).incorporeal;
      const roll=immune?null:await creatureRoll("1d100"),ill=Boolean(roll&&roll.total<=PESTA.swarmDisease);
      await applyCreatureDamage(target,hit.damage,key,{effects:ill?[creatureEffect(target,"diseased")]:[]});
      await message.update({[`flags.${SYSTEM_ID}.creatureSpecialDone`]:{...creatureFlags(message).creatureSpecialDone,[index]:true}});
      const notes=[`${target.name}: ${hit.damage.total} урона по всем частям тела; болезнь ${PESTA.swarmDisease}%: ${immune?"невосприимчив":`${roll.total} — ${ill?"заболел":"обошлось"}`}.`];
      await creaturePost(target,{title:attack.name,text:esc(notes.join(" ")),rolls:[...hit.dice,...(roll?[roll]:[])],flags:{exchange:{attack:message.id,index,kind:"special",notes}}});
      return true;
    }
    let source,rolls=[],notes;
    if(id==="web") {
      source=creatureEffect(target,"grappled",{name:"Паутина главоглаза",flags:{creatureWeb:{hp:10,source:attack.attacker}},
        rules:{physical:true,save:{kind:"skill",skill:"physique",dc:16,ends:true,action:"Обычное действие"},autoSave:false,manualOnly:true}});
      source.description="<p>В захвате паутины: −2 к атаке и защите, нельзя перемещаться. Сила СЛ 16 или 10 урона паутине освобождают.</p>";
      notes=[`${target.name} в паутине: Сила СЛ 16 или 10 урона паутине.`];
    } else {
      let duration=creatureFlags(message).creatureDuration;
      if(!duration){const roll=await creatureRoll("1d6");duration=roll.total;rolls=[roll];await message.update({[`flags.${SYSTEM_ID}.creatureDuration`]:duration});}
      source=creatureEffect(target,"blinded",{rounds:duration,name:"Пылевой вихрь: слепота",rules:{physical:true,action:null}});
      notes=[`${target.name} ослеплён на ${duration} раундов.`];
    }
    if(!immuneToCondition(target,source.statuses)&&!creatureEffectImmunity(target,source))await addCreatureEffect(target,source,key);
    else notes=[`${target.name}: иммунитет к состоянию.`];
    await message.update({[`flags.${SYSTEM_ID}.creatureSpecialDone`]:{...creatureFlags(message).creatureSpecialDone,[index]:true}});
    await creaturePost(target,{title:attack.name,text:esc(notes.join(" ")),rolls,flags:{exchange:{attack:message.id,index,kind:"special",notes}}});
    return true;
  });
}

/** Resolve one fixed-DC area victim; the GM chooses block/dodge, and all rolls remain in chat. */
export function resolveCreatureArea(message,index,{mode="dodge",itemId=""}={}) {
  return once(`area:${message.id}:${index}`,async()=>{
    if(!activeCreatureGM()||!message.isContentVisible)return false;
    const data=creatureFlags(message).creatureArea,row=data?.targets[index];if(!row||row.done)return false;
    const token=resolveToken(row.uuid),target=token?.actor;if(!target?.isOwner)throw new Error("Цель недоступна.");
    const key=`${message.id}:area:${index}`;
    let result=row.result;
    if(!result) {
      if(data.id==="scream") {
        const roll=await creatureRoll("1d10"),threshold=Math.max(0,(target.system.statistics.stun??0)-1);
        result={success:roll.total<threshold,roll:roll.total,threshold};
        await creaturePost(target,{title:"Вопль: испытание Устойчивости −1",text:`${roll.total} < ${threshold}: ${result.success?"устоял":"дезориентирован"}.`,rolls:[roll]});
      } else if(data.id==="hypnosis") {
        const immune=creatureMentalImmunity(target,{mental:true});
        const roll=immune?null:await creatureRoll(`1d10wc + ${skillValue(target.system,"resistMagic").total}`);
        result={success:Boolean(immune)||roll.total>=data.total,roll:roll?.total??null,immune};
        await creaturePost(target,{title:"Сопротивление гипнозу",text:immune?esc(immune):`${roll.total} против ${data.total}: ${result.success?"не поддался":"под гипнозом"}.`,rolls:roll?[roll]:[]});
      } else if(data.id==="rotfiend-blast") {
        // Monster Hunter's Journal p.21: a shield block or Reposition against DC 15; no defense means the blast lands.
        let total=null;
        if(mode!=="none") {
          if(!["reposition","block"].includes(mode))throw new Error("От взрыва гнильца защищают только блок щитом или Смена позиции.");
          if(mode==="block"&&target.items.get(itemId)?.system.category!=="shield")throw new Error("Взрыв можно заблокировать только щитом.");
          const mark=creatureFlags(target).defenses,combat=game.combat,repeat=Boolean(combat?.started&&mark?.combat===combat.id&&mark.round===combat.round&&mark.count>0);
          const defense=await rollDefense(target,{mode,itemId,incoming:"melee",repeat});if(!defense)return false;
          if(combat?.started)await target.update({[`flags.${SYSTEM_ID}.defenses`]:{combat:combat.id,round:combat.round,count:repeat?mark.count+1:1}});
          total=defense.rolls[0].total;
        }
        const success=total!==null&&total>=data.dc,copy=Boolean(noonCopyState(token)),hit=success||copy?null:await rotfiendBlastHit(target);
        result={success,roll:total,damage:hit?.damage??null,endurance:hit?.endurance??null,nauseated:Boolean(hit?.nauseated)};
        await creaturePost(target,{title:`Взрыв гнильца: защита СЛ ${data.dc}`,rolls:hit?.rolls??[],text:success?`Защита ${total}: успех, взрыв не задел.`
          :copy?"Взрыв развеивает копию.":`${total===null?"Без защиты":`Защита ${total}`}: урон после брони ${hit.damage.total}; «Жуткий запах»; Стойкость ${hit.endurance} против СЛ 14 — ${hit.nauseated?"тошнота, пока не смоет ошмётки":"сдержался"}.`});
      } else {
        if(!["dodge","block"].includes(mode))throw new Error("От игл можно уклониться или заблокировать их.");
        const mark=creatureFlags(target).defenses,combat=game.combat,repeat=Boolean(combat?.started&&mark?.combat===combat.id&&mark.round===combat.round&&mark.count>0);
        const defense=await rollDefense(target,{mode,itemId,incoming:"ranged",repeat});if(!defense)return false;
        if(combat?.started)await target.update({[`flags.${SYSTEM_ID}.defenses`]:{combat:combat.id,round:combat.round,count:repeat?mark.count+1:1}});
        const dice=needleDice(defense.rolls[0].total),damage=dice?await creatureRoll(`${dice}d6`):null;
        const immune=spiritState(target).incorporeal,armor=armorAt(target,"torso"),calculated=damage&&!immune?resolveDamage({base:damage.total,location:"torso",multiplier:1,traits:{types:["piercing"],piercing:"none",silver:false},armor,
          monsterMaterial:monsterMaterial(target),vulnerableToFire:fireVulnerable(target)}):{total:0,ablate:[],steps:[]};
        result={success:!dice,roll:defense.rolls[0].total,dice,damage:calculated,immune};
        await creaturePost(target,{title:"Иглы трутня: защита СЛ 15",text:`Защита ${result.roll}: ${dice?immune?"иглы проходят сквозь бесплотное существо.":`${dice}d6, урон после брони ${calculated.total}; отравление.`:"успех, урона нет."}`,rolls:damage?[damage]:[]});
      }
      const rows=[...creatureFlags(message).creatureArea.targets];rows[index]={...rows[index],result};await message.update({[`flags.${SYSTEM_ID}.creatureArea.targets`]:rows});
    }
    if(!result.success) {
      if(data.id==="rotfiend-blast") {
        if(noonCopyState(token))await destroyNoonCopy(token);
        else await applyCreatureDamage(target,result.damage,key,{effects:rotfiendBlastEffects(target,result)});
      } else if(data.id==="needles") {
        if(noonCopyState(token))await destroyNoonCopy(token);
        else if(!result.immune)await applyCreatureDamage(target,result.damage,key,{effects:[creatureEffect(target,"poisoned")]});
      } else if(data.id==="scream")await addCreatureEffect(target,creatureEffect(target,"stunned"),key);
      else {
        const source=resolveToken(data.source);
        const effect={name:"Гипноз беса",type:"base",system:{},img:"icons/svg/eye.svg",statuses:[],start:fullTurnStart(target),
          duration:{value:5,units:"rounds",expiry:"turnStart",expired:false},description:"<p>−4 к атаке и защите против беса; окружающее пространство не видно в течение 5 раундов.</p>",
          flags:{[SYSTEM_ID]:{condition:{mental:true},creatureHypnosis:{sourceActor:source.actor.uuid,sourceToken:data.source}}}};
        await addCreatureEffect(target,effect,key);
      }
    }
    const rows=[...creatureFlags(message).creatureArea.targets];rows[index]={...rows[index],done:true};
    await message.update({[`flags.${SYSTEM_ID}.creatureArea.targets`]:rows});return true;
  });
}

export async function damageCreatureWeb(actor,amount,key) {
  requireCreatureGM(actor);const damage=Number(amount);if(!Number.isFinite(damage)||damage<=0)throw new Error("Укажите положительный урон паутине.");
  return once(`web:${actor.uuid}`,async()=>{
    const effect=liveCreatureWeb(actor);if(!effect)return false;
    const web=creatureFlags(effect).creatureWeb;if(web.receipts?.includes(key))return false;
    const hp=Math.max(0,web.hp-damage);
    if(!hp)await effect.delete();else await effect.update({[`flags.${SYSTEM_ID}.creatureWeb`]:{...web,hp,receipts:[...(web.receipts??[]),key]}});
    await creaturePost(actor,{title:"Паутина",text:hp?`Осталось ${hp} из 10 ПЗ.`:"Паутина разорвана, захват снят."});return true;
  });
}

/** Roll the held weapon's damage against the ten-HP web; its victim may still attack at the grapple penalty. */
export function attackCreatureWeb(actor,itemId=null) {
  return once(`webAttack:${actor.uuid}`,()=>inventoryWrite(actor,async()=>{
    requireCreatureGM(actor);if(!liveCreatureWeb(actor))throw new Error("Существо не опутано паутиной.");
    const weapons=equippedItems(actor.items).filter(item=>item.type==="weapon"&&!["ranged","thrown"].includes(item.system.category));
    if(!weapons.length)throw new Error("Возьмите оружие ближнего боя; без него можно разорвать паутину проверкой Силы СЛ 16.");
    let selected=itemId;
    if(!selected)selected=await foundry.applications.api.DialogV2.prompt({window:{title:"Ударить паутину"},content:`<label>Оружие<select name="weapon">${weapons.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}</select></label>`,rejectClose:false,
      ok:{label:"Бросить урон",callback:(_event,button)=>new FormData(button.form).get("weapon")}});
    if(!selected)return null;
    const item=weapons.find(item=>item.id===selected);if(!item)throw new Error("Оружие больше не доступно.");
    const action=actionQuote(actor),quote=weaponAttack(actor,item,{mode:actor.type==="npc"?"npc":"fast"});
    if(quote.blocked)throw new Error(quote.blocked);
    const damage=await creatureRoll(quote.damage),message=await creaturePost(actor,{title:"Удар по паутине",text:`${esc(item.name)}: ${damage.total} урона паутине.`,rolls:[damage]});
    if(!message)return null;
    if(damage.total>0)await damageCreatureWeb(actor,damage.total,message.id);
    await payAction(actor,action,{name:"Удар по паутине"},message.id);return message;
  }));
}

export function dispelSirenIllusion(siren,options={}) {
  return once(`dispel:${siren.uuid}`,async()=>{
    requireCreatureGM(siren);
    if(creatureProfile(siren)?.id!=="siren"||!siren.system.creature.illusion)throw new Error("У сирены нет активной иллюзии.");
    const {targets}=creatureTargets(siren,options);if(targets.length!==1)throw new Error("Выберите токен того, кто рассеивает иллюзию.");
    const caster=targets[0].actor;
    return inventoryWrite(caster,async()=>{
      const action=actionQuote(caster),skill=skillValue(caster.system,"spellCasting"),roll=await creatureRoll(`1d10wc + ${skill.total+action.penalty}`);
      const success=roll.total>=15;
      const message=await creaturePost(caster,{title:"Рассеивание иллюзии сирены",text:`Сотворение ${roll.total} против СЛ 15: ${success?"иллюзия рассеяна":"иллюзия сохранилась"}.`,rolls:[roll]});
      if(message){if(success)await siren.update({"system.creature.illusion":false});await payAction(caster,action,{name:"Рассеивание иллюзии"},message.id);}return message;
    });
  });
}

export function applyCreatureCollision(message,{meters,weight="light",obstacleUuid=""}={}) {
  return once(`collision:${message.id}`,async()=>{
    if(!activeCreatureGM()||!message.isContentVisible)return false;
    const state=creatureFlags(message).creatureCollision;if(!state||state.applied)return false;
    const target=resolveToken(state.target)?.actor;if(!target?.isOwner)throw new Error("Цель столкновения недоступна.");
    const distance=Number(meters),factor={veryLight:0.5,light:1,medium:2,heavy:3}[weight];
    if(!Number.isFinite(distance)||distance<0||distance>state.max||!factor)throw new Error("Проверьте расстояние полёта и категорию массы.");
    let result=state.result;
    if(!result) {
      // Graveir throws (Monster Hunter's Journal p.17): Xd6, X = half the metres flown, no mass factor.
      const half=state.formula==="half",extra=Math.min(5,Math.floor(distance/2));
      const formula=half?(Math.floor(distance/2)?`${Math.floor(distance/2)}d6`:"0"):`3d6${extra?` + floor(${extra}d6 * ${factor})`:""}`,roll=formula==="0"?{total:0}:await creatureRoll(formula);
      const damage=resolveDamage({base:roll.total,location:"torso",multiplier:1,traits:{types:["bludgeoning"],piercing:"none",silver:false},armor:armorAt(target,"torso"),monster:false});
      result={damage,formula};await message.update({[`flags.${SYSTEM_ID}.creatureCollision.result`]:result});
      await creaturePost(target,{title:"Столкновение после отбрасывания",text:`${distance} м; ${esc(formula)}, ${damage.total} урона после брони.`,rolls:formula==="0"?[]:[roll]});
    }
    const key=`collision:${message.id}`;
    await applyCreatureDamage(target,result.damage,key);
    await message.update({[`flags.${SYSTEM_ID}.creatureCollision.applied`]:true});return true;
  });
}

/** Applied ordinary charge damage calls this; movement is stored once, even when chat rerenders. */
export function onCreatureExchangeApplied(message,index,result) {
  return once(`push:${message.id}:${index}`,async()=>{
    if(!activeCreatureGM()||result?.immune)return;
    if(creatureFlags(message).weaponAttack?.creatureAction?.id==="charge")await pushChargeTarget(message,index);
  });
}
/** Knock the charge target back once; a failed Physique save after a block throws it the same way. */
async function pushChargeTarget(message,index) {
  {
    const attack=creatureFlags(message).weaponAttack;
    const key=`${message.id}:${index}`,target=resolveToken(attack.target),source=resolveToken(attack.attacker);
    if(!target||!source||creatureFlags(target).creaturePushes?.includes(key))return;
    const a=tokenCenter(source),b=tokenCenter(target),length=Math.hypot(b.x-a.x,b.y-a.y)||1,meters=attack.creatureAction.pushMeters,pixels=meters/target.parent.grid.distance*target.parent.grid.size;
    let point={x:b.x+(b.x-a.x)/length*pixels,y:b.y+(b.y-a.y)/length*pixels};
    const collision=Boolean(target.object?.checkCollision(point,{origin:b,type:"move",mode:"any"}));
    if(collision) {
      let low=0,high=1;for(let i=0;i<12;i++){const mid=(low+high)/2,p={x:b.x+(point.x-b.x)*mid,y:b.y+(point.y-b.y)*mid};if(target.object.checkCollision(p,{origin:b,type:"move",mode:"any"}))high=mid;else low=mid;}
      point={x:b.x+(point.x-b.x)*low,y:b.y+(point.y-b.y)*low};
    }
    const size=target.getSize();await target.update({x:Math.round(point.x-size.width/2),y:Math.round(point.y-size.height/2),
      [`flags.${SYSTEM_ID}.creaturePushes`]:[...(creatureFlags(target).creaturePushes??[]).slice(-29),key]});
    await creaturePost(target.actor,{title:"Отбрасывание",text:`${esc(target.name)} отброшен до ${meters} м.${collision?" Путь остановила преграда: примените столкновение.":""}`,
      flags:{creatureCollision:{target:target.uuid,max:meters,applied:false,...(attack.creatureAction.collision?{formula:attack.creatureAction.collision}:{})}}});
  }
}

/** Monster Hunter's Journal p.17, graveir: a blocked charge forces Physique DC 25; a dodged one runs on to the full distance. */
export function onCreatureChargeMissed(message,index,outcome) {
  return once(`chargeMiss:${message.id}:${index}`,async()=>{
    if(!activeCreatureGM()||!outcome||outcome.hit||outcome.limbBlock)return false;
    const attack=creatureFlags(message).weaponAttack,action=attack?.creatureAction;
    if(action?.id!=="charge"||!(action.blockSave||action.overrun)||creatureFlags(message).creatureChargeMiss?.[index])return false;
    await message.update({[`flags.${SYSTEM_ID}.creatureChargeMiss`]:{...creatureFlags(message).creatureChargeMiss,[index]:true}});
    if(outcome.mode==="block") {
      const target=resolveToken(attack.target)?.actor;if(!action.blockSave||!target)return false;
      const {skill,dc}=action.blockSave,roll=await creatureRoll(`1d10wc + ${skillValue(target.system,skill).total??0}`),held=roll.total>=dc;
      await creaturePost(target,{title:`Удар с разбега заблокирован: Сила СЛ ${dc}`,rolls:[roll],text:`${roll.total} против СЛ ${dc}: ${held?"устоял на ногах":"отброшен"}.`});
      if(!held)await pushChargeTarget(message,index);
      return true;
    }
    if(outcome.mode==="parry"||!action.overrun)return false;
    const source=resolveToken(attack.attacker);if(!source?.actor)return false;
    const {from,to}=action.overrun,hits=point=>Boolean(source.object?.checkCollision(point,{origin:from,type:"move",mode:"any"}));
    let point=to;const wall=hits(to);
    if(wall){let low=0,high=1;for(let i=0;i<12;i++){const mid=(low+high)/2;if(hits({x:from.x+(to.x-from.x)*mid,y:from.y+(to.y-from.y)*mid}))high=mid;else low=mid;}point={x:from.x+(to.x-from.x)*low,y:from.y+(to.y-from.y)*low};}
    await moveCreatureTo(source,point);
    const stunned=wall&&!immuneToCondition(source.actor,["stunned"]);
    if(stunned)await addCreatureEffect(source.actor,creatureEffect(source.actor,"stunned"),`chargeWall:${message.id}:${index}`);
    await creaturePost(source.actor,{title:"Промах с разбега",text:wall?`${esc(source.name)} врезается в преграду${stunned?" и дезориентирован до успешного испытания Устойчивости":""}.`:`${esc(source.name)} пробегает оставшуюся дистанцию по прямой.`});
    return true;
  });
}

/** Applied damage may be authored by a player; only the elected GM moves the token. */
export async function onCreatureAppliedMessage(message) {
  if(!activeCreatureGM()||!message.isContentVisible)return;
  const link=creatureFlags(message).exchange;
  if(link?.kind!=="applied"||link.immune||link.copyDestroyed||!Number.isInteger(link.index)||link.index<0)return;
  const attackMessage=game.messages.get(link.attack),attack=creatureFlags(attackMessage).weaponAttack;
  if(attack?.creatureAction?.id!=="charge"||link.index>=(attack.count??1))return;
  await onCreatureExchangeApplied(attackMessage,link.index,link);
}

export function registerCreatureActions() {
  registerCreatureVision();
  Hooks.on("createChatMessage",message=>onCreatureAppliedMessage(message).catch(error=>ui.notifications.error(error.message)));
  Hooks.on("renderChatMessageHTML",(message,html)=>{
    const collision=creatureFlags(message).creatureCollision;
    if(collision&&!collision.applied) {
      const button=document.createElement("button");button.type="button";button.textContent="Столкновение с преградой";button.disabled=!activeCreatureGM();
      button.addEventListener("click",async()=>{
        const choices=await foundry.applications.api.DialogV2.prompt({window:{title:"Столкновение"},rejectClose:false,
          content:collision.formula==="half"?`<p>Урон Xd6, где X — половина пролетевших метров.</p><label>Пролетел метров<input name="meters" type="number" min="0" max="${collision.max}" step="0.1" value="${collision.max}"></label>`:`<p>Таранный урон как от лошади: 3d6 + до 5d6 за расстояние, с множителем массы.</p><label>Пролетел метров<input name="meters" type="number" min="0" max="${collision.max}" step="0.1" value="${collision.max}"></label><label>Масса препятствия<select name="weight"><option value="veryLight">Очень лёгкая ×½</option><option value="light" selected>Лёгкая ×1</option><option value="medium">Средняя ×2</option><option value="heavy">Тяжёлая ×3</option></select></label>`,
          ok:{label:"Бросить и применить",callback:(_event,control)=>Object.fromEntries(new FormData(control.form))}});
        if(choices)try{await applyCreatureCollision(message,choices);}catch(error){ui.notifications.error(error.message);}
      });(html.querySelector(".message-content")??html).append(button);
    }
    const data=creatureFlags(message).creatureArea;
    if(data) {
      const box=document.createElement("div");box.className="witcher-exchange";
      box.innerHTML=data.targets.map((row,index)=>{
        if(row.done)return `<p>${esc(row.name)}: результат применён.</p>`;
        const target=resolveToken(row.uuid)?.actor;
        const choices=data.id==="needles"&&target?defenseChoices(target,"ranged",0,["dodge","block"]).filter(choice=>!choice.blocked)
          :data.id==="rotfiend-blast"&&target?[...defenseChoices(target,"melee",0,["reposition","block"]).filter(choice=>!choice.blocked&&(choice.mode!=="block"||target.items.get(choice.itemId)?.system.category==="shield")),{mode:"none",itemId:"",name:"Не защищается"}]
          :[{mode:"dodge",itemId:"",name:"Бросить и применить"}];
        return `<div><b>${esc(row.name)}</b>${choices.map(choice=>`<button type="button" data-creature-area="${index}" data-mode="${choice.mode}" data-item="${esc(choice.itemId??"")}" ${activeCreatureGM()?"":"disabled"}>${esc(choice.name)}${choice.weaponName?` · ${esc(choice.weaponName)}`:""}</button>`).join("")}</div>`;
      }).join("");
      for(const button of box.querySelectorAll("[data-creature-area]"))button.addEventListener("click",async()=>{button.disabled=true;try{await resolveCreatureArea(message,Number(button.dataset.creatureArea),{mode:button.dataset.mode,itemId:button.dataset.item});}catch(error){ui.notifications.error(error.message);button.disabled=false;}});
      (html.querySelector(".message-content")??html).append(box);
    }
  });
}
