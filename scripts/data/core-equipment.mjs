// User-provided core pp. 73–74, 79–80, 92–93. Values are per item, except explicitly named packs.
import { CORE_CONTAINERS } from "./core-containers.mjs";
import { CORE_AMMUNITION } from "./core-ammunition.mjs";
import { rarity, weaponRecord } from "./equipment-records.mjs";
import { ELDER_EQUIPMENT } from "./elder-equipment.mjs";
const weapon = (n, row) => weaponRecord(`weap${String(n).padStart(12, "0")}`, row, "Базовая книга, стр. 73–74 / 80");
export const CORE_WEAPONS = [
  ["iron-longsword", "Железный полуторный меч", "swordsmanship", "Р/К", 0,"e","2d6+2",10,2,0,0,"large",0,1.5,160],
  ["arming-sword", "Рыцарский меч", "swordsmanship", "Р/К", 0,"c","2d6+4",15,1,0,0,"large",0,2.5,270],
  ["gleddyf", "Гледдиф", "swordsmanship", "Р/К", 0,"c","3d6+2",5,2,0,0,"large",0,3,285],
  ["falchion", "Охотничий фальшион", "swordsmanship", "Р/К",0,"c","3d6",15,1,0,0,"large",0,2,325],
  ["krigsverd", "Кригсверд", "swordsmanship", "Р/К",2,"c","4d6+4",10,1,0,0,"large",0,2,570],
  ["esboda", "Эсбода", "swordsmanship", "Р/К",1,"r","5d6",10,1,0,0,"none",1,1.5,650],
  ["kord", "Корд", "swordsmanship", "Р/К",0,"u","5d6",15,1,0,0,"none",1,1.5,725,"Кровопускающее (25%)"],
  ["vicovaro", "Клинок из Виковаро", "swordsmanship", "Р/К",0,"u","5d6+4",15,2,0,0,"none",1,1.5,955,"Сбалансированное"],
  ["torrwr", "Торрур", "swordsmanship", "Р/К",0,"u","6d6",15,2,0,0,"none",2,3,1075,"Кровопускающее (50%)"],
  ["dagger", "Кинжал", "smallBlades", "Р/К",0,"e","1d6+2",10,1,0,0,"small",0,0.5,50],
  ["stiletto", "Стилет", "smallBlades", "Р/К",2,"c","1d6",5,1,0,0,"tiny",1,0.5,275,"Незаметное"],
  ["short-dagger", "Короткий кинжал", "smallBlades", "Р/К",1,"r","2d6+2",10,1,0,0,"small",1,1,350,"Кровопускающее (25%)"],
  ["jambiya", "Джамбия", "smallBlades", "Р/К",2,"u","2d6",10,1,0,0,"small",1,0.5,440,"Кровопускающее (25%); Пробивающее броню"],
  ["axe", "Топор", "melee", "Р",0,"e","2d6+1",10,1,0,0,"small",0,1,205],
  ["battle-axe", "Боевой топор", "melee", "Р",0,"c","5d6",15,1,0,0,"large",0,2,525],
  ["berserker-axe", "Топор берсерка", "melee", "Р",0,"r","6d6",15,2,0,0,"none",1,3,960,"Разрушающее; Кровопускающее (25%)"],
  ["brass-knuckles", "Кастет", "brawling", "Д",1,"e","1d6",15,1,0,0,"tiny",1,0.5,50,"Рукопашное: прибавляется к урону без оружия"],
  ["mace", "Булава", "melee", "Д",0,"c","5d6",15,1,0,0,"large",0,2,525],
  ["hammer", "Молот горца", "melee", "Д",0,"u","6d6+2",20,2,0,0,"none",1,3,1100,"Дезориентирующее (−2); Метеоритное (бонус надёжности уже включён)"],
  ["spear", "Копьё", "staffSpear", "К/Д",0,"e","3d6",10,2,0,2,"none",1,3.5,375,"Длинное"],
  ["poleaxe", "Секира", "staffSpear", "Р/К/Д",0,"r","4d6+2",10,2,0,0,"none",0,3,460,"Длинное"],
  ["halberd", "Красная алебарда", "staffSpear", "Р/К/Д",0,"r","6d6+3",10,2,0,0,"none",1,4,865,"Длинное"],
  ["staff", "Посох", "staffSpear", "Д",0,"c","1d6+2",10,2,0,0,"none",1,3,335,"Длинное; Фокусирующее (1)"],
  ["hooked-staff", "Посох с крюком", "staffSpear", "К/Д",0,"r","2d6",10,2,0,0,"none",1,3.5,550,"Длинное; Фокусирующее (1); Захватное"],
  ["iron-staff", "Железный посох", "staffSpear", "Д",0,"r","3d6",15,2,0,0,"none",1,4,675,"Длинное; Фокусирующее (2)"],
  ["crystal-staff", "Посох с кристаллом", "staffSpear", "Д",0,"u","2d6+2",5,2,0,0,"none",2,2.5,835,"Длинное; Фокусирующее (3); Улучшенное фокусирующее"],
  ["throwing-knife", "Метательный нож", "athletics", "К",0,"e","1d6",5,1,0,4,"tiny",0,0.5,50,"","thrown"],
  ["throwing-axe", "Метательный топор", "athletics", "Р",0,"e","2d6",10,1,0,2,"small",0,1,75,"","thrown"],
  ["orion", "Орион", "athletics", "Р",1,"r","1d6",5,1,0,4,"tiny",0,0.1,100,"","thrown"],
  ["short-bow", "Короткий лук", "archery", "К",0,"e","3d6+3",10,2,100,0,"large",0,1,290,"","ranged"],
  ["long-bow", "Длинный лук", "archery", "К",0,"e","4d6",10,2,200,0,"none",1,2,475,"","ranged"],
  ["war-bow", "Армейский лук", "archery", "К",0,"c","6d6",15,2,300,0,"none",1,3,835,"","ranged"],
  ["hand-crossbow", "Ручной арбалет", "crossbow", "К",1,"e","2d6+2",5,1,50,0,"large",1,0.5,285,"Медленно перезаряжающееся","ranged"],
  ["crossbow", "Арбалет", "crossbow", "К",1,"e","4d6+2",5,2,100,0,"none",1,3,455,"Медленно перезаряжающееся","ranged"],
  ["monster-crossbow", "Арбалет охотника на чудовищ", "crossbow", "К",1,"u","6d6",15,2,200,0,"none",1,4,1125,"Медленно перезаряжающееся; Пробивающее броню","ranged"]
].map((row, i) => weapon(i + 1, row));
const shieldRows = [
  ["leather-shield", "Кожаный щит",4,"e",0,0,0.5,50], ["buckler", "Стальной баклер",6,"c",0,0,1,150],
  ["temerian-shield", "Темерский щит",8,"c",1,0,1.5,225], ["skellige-shield", "Щит налётчика со Скеллиге",10,"r",1,0,2,325],
  ["kaedwen-shield", "Каэдвенский щит",14,"r",1,0,2.5,400], ["kite-shield", "Стальной каплевидный щит",16,"c",0,0,3,400],
  ["pavise", "Павеза",20,"r",0,1,4,500], ["nilfgaard-pavise", "Нильфгаардская павеза",25,"u",1,1,5,600]
];
CORE_WEAPONS.push(...shieldRows.map(([id,name,reliability,rare,slots,ev,weight,price], i) => weapon(101+i,[id,name,"melee","",0,rare,"0",reliability,1,0,0,"none",slots,weight,price,reliability >= 20 ? "Полное укрытие (стр. 80)" : "","shield",ev])));
const armorRows = [
  ["head", "Капюшон вердэнского лучника",3,"c",1,0,0.5,100], ["head","Двуслойный капюшон",5,"r",1,0,1,175], ["head","Каркасный шлем с полумаской",8,"c",0,0,1,200],
  ["head","Кольчужный капюшон",12,"e",0,0,1.5,250], ["head","Усиленный капюшон",14,"c",0,0,2,250], ["head","Темерский армет",16,"r",1,0,1.5,475],
  ["head","Топфхельм",20,"u",1,0,3.5,575], ["head","Скеллигский шлем",25,"r",1,0,3.5,700], ["head","Нильфгаардский шлем",30,"u",2,0,3,800],
  ["torso","Гамбезон",3,"e",0,0,1,100], ["torso","Аэдирнский гамбезон",5,"r",1,0,1.5,175], ["torso","Двуслойный гамбезон",8,"r",1,0,2.5,250],
  ["torso","Бригантина",12,"c",0,1,7,300], ["torso","Броня реданского алебардщика",14,"r",1,1,8.5,400], ["torso","Кожаная куртка из Лирии",16,"u",1,1,6.5,525],
  ["torso","Латный доспех",20,"u",1,2,14,625], ["torso","Хиндарсфьяльский тяжёлый доспех",25,"u",3,2,15,750], ["torso","Нильфгаардский латный доспех",30,"u",2,2,12,850],
  ["legs","Кавалерийские штаны",3,"c",0,0,0.5,75], ["legs","Стёганые штаны",5,"c",1,0,1,125], ["legs","Двуслойные штаны",8,"r",0,0,1.5,225],
  ["legs","Усиленные штаны",12,"e",0,0,3.5,250], ["legs","Реданские поножи",14,"r",1,0,4,400], ["legs","Кожаные штаны из Лирии",16,"u",1,0,3.5,525],
  ["legs","Латные поножи",20,"u",1,1,7.5,625], ["legs","Хиндарсфьяльские тяжёлые шоссы",25,"u",1,1,5,650], ["legs","Нильфгаардские поножи",30,"u",2,1,6,850]
];
export const CORE_ARMOR = armorRows.map(([zone,name,sp,rare,slots,encumbrance,weight,price], i) => ({ id: `armor.${zone}.${i % 9 + 1}`, documentId: `armo${String(i+1).padStart(12,"0")}`, name, type: "armor", source: "armor", system: {
  zone, armorClass: sp <= 8 ? "light" : sp <= 16 ? "medium" : "heavy", stoppingPower: { value: sp, max: sp }, rarity: rarity(rare), enhancementSlots: slots, encumbrance, weight, price,
  properties: zone === "head" && sp >= 16 ? "Ограничение зрения при опущенном забрале" : "", source: "Базовая книга, стр. 79–80" } }));
const gearRows = [
  ["alchemy-tools","Инструменты алхимика",3,80,"r","tool"], ["gem-amulet","Амулет с самоцветом",0.1,500,"u","tool","Фокусирующее (3)"],
  ["simple-amulet","Простой амулет",0.1,250,"u","tool","Фокусирующее (1)"], ["cooking-tools","Принадлежности для готовки",3,15,"e","tool"],
  ["crafting-tools","Инструменты ремесленника",5,83,"c","tool"], ["disguise-kit","Набор для маскировки",1,58,"r","tool","+2 к Маскировке"],
  ["art-tools","Инструменты для творчества",2,55,"c","tool"], ["fishing-tools","Рыболовные снасти",0.5,27,"e","tool","+2 к Выживанию при рыбной ловле"],
  ["forgery-tools","Инструменты для подделки",0.5,58,"r","tool"], ["makeup-kit","Набор для макияжа",0.5,35,"e","tool","+2 к Соблазнению и Харизме"],
  ["merchant-tools","Инструменты торговца",1.5,60,"c","tool","+2 к Торговле при оценке товара"], ["surgical-tools","Хирургические инструменты",1,83,"c","tool"],
  ["telecommunicator","Телекоммуникатор",4,1000,"u","tool"], ["thieves-tools","Воровские инструменты",1,80,"r","tool"],
  ["forge","Походная кузница",5,111,"r","tool"], ["writing-kit","Письменные принадлежности",1,25,"e","tool"],
  ["rope","Верёвка (20 метров)",1.5,20], ["bedroll","Походная постель",1.5,16], ["candles","Свечи (5)",0.5,5], ["chalk","Мелок",0.1,2],
  ["flint","Огниво",0.1,6], ["grapple","Крюк-кошка",0.5,13], ["mirror","Ручное зеркальце",0.5,27], ["ledger","Дневник / гроссбух",0.5,8],
  ["lantern","Фонарь",1,33], ["lock","Замок",0.1,34], ["strong-lock","Надёжный замок",0.1,68], ["handcuffs","Наручники",0.5,30],
  ["map","Карта Континента",0.1,18], ["pipe","Трубка",0.1,19], ["stakes","Колышки (5)",0.5,10], ["soap","Мыло",0.1,4],
  ["tarpaulin","Брезент",1.5,10], ["tent","Палатка",4,19], ["large-tent","Большая палатка",8,36], ["torch","Факел",0.1,1], ["waterskin","Бурдюк",1,8],
  ["rations","Сухой паёк (1 день)",1,5], ["alcahest","Алкагест",1,8], ["beer","Пиво",1,5], ["spirits","Крепкий алкоголь",1,10],
  ["wine","Вино",1,8], ["bag","Мешок",0.1,3], ["belt-pouch","Поясная сумка",0.1,7], ["bandolier","Бандольера",1,19],
  ["clothing","Простая одежда",2,10], ["warm-clothing","Тёплая одежда",3,45]
];
export const CORE_GEAR = gearRows.map(([id,name,weight,price,rare = "",kind = "gear",properties = ""], i) => ({ id: `gear.${id}`, documentId: `eqip${String(i+1).padStart(12,"0")}`, name, type: "equipment", source: kind === "tool" ? "tools" : "core", system: { weight, price, rarity: rarity(rare) ?? rare, kind, properties, source: "Базовая книга, стр. 92–93" } }));
export const LEGACY_GEAR_STATS = {
  "musical-instrument": { weight: 1, price: 38 }, "sacred-symbol": { weight: 0.1, price: 14 }, "shoulder-bag": { weight: 1, price: 14 },
  "trained-bird": { kind: "companion" }, "trained-snake": { kind: "companion" }
};
for (const entry of CORE_GEAR) {
  const container = CORE_CONTAINERS[entry.id];
  if (container) Object.assign(entry.system, container, { kind: "container", source: "Базовая книга, стр. 93, 95" });
}
Object.assign(LEGACY_GEAR_STATS["shoulder-bag"], CORE_CONTAINERS["shoulder-bag"], { kind: "container" });
export const CORE_EQUIPMENT = [...CORE_WEAPONS, ...CORE_ARMOR, ...CORE_GEAR, ...CORE_AMMUNITION, ...ELDER_EQUIPMENT];
