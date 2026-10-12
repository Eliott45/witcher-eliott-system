import { weaponRecord } from "./equipment-records.mjs";
import { AMMUNITION_ICON } from "./core-ammunition.mjs";

const source = "Базовая книга";
const weapons = [
  ["elven-messer","Эльфский мессер","swordsmanship","К/Р",2,"3d6+4",15,1,0,"large",2,2,595],
  ["vrihedd-blade","Клинок бригады «Врихедд»","swordsmanship","К/Р",3,"4d6+4",15,1,0,"large",0,2.5,745,"Кровопускающее (25%)"],
  ["meteorite-sword","Меч из метеоритной стали","swordsmanship","К/Р",1,"5d6",20,2,0,"none",2,3,875,"Сбалансированное; Метеоритное"],
  ["gnomish-gwyhyr","Гномий гвихир","swordsmanship","К/Р",3,"5d6+3",15,2,0,"none",2,2.5,1090,"Кровопускающее (50%)"],
  ["tir-tochair-blade","Клинок из Тир Тохаира","swordsmanship","К/Р",3,"6d6",15,2,0,"none",2,3,1175,"Кровопускающее (25%)"],
  ["halfling-rondel","Низушечий рондель","smallBlades","К/Р",2,"2d6+2",10,1,0,"small",1,1,485,"Пробивающее броню"],
  ["dwarven-cleaver","Краснолюдский секач","smallBlades","Р/Д",2,"3d6",15,1,0,"small",1,1.5,500],
  ["dwarven-axe","Краснолюдский топор","melee","Р",3,"5d6+3",15,1,0,"large",1,4,740],
  ["gnomish-black-axe","Гномий чёрный топор","melee","Р",2,"6d6+2",15,2,0,"none",2,2.5,910],
  ["mahakam-martell","Махакамский мартель","melee","Д",0,"5d6",15,2,0,"large",1,3.5,750,"Пробивающее броню"],
  ["meteorite-flail","Кистень из метеоритной стали","melee","Д",2,"6d6",20,1,0,"none",2,4,900,"Захватное; Метеоритное"],
  ["dwarven-pole-hammer","Краснолюдский боевой молот","staffSpear","К/Д",0,"5d6+2",15,2,0,"none",1,4,835,"Длинное; Дезориентирующее (−2)"],
  ["elven-glaive","Эльфская глефа","staffSpear","Р/К/Д",2,"4d6+3",10,2,0,"none",2,3,925,"Длинное; Кровопускающее (25%)"],
  ["gnomish-staff","Гномий посох","staffSpear","Д",1,"3d6+2",15,2,0,"large",2,2.5,910,"Длинное; Фокусирующее (3)"],
  ["elven-travel-staff","Эльфский дорожный посох","staffSpear","Д",1,"3d6",10,2,0,"none",2,1.5,975,"Длинное; Фокусирующее (3); Улучшенное фокусирующее"],
  ["elven-travel-bow","Эльфский походный лук","archery","К",1,"4d6",10,2,200,"large",1,1,575],
  ["elven-zefar","Эльфский зефар","archery","К",2,"6d6",10,2,350,"none",2,2.5,1100,"Улучшенное пробивающее броню"],
  ["gnomish-hand-crossbow","Гномий ручной арбалет","crossbow","К",3,"2d6",10,1,100,"small",1,1,425,"Медленно перезаряжающееся"],
  ["dwarven-heavy-crossbow","Краснолюдский тяжёлый арбалет","crossbow","К",3,"5d6",15,2,300,"none",2,3.5,850,"Медленно перезаряжающееся"]
].map(([id,name,skill,type,wa,damage,rel,hands,range,conceal,slots,weight,price,properties=""],i) =>
  weaponRecord(`eldw${String(i+1).padStart(12,"0")}`, [id,name,skill,type,wa,"u",damage,rel,hands,range,0,conceal,slots,weight,price,properties,range?"ranged":"melee"],source));
const shields = [
  ["gnomish-buckler","Гномий баклер",15,2,0,1,450],
  ["elven-shield","Эльфский щит",25,2,0,3,700],
  ["mahakam-pavise","Махакамская павеза",35,2,1,5.5,1050]
].map(([id,name,rel,slots,ev,weight,price],i) => weaponRecord(`elds${String(i+1).padStart(12,"0")}`,
  // Official errata removes the AE column from every shield table.
  [id,name,"melee","",0,"u","0",rel,1,0,0,"none",0,weight,price,i===2?"Полное укрытие":"","shield",ev],source));
const armor = [
  ["halfling-doublet","Низушечий защитный дублет",8,1,"torso","light",0,1,375,"Скрытая броня: Внимание СЛ 20"],
  ["gnomish-chain","Кольчуга гномьей работы",10,1,"all","light",0,5,975,"Сопротивление режущему урону","Р"],
  ["dwarven-cloak","Краснолюдский плащ",16,1,"all","medium",0,5,1400],
  ["scoiatael-armor","Броня скоя’таэля",20,2,"all","medium",1,12,2325,"+2 к Скрытности в дикой природе"],
  ["gnomish-dragoon","Драгунская броня гномьей работы",25,2,"all","heavy",2,20,2850,"Сопротивление режущему и колющему урону; +2 к Верховой езде на лошади","Р/К"],
  ["mahakam-plate","Махакамские латы",30,3,"all","heavy",2,30,3525,"Сопротивление режущему, колющему и дробящему урону","Р/К/Д"]
].map(([id,name,sp,slots,zone,armorClass,encumbrance,weight,price,properties="",resistances=""],i) => ({
  id:`armor.${id}`,documentId:`elda${String(i+1).padStart(12,"0")}`,type:"armor",name,source:"armor",
  system:{zone,armorClass,stoppingPower:{value:sp,max:sp},enhancementSlots:slots,encumbrance,weight,price,properties,resistances,rarity:"unique",source,
    description: zone==="all"?"<p>Цельный доспех: защищает голову, корпус, руки и ноги. Вес и цена учитываются за весь комплект.</p>":"<p>Защитный дублет можно принять за обычную одежду. Распознать броню позволяет Внимание СЛ 20.</p>"} }));
const ammunition = [
  ["elven-burrowing","Эльфские ввинчивающиеся","К",10,"Кровопускающее (100%)","Наконечник остаётся в ране. Кровотечение прекращается после его извлечения: Первая помощь СЛ 16."],
  ["dwarven-impact","Краснолюдские пробивные","Д",15,"Разрушающее","Тяжёлый наконечник повреждает броню при попадании: 1d6 / 2 урона её прочности."]
].map(([id,name,damageType,reliability,properties,description],i) => ({id:`ammunition.${id}`,documentId:`elde${String(i+1).padStart(12,"0")}`,type:"equipment",name,source:"ammunition",img:AMMUNITION_ICON,
  system:{kind:"ammunition",quantity:1,purchaseQuantity:1,weight:.1,price:50,damageType,rarity:"unique",reliability:{value:reliability,max:reliability},concealment:"large",properties,description:`<p>${description}</p>`,source}}));

export const ELDER_EQUIPMENT = [...weapons,...shields,...armor,...ammunition];
