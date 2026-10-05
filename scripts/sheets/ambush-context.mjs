import { COMBAT_ACTOR_TYPES } from "../config.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { ambushAttack, ambushState, combatantForToken, tacticsFlags } from "../combat/tactics-rules.mjs";
import { attackModes, weaponAttack, signed } from "../combat/weapon-rules.mjs";
import { facingModifiers } from "../combat/attack-target.mjs";
import { actionQuote } from "../combat/action-economy.mjs";

export function ambushCandidates(attacker, scene = globalThis.canvas?.scene, user = game.user) {
  if(scene?.id!==attacker.parent.id)return [];
  return Array.from(scene.tokens).filter(token => token.uuid!==attacker.uuid && COMBAT_ACTOR_TYPES.includes(token.actor?.type)
    && (user.isGM || (!token.hidden && token.object?.isVisible))).map(token => ({
      token,uuid:token.uuid,name:token.name,img:token.texture?.src||"icons/svg/mystery-man.svg",
      enemy:attacker.disposition===-1?token.disposition===1:token.disposition===-1,
      relation:token.disposition===1?"Дружественный":token.disposition===-1?"Враждебный":"Нейтральный"
    })).sort((a,b)=>Number(b.enemy)-Number(a.enemy)||a.name.localeCompare(b.name,"ru")||a.uuid.localeCompare(b.uuid));
}

export function defaultAmbushSelection(attacker, candidates, combat=game.combat) {
  const combatant=combatantForToken(combat,attacker);
  const stored=tacticsFlags(combatant).ambushReport?.targets ?? ambushState(combat,combatant)?.targets;
  const targeted=Array.from(game.user.targets??[],token=>(token.document??token).uuid);
  const ids=new Set(stored??(candidates.some(row=>targeted.includes(row.uuid))?targeted:candidates.filter(row=>row.enemy).map(row=>row.uuid)));
  return new Set(candidates.filter(row=>ids.has(row.uuid)).map(row=>row.uuid));
}

export function ambushWindowContext(actor, attacker, {selection=new Set(),weaponId="",mode="",busy=false}={}) {
  const combat=game.combat,combatant=combatantForToken(combat,attacker),flags=tacticsFlags(combatant);
  const state=ambushState(combat,combatant),checked=new Set(flags.ambushReport?.targets??state?.targets??[]);
  const pending=busy||Boolean(flags.tacticRequest),candidates=ambushCandidates(attacker);
  const ended=Boolean(combat?.round>1),opening=Boolean(state?.opening&&!combat?.started);
  const choices=equippedItems(actor.items).filter(item=>item.type==="weapon").flatMap(item=>attackModes(actor,item).map(attack=>({
    item,weaponId:item.id,mode:attack.id,value:`${item.id}:${attack.id}`,label:`${item.name} · ${opening&&attack.id==="fast"?"Быстрая атака":attack.name}`
  })));
  const selected=choices.find(choice=>choice.weaponId===weaponId&&choice.mode===mode)??choices[0];
  let action,attackReason="";
  try{action=actionQuote(actor,{ignoreExtra:opening});}catch(error){attackReason=error.message;}
  const rows=candidates.map(row=>{
    const tested=checked.has(row.uuid),unnoticed=Boolean(state?.targets.includes(row.uuid)),facing=facingModifiers(attacker,row.token);
    const quote=selected?weaponAttack(actor,selected.item,{mode:selected.mode,targetContext:facing,
      ambushBonus:ambushAttack(combat,attacker,row.token).bonus,opening,extraPenalty:action?.penalty??0}):null;
    const reason=attackReason||quote?.blocked||(!selected?"Возьмите оружие в руки":"");
    return {uuid:row.uuid,name:row.name,img:row.img,enemy:row.enemy,relation:row.relation,search:row.name.toLocaleLowerCase(),
      selected:selection.has(row.uuid),tested,unnoticed,noticed:tested&&!unnoticed,
      status:ended?"Засада завершена":tested?(unnoticed?"Не заметил":"Заметил"):"Не проверен",bonus:unnoticed&&!ended?"+5":"—",
      disabled:pending||Boolean(combat?.started)||!actor.isOwner,
      canReveal:unnoticed&&!pending&&!ended&&actor.isOwner,
      attackDisabled:pending||ended||!tested||!state||Boolean(reason),attackReason:reason,
      attackBase:quote?.total==null?"—":signed(quote.total),damage:quote?.damage??"",
      attackHint:reason||quote?.parts.filter(part=>part.value).map(part=>`${part.label}: ${signed(part.value)}`).join("; ")||"",
      rollCount:quote?.attack.count??0};
  });
  let reason="";
  if(canvas.scene?.id!==attacker.parent.id)reason="Вернитесь на сцену атакующего.";
  else if(!actor.isOwner||!conditionRules(actor).canAct)reason="Персонаж сейчас не может действовать.";
  else if(combat?.started)reason=ended?"Первый раунд завершён — бонусы засады сняты.":"Первый раунд: +5 сохраняется против незаметивших вас противников.";
  else if(combat?.scene&&combat.scene.id!==attacker.parent.id)reason="Откройте бой для этой сцены.";
  else if(!combat&&!game.user.isGM)reason="Мастер должен создать бой в трекере, не начиная первый раунд.";
  else if(!game.users.activeGM)reason="Нужен подключённый мастер.";
  const count=rows.filter(row=>row.selected).length;
  return {actorName:actor.name,attackerName:attacker.name,attackerImg:attacker.texture?.src||"icons/svg/mystery-man.svg",
    rows,selectedCount:count,unnoticedCount:rows.filter(row=>row.unnoticed&&!ended).length,noticedCount:rows.filter(row=>row.noticed).length,
    choices:choices.map(choice=>({value:choice.value,label:choice.label,selected:choice===selected})),
    weaponId:selected?.weaponId??"",mode:selected?.mode??"",pending,ended,opening,hasReport:checked.size>0,
    canSelect:!pending&&!combat?.started&&actor.isOwner,canCheck:!reason&&!pending&&count>0,
    checkLabel:checked.size?"Проверить выбранных заново":"Проверить засаду",reason,
    phase:pending?"Проверяем противников…":ended?"Засада завершена":opening?"Выберите цель первой атаки":checked.size?"Результаты засады":"Отметьте противников"};
}
