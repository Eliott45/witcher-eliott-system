import { itemText, itemNumber } from "./item-fields.mjs";
import { MONSTER_CATEGORIES } from "./monster-categories.mjs";
import { potionImmunity } from "./consumables.mjs";

/** NPC metadata only. Statistics, attacks, skills, abilities and equipment keep their existing models. */
export function creatureFields() {
  const {SchemaField,ArrayField,BooleanField}=foundry.data.fields;
  return new SchemaField({category:itemText("humanoid",{choices:MONSTER_CATEGORIES.map(c=>c.id)}),difficulty:itemText("Простые / обычные"),reward:itemNumber(),
    habitat:itemText(),size:itemText(),weight:itemText(),intellect:itemText(),group:itemText(),source:itemText(),
    naturalArmor:itemNumber(),resistances:itemText(),healthMax:itemNumber(),staminaMax:itemNumber(),description:itemText(),tactics:itemText(),
    hasTailOrWings:new BooleanField({initial:false}),
    lore:new ArrayField(new SchemaField({name:itemText(),skill:itemText("education"),dc:itemNumber(),text:itemText()})),
    loot:new ArrayField(new SchemaField({name:itemText(),formula:itemText("1"),currency:new BooleanField({initial:false})})),
    lootGenerated:new BooleanField({initial:false})});
}
export const CREATURE_TRAITS = [
  {id:"creature.wild",name:"Дикий",description:"Внимание и Выживание в дикой природе рассчитываются с Интеллектом 7. Остальные проверки используют обычный Интеллект существа."},
  {id:"creature.poison-immunity",name:"Иммунитет к ядам",description:"Существо невосприимчиво к ядам. Состояние «Отравление» на него не накладывается."},
  {id:"creature.amphibian",name:"Земноводный",description:"Может неограниченно долго находиться под водой, не тонет и не получает штрафов за действия под водой."},
  {id:"creature.mindless",name:"Беспросветная тупость",description:"Невосприимчив к магии, воздействующей на мысли и эмоции. Применимость конкретного заклинания определяет ведущий."},
  // TODO: verify the general vulnerability multiplier before automating damage; the statblock only names fire.
  {id:"creature.fire-vulnerable",name:"Уязвимость к огню",description:"Существо уязвимо к огню, включая состояние «Горение». Учитывается ведущим при применении урона."},
  {id:"creature.necrophage-oil",name:"Масло против трупоедов",description:"На существо действует масло против трупоедов. Его бонус учитывается при нанесении урона подходящим оружием."},
  {id:"creature.hanged-man-venom",name:"Яд повешенного",description:"Гуманоид уязвим к яду повешенного. Используйте описание нанесённого на оружие состава."},
  {id:"creature.monster-resistance",name:"Чудовище: сталь и серебро",description:"Обычное стальное оружие наносит половину урона; серебряное действует полностью. Серебро добавляет указанный у оружия серебряный урон. Исключения описываются в свойствах оружия. Учитывается после брони при ручном применении урона."}
];
export function creatureSkillAttribute(system,key) {
  if(!["awareness","wildernessSurvival"].includes(key)||!(system.parent?.items??[]).some(item=>item.type==="ability"&&item.system.ruleId==="creature.wild"))return null;
  const stats=system.statistics;
  return {value:stats.dying||stats.dead?2:stats.wounded?3:7,label:"Дикий: ИНТ 7 для Внимания и Выживания"};
}
export function immuneToCondition(actor,statuses) {
  return potionImmunity(actor,statuses) || Array.from(statuses).includes("poisoned")&&(actor.items??[]).some(item=>item.type==="ability"&&item.system.ruleId==="creature.poison-immunity");
}
