import { SYSTEM_ID } from "../config.mjs";

export const peasantRank = (actor, slug) => actor.system?.details?.profession === "peasant"
  ? Math.min(10, Math.max(0, Number(Array.from(actor.items ?? []).find(item => item.type === "ability" && item.system.ruleId === `profession.peasant.${slug}`)?.system.level) || 0)) : 0;
export const peasantHalf = value => Math.floor(value / 2);
export const PLANT_INGREDIENTS = new Set("balisse-fruit barley crows-eye sewant white-myrtle celandine han-fiber allspice berbercane ginatia hellebore scleroderm balisse-leaves fools-parsley honeysuckle cortinarius mistletoe mandrake wolfsbane verbena wolf-aloe bryonia green-mold dwarven-immortelle".split(" ").map(id=>`material.${id}`));
export const plantIngredient = item => PLANT_INGREDIENTS.has(item.system?.ruleId) && Boolean(item.system?.material?.substance);
export const harvestBonus = (actor, material) => plantIngredient(material) && peasantRank(actor,"harvest") > 0 ? Math.max(1,peasantHalf(peasantRank(actor,"harvest"))) : 0;
export function peasantModifiers(actor) {
  const level = peasantRank(actor,"digger");
  return level ? [{source:"profession.peasant.digger",label:"Землекоп",category:"profession",target:"carryMax",value:level*2}] : [];
}
export const peasantEffect = (actor, kind) => Array.from(actor.effects ?? []).find(effect => !effect.disabled && !effect.isSuppressed && !effect.duration?.expired && effect.flags?.[SYSTEM_ID]?.peasant?.kind === kind);
export const stewRank = (actor, recipe) => peasantEffect(actor,`stew.${recipe}`)?.flags[SYSTEM_ID].peasant.level ?? 0;
export const peasantImmunity = (actor, statuses) => statuses.has("frozen") && stewRank(actor,"winter") > 0
  || statuses.has("frightened") && stewRank(actor,"harvest") > 0;

const recipe = (id,name,materials,description) => ({id,name,materials:materials.map(([id,quantity])=>({id,quantity})),description});
export const PEASANT_STEWS = [
  recipe("harvest","Симфония урожая",[["gear.raw-meat",2],["gear.beer",3],["material.fools-parsley",3],["material.berbercane",4]],"Невосприимчивость к страху. ПБ всех частей тела: треть уровня навыка; складывается с доспехами, заменяет расовые ПБ краснолюда только если выше."),
  recipe("mothers","Мамино рагу",[["material.crows-eye",5],["material.hellebore",3],["material.bryonia",2],["material.fools-parsley",2]],"Тошнота до успешной Стойкости против результата проверки Маминого рагу или окончания эффекта."),
  recipe("broth","Особый бульон",[["material.beast-bones",4],["material.dog-tallow",2],["material.mistletoe",3],["material.han-fiber",3]],"Сокращает заживление критического ранения на половину уровня навыка, минимум на 1 день. Повторные порции не ускоряют одно ранение повторно."),
  recipe("spring","Весеннее рагу",[["material.balisse-fruit",3],["gear.raw-meat",2],["material.sewant",4],["material.honeysuckle",3]],"Половина уровня к Соблазнению и тройной уровень к Стойкости."),
  recipe("troll","Рагу из тролля",[["material.barley",3],["material.scleroderm",4],["material.sulphur",2],["gear.raw-meat",3]],"Половина уровня к проверкам против отравления и сопротивление урону яда."),
  recipe("winter","Зимнее рагу",[["material.barley",5],["material.beast-bones",2],["material.scleroderm",3],["material.allspice",2]],"Невосприимчивость к замораживанию; в ледяных условиях можно выживать дополнительно столько часов, каков уровень навыка.")
];
export const PEASANT_RITUALS = [
  {id:"cleaner",name:"Кровоочиститель",dc:8,substances:{aether:2,vitriol:1},description:"Создаёт лосьон, полностью убирающий пятна крови с объёма до 5 м³."},
  {id:"weather",name:"Предсказание погоды",dc:10,description:"Определяет погоду на следующие 24 часа по небу и поведению животных. Погоду сообщает ведущий."},
  {id:"wreath",name:"Венок из трав",dc:12,plants:3,description:"Венок из трёх растительных алхимических ингредиентов: пока он надет, владелец помнит всё происходящее в следующие 24 часа."},
  {id:"circle",name:"Круг от вредителей",dc:14,ingredients:5,description:"Пять единиц любых алхимических ингредиентов, радиус 20 м. Звери и инсектоиды должны пройти Стойкость против результата ритуала, чтобы войти."},
  {id:"nightmares",name:"Убийца кошмаров",dc:16,description:"Выверните одежду наизнанку, наденьте шляпу задом наперёд и произнесите стишок: этой ночью обычные и магические кошмары не действуют."},
  {id:"totem",name:"Раскрытие чёрной магии",dc:18,materials:[{id:"material.timber",quantity:1}],description:"Вырезанный деревянный тотем один раз чернеет в пределах 5 м от проклятого существа или жертвы порчи."},
  {id:"talisman",name:"Талисман",dc:20,materials:[{id:"material.feathers",quantity:1}],distinctIngredients:3,description:"Перья и три разных алхимических ингредиента создают талисман с одноразовым запасом Удачи, равным уровню Фермерской мудрости. Талисманы не складываются."}
];
