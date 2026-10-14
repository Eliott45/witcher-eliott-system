import { SYSTEM_ID } from "../config.mjs";
import { materialUuid } from "./workshop-materials.mjs";

export const PROSTHETIC_SOURCE = "Протезы и инвалидные коляски";
export const PROSTHETIC_FOLDER = {id:"gearProsthetic01",name:PROSTHETIC_SOURCE};
export const PROSTHETIC_USE = "Наденьте протез на вылеченную потерю руки или ноги во вкладке «Эффекты». Надевание занимает около 2 минут, снятие — 30 секунд. Надёжность не расходуется; попадание перенаправляется на владельца, протез не отваливается.";
const description = text => `<p>${text}</p><p>${PROSTHETIC_USE}</p>`;
export const BASIC_PROSTHESIS = {id:"gear.simple-prosthesis",documentId:"ggen000000000008",name:"Простой протез",type:"equipment",source:"prosthetics",
  system:{kind:"gear",weight:2,price:50,rarity:"everywhere",source:PROSTHETIC_SOURCE,
    properties:"Рука: −3 к атаке и защите; Нога: −1 к Уклонению/Изворотливости; Не проводит Хаос",
    description:description("Подвижный протез восстанавливает функции конечности и обычную Скорость. Атаки и защиты с помощью протеза руки получают −3; протез ноги даёт −1 к Уклонению/Изворотливости. Проводить Хаос через него нельзя.")}};
export const PROSTHETIC_EQUIPMENT = [
  ["magical-prosthesis","Магический протез",1,500,"Полная подвижность; Не проводит Хаос","Зачарованный протез полностью заменяет утраченную конечность без штрафов. Проводить Хаос через него нельзя."],
  ["witcher-prosthesis","Ведьмачий протез",2,800,"Полная подвижность; Проводит Хаос; Серебряные удары (1d6)","Укреплённый протез полностью заменяет конечность без штрафов и проводит Хаос. Удар именно этой рукой или ногой добавляет 1d6 серебряного урона против восприимчивых к серебру существ."],
  ["conduit-prosthesis","Фокусирующий протез",3,1000,"Полная подвижность; Проводит Хаос; Фокусирующее (2); Улучшенное фокусирующее","Протез полностью заменяет конечность без штрафов и проводит Хаос. Надетый протез служит фокусом: Фокусирующее (2) и Улучшенное фокусирующее."],
].map(([id,name,weight,price,properties,text],i)=>({id:`gear.${id}`,documentId:`prstGear${String(i+1).padStart(8,"0")}`,type:"equipment",source:"prosthetics",name,
  system:{source:PROSTHETIC_SOURCE,kind:"gear",weight,price,rarity:"unique",properties,description:description(text)}}));
for (const [i,id,name,weight,price,rarity,penalty] of [
  [4,"basic-wheelchair","Простая инвалидная коляска",6,50,"everywhere",3],
  [5,"quality-wheelchair","Продвинутая инвалидная коляска",3,200,"rare",1]
]) PROSTHETIC_EQUIPMENT.push({id:`gear.${id}`,documentId:`prstGear${String(i).padStart(8,"0")}`,name,type:"equipment",source:"prosthetics",
  system:{source:PROSTHETIC_SOURCE,kind:"gear",weight,price,rarity,properties:`Подвижность без штрафов от ранений; Плавание и лазание −${penalty}`,
    description:`<p>Во время использования снимает снижение Скорости, Уклонения/Изворотливости и Атлетики, вызванное критическими ранениями или постоянным ограничением подвижности. Плавание и лазание: −${penalty} к проверке.</p><p>Наденьте коляску в инвентаре. При броске Атлетики выберите обычную проверку, плавание или лазание. Штрафы брони, перегрузки и других состояний сохраняются. Атаки направлены в персонажа, коляска не становится отдельной целью.</p>`}});
PROSTHETIC_EQUIPMENT.push({id:"material.sweet-flag",documentId:"prstGear00000006",name:"Аир обыкновенный",type:"equipment",source:"prosthetics",
  system:{source:PROSTHETIC_SOURCE,kind:"material",weight:.1,price:18,rarity:"common",material:{substance:"aether",forageDC:12,quantityFormula:"1d10",location:"Поля и болота"},
    description:"<p>Лекарственная трава для местного облегчения боли. Применяется в отыгрыше; числового лечебного бонуса не даёт. Содержит субстанцию «Эфир» и подходит для алхимических формул.</p>"}});
// The original RTG table gives DC 13 for Basic and DC 10 for Magical; the supplied translation changes both.
const recipes = [
  [BASIC_PROSTHESIS,"novice",13,5,38,76,"cotton:1 timber:3 leather:1"],
  [PROSTHETIC_EQUIPMENT[0],"master",10,8,375,750,"cotton:3 double-linen:2 ester-grease:4 etching-acid:4 fifth-essence:2 hardened-timber:3 leather:1 steel:1"],
  [PROSTHETIC_EQUIPMENT[1],"master",22,9,600,1200,"cotton:2 double-linen:2 ester-grease:2 etching-acid:6 fifth-essence:3 hardened-timber:2 hardened-leather:1 sharpening-grit:1 silver:1 steel:2"],
  [PROSTHETIC_EQUIPMENT[2],"master",24,10,750,1500,"cotton:4 double-linen:2 ester-grease:4 etching-acid:8 fifth-essence:4 gemstone:1 hardened-timber:3 leather:1 optima-mater:1 steel:1 wax:1"],
  [PROSTHETIC_EQUIPMENT[3],"novice",13,5,38,76,"cotton:5 linen:1 timber:8"],
  [PROSTHETIC_EQUIPMENT[4],"journeyman",16,8,150,300,"cotton:6 ester-grease:2 steel:1 leather:2 timber:8"]
];
export const PROSTHETIC_RECIPES = recipes.map(([item,grade,dc,hours,investment,price,materials],i)=>({id:`diagram.${item.id}`,documentId:`prstDiag${String(i+1).padStart(8,"0")}`,type:"recipe",name:`Чертёж: ${item.name}`,source:"prosthetics",
  system:{source:PROSTHETIC_SOURCE,price,recipe:{category:"diagram",grade,dc,time:hours*3600,investment,quantity:1,tools:["gear.crafting-tools"],forge:materials.includes("steel:"),
    resultUuid:`Compendium.${SYSTEM_ID}.equipment.Item.${item.documentId}`,components:materials.split(" ").map(row=>{const [id,n]=row.split(":");return {uuid:materialUuid(id),quantity:Number(n),substance:""};})}}}));
