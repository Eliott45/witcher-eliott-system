import { SYSTEM_ID } from "../config.mjs";
import { RADOLF_SOURCE } from "./radolf-equipment.mjs";
import { materialUuid } from "./workshop-materials.mjs";
import { equipmentUuid } from "./workshop.mjs";

const documentId = n => `rdlf${String(n).padStart(12,"0")}`;
const source = { source: RADOLF_SOURCE };
const modifications = [
  ["sight", "Нильфгаардский прицел", "rare", "tiny", .1, 275, "Точность +1", [{target:"accuracy",value:1}], 15, 240, 550, 176, "journeyman", "steel:1 sharpening-grit:4"],
  ["windlass", "Улучшенный ворот", "unique", "none", .5, 440, "Перезарядка действием или передвижением", [], 20, 600, 880, 284, "master", "steel:4 wax:3 thread:10 ester-grease:7"],
  ["skellige", "Скеллигское стремя", "common", "none", .5, 375, "Надёжность +5; Удар арбалетом", [{target:"reliability",value:5}], 10, 60, 750, 242, "novice", "dark-steel:2 ogre-wax:3 beast-bones:6"],
  ["string", "Усиленная тетива", "rare", "tiny", .1, 425, "Урон выстрела +1d6", [], 17, 240, 850, 280, "journeyman", "ogre-wax:10 thread:10 silk:3"],
  ["balanced", "Балансировочное стремя", "common", "none", .5, 395, "Сбалансированное", [], 12, 120, 790, 260, "novice", "steel:3 hardened-timber:5 leather:1 ester-grease:1"]
];
const details = {
  sight: "Повышает точность выстрела на 1.",
  windlass: "Арбалет можно перезарядить обычным действием или потратить на перезарядку передвижение за раунд.",
  skellige: "Повышает надёжность на 5. Позволяет ударить арбалетом в ближнем бою: дробящий урон равен урону выстрела, точность −1. Бонусы других модификаций арбалета к этому удару не применяются.",
  string: "Добавляет 1d6 к урону выстрела.",
  balanced: "Добавляет свойство «Сбалансированное»: бонус к броску определения критического ранения."
};
export const RADOLF_UPGRADES = modifications.map(([id,name,rarity,concealment,weight,price,properties,bonuses], i) => ({
  id:`radolf.crossbow.${id}`, documentId:documentId(101+i), name, type:"equipment", source:"radolf",
  system:{...source,kind:"upgrade",rarity,concealment,weight,price,properties,upgrade:{category:"crossbow",target:"weapon",bonuses},
    description:`<p>${details[id]}</p><p>Ручной арбалет вмещает одну модификацию, остальные — две. Каждый вид можно установить только один раз. Установка и снятие занимают полный ход, без проверки. Снятая модификация возвращается в инвентарь.</p><p><small>${RADOLF_SOURCE}</small></p>`}
}));

// Substance signs were checked against the PDF image: backslash = caelum, horizontal = quebrith.
const potions = [
  ["vitality", "Зелье живучести", "rare", 85, "2d6 раундов", 18, {vitriol:1,fulgur:2,hydragenum:1,rebis:2}, "Игнорирует штрафы от нахождения ниже порога ранения. Не отменяет критические ранения и состояние при смерти."],
  ["stamina", "Зелье выносливости", "rare", 75, "30 минут", 17, {aether:2,caelum:1,vermilion:2}, "Немедленно восстанавливает 3d6 Выносливости, не выше максимума. Токсичность сохраняется полчаса, даже если восстановленная Выносливость уже потрачена."],
  ["raffard", "Зелье Раффара Белого", "unique", 95, "4d6 раундов", 19, {aether:1,caelum:1,quebrith:1,rebis:1,vermilion:1,vitriol:1}, "Восстанавливает 1 ПЗ в начале каждого своего хода на протяжении действия эликсира."]
];
export const RADOLF_POTIONS = potions.map(([id,name,rarity,price,duration,, ,description],i) => ({
  id:`radolf.potion.${id}`,documentId:documentId(201+i),name,type:"equipment",source:"radolf",
  system:{...source,kind:"alchemy",rarity,price,weight:0,properties:`Обычный эликсир; ${duration}; Токсичность 50%`,alchemy:{category:"ordinaryPotion",toxicity:50,duration:id==="stamina"?1800:0},
    description:`<p>${description}</p><p>Обычный эликсир: доступен всем расам, кроме низушков, без проверки Стойкости. Токсичность 50%; при превышении допустимого предела вызывает отравление. Длительность: ${duration}. Масса в дополнении не указана.</p><p><small>${RADOLF_SOURCE}</small></p>`}
}));
export const RADOLF_RECIPES = [
  ...modifications.map(([id,, , , , , , ,dc,minutes,price,investment,grade,materials],i) => ({
    id:`diagram.radolf.crossbow.${id}`,documentId:documentId(301+i),name:`Чертёж: ${RADOLF_UPGRADES[i].name}`,type:"recipe",source:"radolf",
    system:{...source,price,recipe:{category:"diagram",grade,dc,time:minutes*60,investment,quantity:1,forge:/^(?:steel|dark-steel):/u.test(materials),tools:["gear.crafting-tools"],resultUuid:equipmentUuid(RADOLF_UPGRADES[i].documentId),components:materials.split(" ").map(token=>{const [id,n]=token.split(":");return {uuid:materialUuid(id),substance:"",quantity:Number(n)};})}}
  })),
  ...potions.map(([id,, , , ,dc,substances],i) => ({
    id:`formula.radolf.potion.${id}`,documentId:documentId(401+i),name:`Формула: ${RADOLF_POTIONS[i].name}`,type:"recipe",source:"radolf",flags:{[SYSTEM_ID]:{priceUnavailable:true}},
    system:{...source,price:0,recipe:{category:"formula",grade:"master",dc,time:1800,quantity:1,tools:["gear.alchemy-tools"],resultUuid:equipmentUuid(RADOLF_POTIONS[i].documentId),components:Object.entries(substances).map(([substance,quantity])=>({substance,quantity,uuid:""}))}}
  }))
];
