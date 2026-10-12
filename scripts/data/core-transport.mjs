// Core RU p.91 (SPD/HP also verified against pp.312–313 per official errata): the transport "Weight" column is capacity, never the mass of the mount/vehicle.
const rows=[
  ["carriage","Карета","wagon",0,-1,0,60,600,660,-3],
  ["cart","Повозка","wagon",0,0,0,30,300,200,-1],
  ["cutter","Куттер","boat",0,0,10,60,610,1670],
  ["horse","Лошадь","mount",11,2,12,40,100,520],
  ["mule","Мул","mount",7,0,9,45,150,200],
  ["ox","Вол","mount",5,-2,6,50,300,278],
  ["sailboat","Парусная лодка","boat",0,1,6,30,130,230],
  ["sailing-ship","Парусный корабль","boat",0,-2,8,80,2040,2180],
  ["warhorse","Боевой конь","mount",12,-2,11,50,270,1600]
];
const icon=type=>`systems/witcher-eliott-system/assets/icons/${type==="mount"?"horse":type==="wagon"?"wagon":"sailboat"}.svg`;
export const CORE_TRANSPORT=rows.map(([id,name,type,athletics,handling,speed,hp,capacity,price,speedModifier=0],i)=>({
  id:`transport.${id}`,documentId:`trns${String(i+1).padStart(12,"0")}`,name,type:"equipment",source:"transport",img:icon(type),
  system:{kind:"transport",quantity:1,weight:0,capacity,price,transport:{type,athletics,handling,speed,speedModifier,health:{value:hp,max:hp},mountId:""},
    source:"Базовая книга",description:`<p>${type==="mount"?"Верховое или вьючное животное.":type==="wagon"?"Для движения необходимо запрячь животное.":"Водный транспорт."} Грузоподъёмность — ${capacity} кг.</p>`}
}));
// TODO: object size is not modeled yet; the book small/medium limits remain descriptive.
const tackRows=[
 ["saddle","Седло","saddle",5,100,"everywhere","Нет штрафа за езду без седла."],
 ["cavalry-saddle","Кавалерийское седло","saddle",6,325,"rare","+1 к проверкам управления при атаке; встроенные ножны для оружия."],
 ["racing-saddle","Скаковое седло","saddle",3,200,"common","+1 к проверкам управления для Верховой езды; +1 СКОР.",{speedBonus:1}],
 ["spurs","Шпоры","spurs",.1,100,"everywhere","+1 к успокоению скакуна."],
 ["racing-spurs","Скаковые шпоры","spurs",.1,125,"common","+2 к успокоению скакуна."],
 ["saddlebags","Перемётная сума","bags",1.5,100,"everywhere","Два отделения по 25 кг для небольших и средних предметов.",{compartments:2},50],
 ["military-saddlebags","Военная перемётная сума","bags",2,150,"rare","Два отделения по 50 кг для небольших и средних предметов; снаружи крепления для 6 крупных предметов.",{compartments:2,externalSlots:6},100],
 ["leather-barding","Кожаные конские доспехи","barding",10,550,"rare","ПБ 10.",{stoppingPower:{value:10,max:10}}],
 ["mail-barding","Кольчужные конские доспехи","barding",25,1050,"unique","ПБ 15; −1 к проверкам управления для Верховой езды.",{stoppingPower:{value:15,max:15}}]
];
export const CORE_TACK=tackRows.map(([id,name,slot,weight,price,rarity,properties,tack={},capacity=0],i)=>({
 id:`tack.${id}`,documentId:`tack${String(i+1).padStart(12,"0")}`,name,type:"equipment",source:"tack",
 img:`systems/witcher-eliott-system/assets/icons/${slot==="barding"?"armor":slot==="bags"?"saddlebags":"saddle"}.svg`,
 system:{kind:slot==="bags"?"container":"tack",quantity:1,weight,price,rarity,capacity,tack:{slot,...tack},properties,source:"Базовая книга",description:`<p>${properties}</p>`}
}));
