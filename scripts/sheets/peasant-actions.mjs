import { SYSTEM_ID } from "../config.mjs";
import { peasantRank, peasantHalf, peasantEffect } from "../data/peasant-rules.mjs";
import { peasantEffectSource } from "../workshop/peasant-products.mjs";
import { craftPeasant } from "../workshop/peasant-crafting.mjs";
import { rollActionCheck } from "../combat/action-economy.mjs";
import { workshopBase, workshopNotice } from "../workshop/check.mjs";
import { skillValue } from "../data/skills.mjs";
import { escapeTooltip as esc } from "./statistics-tooltips.mjs";

const prompt=(title,content)=>foundry.applications.api.DialogV2.prompt({window:{title},content,rejectClose:false,ok:{label:"Выполнить",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))}});
const targetActor=()=>Array.from(game.user.targets??[]).at(0)?.actor;
export async function usePeasantAbility(_event,target) {
  if(!this.isEditable)return;
  const actor=this.actor,slug=target.dataset.peasant;
  try{
    if(!peasantRank(actor,slug))throw new Error("Сначала изучите этот навык.");
    if(["wisdom","panacea","stew","grog"].includes(slug))return await craftPeasant(actor,slug);
    if(slug==="butcher"||slug==="ear-bite")return await (await import("../combat/peasant-targets.mjs")).usePeasantTarget(actor,slug);
    if(slug==="harvest")return ui.notifications.info("Бонус автоматически добавляется при успешном сборе растений через «Собирательство» ведущего.");
    if(slug==="digger"){
      const choice=await prompt("Землекоп · физический труд",'<p>Бонус применяется только к физическому труду.</p><select name="check"><option value="body">Проверка Телосложения</option><option value="endurance">Выносливость / Стойкость</option></select>');
      if(!choice)return;
      const base=choice.check==="body"?actor.system.statistics.effective.body:skillValue(actor.system,"endurance")?.total;
      if(base==null)throw new Error("Заполните Телосложение.");
      return rollActionCheck(actor,{formula:`1d10wc + ${base} + ${peasantHalf(peasantRank(actor,slug))}`,flavor:"Землекоп · проверка физического труда"});
    }
    const target=targetActor(),level=peasantRank(actor,slug);
    if(slug==="intolerance"){
      const choice=await prompt("Нетерпимость",'<label>Применение<select name="mode"><option value="fear">Первая встреча: страх превращается в ярость</option><option value="rally">Сплотить крестьян (Лидерство)</option><option value="end">Завершить действие бонуса</option></select></label>'
        +`<p>Для первой встречи цель должна быть разумной и иметь статус «Ненависть и опасение». ${target?`Цель: ${esc(target.name)}.`:"Выберите цель (T) либо укажите СЛ."}</p><label>СЛ (ЭМП × 3)<input type="number" name="dc" min="0" value="${target?.system.statistics?.effective.empathy!=null?target.system.statistics.effective.empathy*3:18}"></label>`);
      if(!choice)return;
      if(choice.mode==="end"){const e=peasantEffect(actor,"intolerance");if(e)await e.delete();return;}
      if(choice.mode==="rally")return rollActionCheck(actor,{formula:`1d10wc + ${skillValue(actor.system,"leadership").total} + ${peasantHalf(level)}`,flavor:"Нетерпимость · Лидерство при сплочении крестьян"});
      const dc=Number(choice.dc);if(!Number.isFinite(dc)||dc<0)throw new Error("Некорректная СЛ.");
      const message=await rollActionCheck(actor,{formula:`1d10wc + ${workshopBase(actor,"profession.peasant.intolerance")}`,flavor:`Нетерпимость · СЛ ${dc}`});
      if(message?.rolls[0].total>=dc){
        const effect=peasantEffectSource("intolerance","Нетерпимость: ярость",level,{seconds:0,description:"Бонус Храбрости и Сопротивления убеждению в этой встрече. Завершите эффект кнопкой навыка, когда встреча закончится.",modifiers:["courage","resistCoercion"].map(skill=>({target:`skills.${skill}`,value:level}))});
        const old=peasantEffect(actor,"intolerance");if(old)await old.delete();await actor.createEmbeddedDocuments("ActiveEffect",[effect]);
      }
      return;
    }
    if(slug==="animal-whisper"){
      const choice=await prompt("Шёпот животным",`<p>Команды действуют только на приручённых животных, в меру их возможностей. ${target?`Цель: ${esc(target.name)}.`:""}</p><label>СЛ (ВОЛЯ × 3)<input name="dc" type="number" min="0" value="${target?.system.statistics?.effective.will!=null?target.system.statistics.effective.will*3:12}"></label><p>Пчёлы 21 · куры/свиньи 15 · коровы/кролики 12 · козы 18 · овцы 9.</p>`);
      if(!choice)return;const dc=Number(choice.dc);if(!Number.isFinite(dc)||dc<0)throw new Error("Некорректная СЛ.");
      const message=await rollActionCheck(actor,{formula:`1d10wc + ${workshopBase(actor,"profession.peasant.animal-whisper")}`,flavor:`Шёпот животным · СЛ ${dc}`});
      if(message)await workshopNotice(actor,`<p>Шёпот животным: ${message.rolls[0].total>=dc?"животное выполняет команду в меру возможностей":"неудача"}.</p>`);
    }
  }catch(error){console.error(error);ui.notifications.warn(error.message);}
}
