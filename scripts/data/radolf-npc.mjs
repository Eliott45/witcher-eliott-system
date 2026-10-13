import { SYSTEM_ID, VISION_ANGLE } from "../config.mjs";
import { CORE_EQUIPMENT } from "./core-equipment.mjs";
import { PROFESSION_ABILITIES } from "./professions.mjs";
import { SKILLS } from "./skills.mjs";
import { backgroundModifiers, modifierTotal } from "./background-modifiers.mjs";
import { defaultItemIcon } from "./item-icons.mjs";
import { RADOLF_SOURCE } from "./radolf-equipment.mjs";
import { CREATURE_TRAITS } from "./creatures.mjs";

export const RADOLF_ACTOR_ID = "radolfKazmer0001";
export const RADOLF_ACTOR_FOLDER = { _id:"npcRadolfFolder1",name:RADOLF_SOURCE,type:"Actor",folder:null,sorting:"a",sort:0,color:"#947641",flags:{} };

// Furgonchik_Radolfa.pdf, PDF pages 4–5: these are skill bases, not skill ranks.
const skillBases = { gambling:15,athletics:12,brawling:11,pickLock:9,awareness:13,wildernessSurvival:12,deduction:9,
  intimidation:13,trapCrafting:11,crafting:8,sleightOfHand:14,deceit:16,education:10,streetwise:12,forgery:14,
  humanPerception:16,physique:13,stealth:15,resistMagic:12,resistCoercion:17,endurance:13,business:14,persuasion:17,charisma:17,courage:14,dodgeEscape:13 };
const abilities = [
  ["well-traveled",15,"Действием вспоминает один факт об определённом предмете, культуре или области. СЛ проверки определяет ведущий."],
  ["market",13,"Во время покупки может потратить действие, чтобы найти другого продавца того же предмета за половину рыночной цены. СЛ определяет ведущий: чем выше редкость, тем труднее поиск. Не действует на экспериментальные и ведьмачьи предметы, а также реликвии."],
  ["connections",14,"При первом посещении поселения тратит действие и проходит проверку: СЛ 14 для небольшого поселения, 18 для среднего и 22 для большого. При успехе местная репутация увеличивается на половину превышения СЛ на 1d6 недель."],
  ["rags",16,"Действием нанимает местных осведомителей: СЛ 14 для небольшого поселения, 18 для среднего и 22 для большого. Каждый нанятый беспризорник или бездомный даёт +1 к Ориентированию в городе в этой местности и получает 1 крону. Количество помощников определяет ведущий по результату проверки."],
  ["fence",14,"Действием ищет скупщика, готового приобрести любой предмет за полную рыночную цену без лишних вопросов и доноса властям. СЛ проверки определяет ведущий."],
  ["warrior-debt",13,"Действием просит помощи у воина, задолжавшего ему услугу. Результат распределяется между боевыми навыками, интеллектом и снаряжением помощника по таблице воинского долга. Воин выполняет разумные приказы и помогает Родольфу в течение 4 дней."]
];
const rumor = "Родольф торгует припасами в Северных королевствах и нильфгаардских провинциях, снабжая повстанцев и недовольных властью. В корчме он душевный собеседник, но за себя постоит. По слухам, он тесно связан со скоя’таэлями и может быстро вызвать эльфско-краснолюдский отряд. Сам Родольф охотно поддерживает эту версию.";
const biography = "Родольф Казмер — поставщик припасов северным повстанцам и опытный контрабандист. Родился в Мариборе в семье краснолюдов, недавно покинувшей Махакам, и с детства считает себя темерцем. На скоя’таэлей он никогда не работал: несмотря на пережитую нетерпимость, считает их движение ослеплённым ненавистью и надеется на мирное сосуществование людей и Старших народов при прекращении жестокости с обеих сторон. Воевал в Северных войнах и служил в армии разведчиком, партизаном, арбалетчиком и снайпером. Владеет арбалетом и краснолюдским топором, но больше полагается на красноречие и деловую хватку. После Второй войны с Нильфгаардом вернулся к торговле, путешествиям и азартным играм. С началом Третьей Северной войны тайно возит еду, доспехи и оружие северянам в осаждённые и оккупированные города. С солдат берёт небольшую плату, а остальным покупателям выставляет куда более высокие цены.";

export function radolfNPCSource() {
  const attributes = { intelligence:6,reflex:7,dexterity:9,body:7,speed:5,empathy:9,craft:7,will:8,luck:10 };
  const details = { race:"dwarf",profession:"merchant",gender:"Мужской" }, modifiers = backgroundModifiers(details);
  const skills = Object.fromEntries(Object.entries(skillBases).map(([key,base]) => [key,base - attributes[SKILLS.find(skill=>skill.key===key).attribute] - modifierTotal(modifiers,`skills.${key}`)]));
  const gear = (id, overrides = {}, name) => {
    const entry = CORE_EQUIPMENT.find(entry=>entry.id===id);
    if (!entry) throw new Error(`Missing Radolf equipment: ${id}`);
    return {_id:entry.documentId,name:name??entry.name,type:entry.type,img:entry.img??defaultItemIcon(entry),
      system:{...structuredClone(entry.system),ruleId:id,quantity:1,carried:true,equipped:false,...overrides},
      flags:{...structuredClone(entry.flags??{}),core:{sourceId:`Compendium.${SYSTEM_ID}.equipment.Item.${entry.documentId}`}}};
  };
  const weapon = (id, base, damage, attackRate, equipped = false) => {
    const item = gear(id,{damage,attackRate,damageIncludesBody:true,equipped});
    const attribute = SKILLS.find(skill=>skill.key===item.system.skill).attribute;
    skills[item.system.skill] = base - attributes[attribute] - item.system.accuracy;
    item.system.grip = equipped ? item.system.hands : 0;
    if (item.system.skill === "crossbow") item.system.loaded = false;
    return item;
  };
  const mule = gear("transport.mule"), cart = gear("transport.cart");
  cart.system.transport.mountId = mule._id;
  cart.system.description += "<p>Товары Родольфа на сумму до 5000 крон. Ассортимент определяет ведущий; конкретные товары помещаются внутрь повозки.</p>";
  const img = `systems/${SYSTEM_ID}/assets/creatures/radolf-kazmer.jpg`;
  const venom = CREATURE_TRAITS.find(trait=>trait.id==="creature.hanged-man-venom");
  const items = [weapon("weapon.short-dagger",12,"2d6+4",2),weapon("weapon.dwarven-heavy-crossbow",19,"5d6",1),weapon("weapon.dwarven-axe",15,"5d6+7",2,true),
    gear("armor.torso.3",{equipped:true}),gear("gear.thieves-tools"),gear("gear.spirits",{},"Фляга с краснолюдским спиртом"),
    gear("ammunition.standard",{quantity:20},"Стандартные болты"),gear("ammunition.broadhead",{quantity:5},"Болты с широким наконечником"),
    gear("ammunition.armor-piercing",{quantity:5},"Бронебойные болты"),mule,cart,
    {_id:"radolfVenom00001",name:venom.name,type:"ability",img:"icons/svg/blood.svg",system:{ruleId:venom.id,description:`<p>${venom.description}</p>`}},
    ...abilities.map(([id,base,description])=>{
      const entry=PROFESSION_ABILITIES.find(ability=>ability.id===`profession.merchant.${id}`);
      return {_id:entry.documentId,name:entry.name,type:"ability",img:"icons/svg/aura.svg",
        system:{ruleId:entry.id,level:base-attributes[entry.attribute],attribute:entry.attribute,description:`<p>${description}</p><p><small>${RADOLF_SOURCE}</small></p>`},
        flags:{core:{sourceId:`Compendium.${SYSTEM_ID}.abilities.Item.${entry.documentId}`}}};
    })];
  return {_id:RADOLF_ACTOR_ID,name:"Родольф Казмер",type:"npc",img,folder:RADOLF_ACTOR_FOLDER._id,ownership:{default:0},
    prototypeToken:{name:"Родольф Казмер",texture:{src:img},actorLink:true,disposition:0,sight:{enabled:true,angle:VISION_ANGLE},bar1:{attribute:"health"},bar2:{attribute:"stamina"}},
    system:{attributes,details,skills,health:{value:35,max:35},stamina:{value:35,max:35},resolve:{value:35,max:35},crowns:1250,
      languages:[{id:"language.dwarven",name:"Краснолюдский",level:4},{id:"language.elder",name:"Старшая Речь",level:4}],
      creature:{category:"humanoid",difficulty:"Простой / незаурядный",reward:0,rewardNote:"Неоплаченные счета из таверн и трактиров",intellect:"Разумный",
        habitat:"Северные королевства и нильфгаардские провинции",source:RADOLF_SOURCE,healthMax:35,staminaMax:35,
        description:"Краснолюд-торговец из Марибора, темерский патриот и контрабандист. Снабжает северных повстанцев и окружённые войска.",
        lore:[{name:"Расхожие слухи",skill:"education",dc:13,text:rumor},{name:"Биографические факты",skill:"education",dc:16,text:biography}],
        loot:[{name:"Обычные предметы",formula:"1d6",currency:false}],lootGenerated:false},
      notes:"Ассортимент повозки определяет ведущий: товары общей стоимостью до 5000 крон. 1250 крон, снаряжение и боеприпасы уже при Родольфе; кнопка добычи добавляет только обычные предметы. Связи со скоя’таэлями — слух, а не факт. Восприимчив к яду повешенного как гуманоид."},items,effects:[]};
}
