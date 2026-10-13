import assert from "node:assert/strict";
import { RADOLF_ACTOR_ID } from "../scripts/data/radolf-npc.mjs";
import { SYSTEM_ID } from "../scripts/config.mjs";
import { weaponAttack } from "../scripts/combat/weapon-rules.mjs";
import { armorAt } from "../scripts/combat/damage-rules.mjs";
import { WitcherNPCSheet } from "../scripts/sheets/witcher-npc-sheet.mjs";

export async function checkNativeRadolfNPC(views,template) {
  const {actor,sheet,view,html}=views.find(entry=>entry.actor.id===RADOLF_ACTOR_ID);
  assert.equal(actor.validate({strict:true}),true);
  assert.equal(actor.system.statistics.carryMax,95);assert.equal(actor.system.statistics.naturalArmor,2);
  assert.equal(view.naturalArmor,2);assert.equal(view.luck.maximum,10);
  assert.deepEqual(view.languages.map(entry=>entry.total),[10,10]);
  assert.ok(html.includes("Неоплаченные счета из таверн и трактиров"));
  assert.equal((html.match(/data-action="rollProfessionAbility"/gu)??[]).length,6);
  assert.ok(!html.includes('data-action="creatureDeath"'));assert.ok(!html.includes('data-action="deathSave"'));
  const attacks=[["weapon.short-dagger",12,"(2d6+4)",2],["weapon.dwarven-heavy-crossbow",19,"(5d6)",1],["weapon.dwarven-axe",15,"(5d6+7)",2]];
  for(const [id,base,damage,rate] of attacks) {
    const item=actor.items.find(item=>item.system.ruleId===id);
    const original=item.toObject();
    item.updateSource({"system.equipped":true,"system.loaded":true,"system.grip":item.system.hands});
    const quote=weaponAttack(actor,item,{mode:"npc"});
    assert.equal(quote.blocked,"");assert.equal(quote.total,base,id);assert.equal(quote.damage,damage,id);assert.equal(item.system.attackRate,rate);
    item.updateSource(original);
  }
  const protection=armorAt(actor,"torso");
  assert.equal(protection.sp,10);
  const saved={Roll:foundry.dice.Roll,documents:foundry.documents,update:actor.update,combat:game.combat};
  try {
    game.combat=null;
    actor.update=async changes=>{actor.updateSource(changes);return actor;};
    foundry.documents={...foundry.documents,ChatMessage:{getSpeaker:()=>({actor:actor.id})}};
    foundry.dice.Roll=class extends saved.Roll {
      async evaluate(options){return super.evaluate({...options,allowInteractive:false});}
      async toMessage(data){return {...data,id:"radolfLocalCheck",rolls:[this]};}
    };
    for(const ability of view.abilities.filter(entry=>entry.check)) {
      const message=await WitcherNPCSheet.DEFAULT_OPTIONS.actions.rollProfessionAbility.call(sheet,null,{dataset:{abilityId:ability.check.id},disabled:false});
      assert.equal(message.flags[SYSTEM_ID].professionCheck.base,ability.check.total);
    }
    await WitcherNPCSheet.DEFAULT_OPTIONS.actions.creatureSkill.call(sheet,null,{dataset:{skill:"language",languageId:"language.dwarven"}});
    const luckAction=WitcherNPCSheet.DEFAULT_OPTIONS.actions.creatureLuck;
    await luckAction.call(sheet,null,{dataset:{point:"3"}});assert.equal(actor.system.luckPending,3);
    await luckAction.call(sheet,null,{dataset:{reset:"true"}});assert.equal(actor.system.luckPending,0);
    sheet.isEditable=false;
    const observerHTML=template(await sheet._prepareContext({}));
    assert.match(observerHTML,/data-action="rollProfessionAbility"[^>]*disabled/u);
    assert.match(observerHTML,/data-action="creatureLuck"[^>]*disabled/u);
    await luckAction.call(sheet,null,{dataset:{point:"4"}});assert.equal(actor.system.luckPending,0);
  } finally {foundry.dice.Roll=saved.Roll;foundry.documents=saved.documents;actor.update=saved.update;game.combat=saved.combat;sheet.isEditable=true;}
  console.log("Radolf NPC: exact weapon/skill bases, dwarven armor, languages, six profession checks and Luck validate in installed Foundry");
}
