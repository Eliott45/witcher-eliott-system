import { itemText, itemNumber } from "./item-fields.mjs";
import { MONSTER_CATEGORIES } from "./monster-categories.mjs";
import { potionImmunity } from "./consumables.mjs";
import { creatureIsMassive, creatureHasInfiniteStamina } from "./creature-modes.mjs";
import { spiritConditionImmune } from "../combat/creature-spirits.mjs";
import { peasantImmunity } from "./peasant-rules.mjs";
import { hasAbility } from "./abilities.mjs";

/** NPC metadata only. Statistics, attacks, skills, abilities and equipment keep their existing models. */
// Core p.164 «Модификаторы размера»: added to the DC of an unaware or inanimate target of a ranged attack (p.165).
export const SIZE_CLASSES = [
  {id:"small",name:"Небольшой",modifier:2,examples:"кошка, накер"},{id:"medium",name:"Средний",modifier:0,examples:"с человека"},
  {id:"large",name:"Крупный",modifier:-2,examples:"тролль, лошадь"},{id:"huge",name:"Огромный",modifier:-4,examples:"бес"}];
export const sizeClassOf = actor => SIZE_CLASSES.find(entry=>entry.id===actor?.system?.creature?.sizeClass)??SIZE_CLASSES[1];
export function creatureFields() {
  const {SchemaField,ArrayField,BooleanField}=foundry.data.fields;
  return new SchemaField({category:itemText("humanoid",{choices:MONSTER_CATEGORIES.map(c=>c.id)}),difficulty:itemText("Простые / обычные"),reward:itemNumber(),rewardNote:itemText(),
    habitat:itemText(),size:itemText(),sizeClass:itemText("medium",{choices:SIZE_CLASSES.map(entry=>entry.id)}),weight:itemText(),intellect:itemText(),group:itemText(),source:itemText(),
    naturalArmor:itemNumber(),resistances:itemText(),healthMax:itemNumber(),staminaMax:itemNumber(),runBase:itemNumber(),recoveryBase:itemNumber(),description:itemText(),tactics:itemText(),
    regenerationMode:itemText("normal",{choices:["normal","suppressed","sunlight"]}),
    movementMode:itemText("auto",{choices:["auto","ground","flying","swimming"]}),flightHeight:itemNumber(),
    footing:itemText("auto",{choices:["auto","ordinary","quadruped","legless"]}),
    fallRemaining:itemNumber(),fallDistance:itemNumber(),fallRound:itemText(),illusion:new BooleanField({initial:false}),camouflage:new BooleanField({initial:false}),weakSpot:new BooleanField({initial:false}),
    invisible:new BooleanField({initial:false}),invisibilityEpoch:itemText(),transformed:new BooleanField({initial:true}),packId:itemText(),
    spiritMode:itemText("normal",{choices:["normal","suppressed"]}),shadowMode:itemText("auto",{choices:["auto","active","off"]}),battleForm:new BooleanField({initial:false}),spikes:new BooleanField({initial:false}),chur:new BooleanField({initial:false}),moonlight:new BooleanField({initial:false}),
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
  {id:"creature.fire-vulnerable",name:"Уязвимость к огню",description:"Существо получает двойной урон от огня, включая состояние «Горение». Множитель применяется автоматически."},
  {id:"creature.necrophage-oil",name:"Масло против трупоедов",description:"На существо действует масло против трупоедов. Его бонус учитывается при нанесении урона подходящим оружием."},
  {id:"creature.hanged-man-venom",name:"Яд повешенного",description:"Гуманоид уязвим к яду повешенного. Используйте описание нанесённого на оружие состава."},
  {id:"creature.monster-resistance",name:"Чудовище: сталь и серебро",description:"Обычное стальное оружие наносит половину урона; серебряное действует полностью. Серебро добавляет указанный у оружия серебряный урон. Сопротивление автоматически учитывается после брони; огонь его игнорирует."}
];
export function creatureSkillAttribute(system,key) {
  const wild=["awareness","wildernessSurvival"].includes(key)?(system.parent?.items??[]).find(item=>item.type==="ability"&&item.system.ruleId==="creature.wild"):null;
  if(!wild)return null;
  // The statblock prints the instinct INT (6–8); older creatures keep 7.
  const instinct=Number(wild.flags?.["witcher-eliott-system"]?.wildIntelligence)||7,stats=system.statistics;
  return {value:stats.dying||stats.dead?Math.floor(instinct/3):stats.wounded&&!stats.ignoresWoundPenalty?Math.floor(instinct/2):instinct,label:`Дикий: ИНТ ${instinct} для Внимания и Выживания`};
}
export function immuneToCondition(actor,statuses) {
  const ids=new Set(statuses),traits=new Set((actor.items??[]).filter(item=>item.type==="ability").map(item=>item.system.ruleId));
  return potionImmunity(actor,ids) || peasantImmunity(actor,ids)
    || ids.has("prone")&&creatureIsMassive(actor)
    || spiritConditionImmune(actor,ids)
    || ids.has("exhausted-stun")&&creatureHasInfiniteStamina(actor)
    || ids.has("poisoned")&&traits.has("creature.poison-immunity")
    || ids.has("burning")&&traits.has("creature.fire-immunity")
    || ids.has("bleeding")&&traits.has("creature.bleeding-immunity")
    || ids.has("frozen")&&traits.has("creature.freeze-immunity")
    || ids.has("prone")&&traits.has("creature.knockdown-immunity")
    // Witchers' Mutant Resilience and creatures with disease immunity cannot fall ill.
    || ids.has("diseased")&&(traits.has("creature.disease-immunity")||actor.type==="character"&&hasAbility(actor,"witcher.mutant-resilience"))
    || traits.has("creature.construct")&&["bleeding","burning","poisoned"].some(id=>ids.has(id));
}
