import { available, freeSlots, effectiveItem, activeOil } from "../data/workshop.mjs";
import { AUGMENTATIONS } from "../data/workshop-upgrades.mjs";
import { conditionKey, armorZones } from "../data/physical-items.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { chooseReference } from "../sheets/reference-picker.mjs";
import { workshopCheck, workshopBase, workshopNotice } from "./check.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { applyWeaponWear } from "../combat/weapon-wear.mjs";

export function canInstall(target, source) {
  return available(source) && source.system.kind==="upgrade" && source.system.upgrade.target===target.type && freeSlots(target)>0
    && (source.system.upgrade.category!=="armor" || armorZones(target).every(zone=>source.system.upgrade.zones.includes(zone)));
}
async function chooseOwned(actor, title, predicate) {
  const entries=actor.items.filter(predicate);
  if(!entries.length) throw new Error("Нет подходящих предметов при себе или свободных слотов.");
  const id=await chooseReference("workshop","",{title,hint:"Предметы при себе, подходящие для этого действия.",entries:entries.map(item=>({id:item.id,label:item.name,summary:item.system.properties??"",details:[]})),groups:{}});
  return actor.items.get(id);
}
async function toolsAvailable(actor) {
  if(actor.items.some(item=>available(item)&&item.system.ruleId==="gear.crafting-tools"))return true;
  return foundry.applications.api.DialogV2.confirm({window:{title:"Инструменты ремесленника"},content:"<p>Нужны инструменты ремесленника. Они доступны вам в мастерской или взяты у союзника?</p>",rejectClose:false});
}
export async function installUpgrade(target, { withoutCheck = false, source: selectedSource = null } = {}) {
  const actor=target.actor;if(!actor?.isOwner)return;
  const source=selectedSource??await chooseOwned(actor,"Установить улучшение",item=>canInstall(target,item));if(!source)return;
  const category=source.system.upgrade.category;
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:"Установка улучшения"},content:`<p><b>${esc(source.name)}</b> → ${esc(target.name)}</p><p>${esc(source.system.properties)}</p><p>${category==="armor"?`${withoutCheck?"Установка без проверки и инструментов.":"Полный раунд, Изготовление СЛ 14."} Накладка занимает слот; остальные части комплекта остаются в инвентаре.`:"Руна / глиф расходуется и устанавливается НАВСЕГДА. Снять её нельзя."}</p>`,rejectClose:false});
  if(!confirmed)return;
  return installOwnedUpgrade(target, source, { withoutCheck });
}
/** Manual installation keeps ownership, slots and material accounting; only the crafting check/tools are bypassed. */
export async function installOwnedUpgrade(target, source, { withoutCheck = false } = {}) {
  const actor=target.actor;if(!actor?.isOwner)return;
  if(source.actor!==actor)throw new Error("Улучшение должно находиться в инвентаре того же персонажа.");
  const category=source.system.upgrade.category;
  if(category==="armor"&&!withoutCheck&&!await toolsAvailable(actor))return;
  return inventoryWrite(actor,async()=>{
    if(!canInstall(target,source))throw new Error("Установка больше недоступна.");
    if(target.system.quantity!==1)throw new Error("Для улучшения оставьте один экземпляр предмета в этой записи инвентаря.");
    if(category==="armor" && !withoutCheck && !(await workshopCheck(actor,{name:"Установка накладки",skill:"crafting",dc:14})).success)return;
    if(!canInstall(target,source))throw new Error("Свободные слоты или предметы изменились.");
    const zone=category==="armor"?target.system.zone:"";
    const installation={id:foundry.utils.randomID(),name:source.name,sourceUuid:source._stats.compendiumSource||source.uuid,ruleId:source.system.ruleId??"",category,zone,properties:source.system.properties,
      bonuses:foundry.utils.deepClone(source.system.upgrade.bonuses),weight:category==="armor"?source.system.weight*armorZones(target).length/3:0};
    const updates=[{_id:target.id,"system.installations":[...target.system.installations,installation]}], creates=[];
    const key=conditionKey(target), conditionBonus=installation.bonuses.filter(b=>b.target===key).reduce((sum,b)=>sum+b.value,0);
    updates[0][`system.${key}.value`]=target.system[key].value+conditionBonus;
    if(category==="armor"){
      installation.bonuses.push({target:"weight",value:installation.weight});
      const zones=source.system.upgrade.zones.filter(z=>!armorZones(target).includes(z));
      if(zones.length){const remainder=copyPhysical(source,1);remainder.system.upgrade.zones=zones;creates.push(remainder);}
    }
    await inventoryTransaction(actor,{expenses:[{itemId:source.id,quantity:1}],updates,creates});
    await workshopNotice(actor,`<p>${esc(source.name)} установлено на ${esc(target.name)}.</p>`);
  });
}
/** Applying an owned rune/glyph directly from its card uses the same permanent installation transaction. */
export async function installUpgradeFromSource(source) {
  const actor=source.actor;if(!actor?.isOwner)return;
  const target=await chooseOwned(actor,"Предмет для руны / глифа",item=>canInstall(item,source)&&available(item)&&item.system.quantity===1);
  if(target)return installUpgrade(target,{source});
}
export async function removeArmorUpgrade(target,id) {
  const actor=target.actor;if(!actor?.isOwner || !await toolsAvailable(actor))return;
  return inventoryWrite(actor,async()=>{
    const entry=target.system.installations.find(x=>x.id===id&&x.category==="armor");if(!entry)return;
    const source=await foundry.utils.fromUuid(entry.sourceUuid);if(!source)throw new Error("Исходный предмет накладки недоступен.");
    if(!(await workshopCheck(actor,{name:"Снять накладку",skill:"crafting",dc:15})).success)return;
    if(!target.system.installations.some(x=>x.id===id))return;
    const data=copyPhysical(source,1);data.system.upgrade.zones=armorZones({system:{zone:entry.zone}});
    const amount=entry.bonuses.filter(b=>b.target==="stoppingPower").reduce((sum,b)=>sum+b.value,0);
    await inventoryTransaction(actor,{updates:[{_id:target.id,"system.installations":target.system.installations.filter(x=>x.id!==id),"system.stoppingPower.value":Math.max(0,target.system.stoppingPower.value-amount)}],creates:[data]});
  });
}
export async function augmentItem(target) {
  const actor=target.actor;if(!actor?.isOwner)return;
  const skill="profession.craftsman.augment";
  if(workshopBase(actor,skill)===null)throw new Error("Нужна изученная способность ремесленника «Улучшение».");
  const options=AUGMENTATIONS.filter(entry=>entry.target===target.type&&!target.system.installations.some(x=>x.sourceUuid===`augmentation.${entry.id}`));
  const id=await chooseReference("workshop","",{title:"Модификация ремесленника",hint:"Каждую модификацию можно установить на этот предмет один раз.",groups:{},entries:options.map(entry=>({id:entry.id,label:entry.name,summary:`СЛ ${entry.dc} · ${entry.properties}`,details:[]}))});
  if(!id || !await toolsAvailable(actor))return;
  const entry=options.find(x=>x.id===id);if(!entry)return;
  const forge=await foundry.applications.api.DialogV2.confirm({window:{title:"Работа ремесленника"},content:"<p>Улучшение занимает 3 раунда. Используете кузницу (+2)? «Нет» — работать без кузницы.</p>",rejectClose:false});
  return inventoryWrite(actor,async()=>{
    if(target.system.quantity!==1||target.system.installations.some(x=>x.sourceUuid===`augmentation.${id}`))throw new Error("Эта модификация уже есть или в записи несколько предметов.");
    const check=await workshopCheck(actor,{name:`Модификация: ${entry.name}`,skill,dc:entry.dc,bonus:forge?2:0});
    const key=conditionKey(target);
    if(!check.success){
      // Initial natural 1 defines a fumble, regardless of Luck and the final check total.
      const die=check.roll.dice[0];
      if(die?.results[0]?.result===1){const damage=Math.abs(die.total);if(key==="reliability")await applyWeaponWear(target,damage);else await target.update({[`system.${key}.value`]:Math.max(0,target.system[key].value-damage)});}
      return;
    }
    const bonus=entry.bonuses.filter(b=>b.target===key).reduce((sum,b)=>sum+b.value,0);
    await target.update({"system.installations":[...target.system.installations,{id:foundry.utils.randomID(),name:`Модификация: ${entry.name}`,sourceUuid:`augmentation.${id}`,category:"craftsman",properties:entry.properties,bonuses:entry.bonuses}], [`system.${key}.value`]:target.system[key].value+bonus});
  });
}
export async function applyOil(target, source) {
  const actor=target.actor;if(!actor?.isOwner)return;
  if(target.type!=="weapon"||target.system.category==="shield")throw new Error("Масло наносится на оружие.");
  source??=await chooseOwned(actor,"Нанести масло",item=>available(item)&&item.system.alchemy?.category==="oil");if(!source)return;
  const old=activeOil(target,game.time.worldTime);
  if(old&&!await foundry.applications.api.DialogV2.confirm({window:{title:"Заменить покрытие?"},content:`<p>На оружии уже ${esc(old.name)}. Новое масло заменит покрытие.</p>`,rejectClose:false}))return;
  return inventoryWrite(actor,async()=>{
    if(source.actor!==actor||source.system.alchemy?.category!=="oil"||!available(source)||target.system.quantity!==1)throw new Error("Нужно масло при себе и один экземпляр оружия.");
    const oil=source.system.alchemy;
    await inventoryTransaction(actor,{expenses:[{itemId:source.id,quantity:1}],updates:[{_id:target.id,"system.oil":{name:source.name,sourceUuid:source._stats.compendiumSource||source.uuid,target:oil.target,bonus:oil.bonus,expiresAt:game.time.worldTime+oil.duration}}]});
  });
}
export function registerOilExpiry() {
  const expire = async()=>{
    if(!game.user.isActiveGM)return;
    const actors = new Map(game.actors.map(actor=>[actor.uuid,actor]));
    for(const scene of game.scenes) for(const token of scene.tokens)
      if(!token.actorLink&&token.actor)actors.set(token.actor.uuid,token.actor);
    for(const actor of actors.values()){
      const expired=actor.items.filter(item=>item.system.oil?.sourceUuid&&!activeOil(item,game.time.worldTime));
      if(expired.length)await inventoryWrite(actor,()=>actor.updateEmbeddedDocuments("Item",expired.map(item=>({_id:item.id,"system.oil.sourceUuid":""}))));
    }
  };
  Hooks.on("updateWorldTime",expire);
  Hooks.once("ready",expire);
}
