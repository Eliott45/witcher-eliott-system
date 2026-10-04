// Prices: core RU p.93. Descriptions/rules: pp.96–97. No inventory Items are created for services.
const service = (id, name, price, unit, description, rules = {}, group = "services") => ({
  id, name, price, unit, description, rules, group, pricing: "fixed"
});
export const CORE_SERVICES = [
  service("cold-bath", "Ванна с холодной водой", 8, "ванна", "Купание в простой лохани с холодной водой."),
  service("hot-bath", "Ванна с горячей водой", 16, "ванна", "Горячая ванна для мытья и отдыха после дороги."),
  service("coach-ride", "Поездка в карете", 85, "поездка", "Поездка в наёмной карете; маршрут и условия согласуются с возницей."),
  service("scribe", "Услуги летописца", 25, "работа", "Летописец запишет и сохранит рассказ, а также может изготовить гобелен или рукопись.", { skillBases: [{skill:"fineArts",value:15}], duration:"По договорённости" }),
  service("craftsman", "Услуги ремесленника", 35, "предмет", "Работа ремесленника: изготовление и другие работы по его специальности. При изготовлении по предоставленному чертежу оплачиваются и работа, и стоимость самого изделия.", { skillBases:[{skill:"crafting",value:15},{skill:"alchemy",value:15}], skillChoice:true, duration:"1d6 / 2 дней", extra:"craftValue" }),
  service("medic", "Услуги медика", 50, "пациент", "Лечение у цирюльника, лекаря или другого специалиста. За каждое критическое ранение взимается доплата: лёгкое — 10, среднее — 25, тяжёлое — 50, смертельное — 100 крон.", { skillBases:[{professionAbility:"profession.doctor.healing-hands",name:"Лечащее прикосновение",value:15}], duration:"1 день", extra:"criticalWounds" }),
  service("entertainment", "Развлечения", 10, "час", "Музыка, выступление барда или другое развлечение в заведении.", {skillBases:[{skill:"performance",value:15}],duration:"По договорённости"}),
  {...service("fence", "Услуги скупщика краденого", 25, "выручка", "Скупщик продаёт переданные ему вещи и оставляет себе четверть выручки. В заказе укажите согласованную выручку; передача вещей и получение денег за продажу согласуются с мастером.", {skillBases:[{skill:"business",value:15}],duration:"1d6 / 2 дней"}),pricing:"percent"},
  service("laborer", "Наёмный работник", 15, "день", "Помощник для переноски вещей и других простых физических работ.", {skillBases:[{skill:"athletics",value:15},{skill:"physique",value:15}],duration:"По договорённости"}),
  service("investigator", "Услуги следователя", 45, "работа", "Поиск людей и сведений в городе по согласованному поручению.", {skillBases:[{skill:"streetwise",value:15}],duration:"1d6 дней"}),
  service("laundry", "Услуги прачки", 8, "стирка", "Стирка одежды и очистка вещей от дорожной грязи."),
  service("lawyer", "Услуги законника", 50, "дело", "Помощь в разбирательствах с городскими властями и толковании законов.", {skillBases:[{skill:"education",value:15},{skill:"persuasion",value:15}],duration:"1d6 дней"}),
  service("messenger", "Услуги посыльного", 10, "поручение", "Доставка письма или сообщения по согласованному адресу.", {skillBases:[{skill:"wildernessSurvival",value:15}],duration:"По договорённости"}),
  service("courtesan", "Услуги проститутки", 12, "час", "Платное общество взрослого человека на согласованное время.", {skillBases:[{skill:"seduction",value:15}],duration:"По договорённости"}),
  service("horse-rental", "Аренда лошади", 50, "день", "Наём лошади для поездки. Оплата взимается за каждый день аренды."),
  service("sea-passage", "Морское путешествие", 85, "переход", "Место пассажира на корабле для согласованного маршрута. Из Северных королевств или Нильфгаарда на Скеллиге цена удваивается; между Севером и Нильфгаардом умножается на 1,5.", {extra:"seaRoute"}),
  service("toll", "Плата на заставе", 10, "проезд", "Пошлина за проезд через заставу, границу или охраняемый участок пути."),
  service("straw-bed", "На полу на соломе", 2, "ночь", "Самый простой ночлег под крышей: соломенная подстилка и общее помещение.", {}, "lodging"),
  service("suspect-room", "Подозрительная комната", 4, "ночь", "Дешёвая комната без замка, которую нередко приходится делить с другими постояльцами.", {}, "lodging"),
  service("cheap-room", "Дешёвая комната", 8, "ночь", "Скромная отдельная комната; дверь не запирается.", {}, "lodging"),
  service("standard-room", "Обычная комната", 16, "ночь", "Комната с запирающейся дверью, кроватью, сеном вместо подушки и водой для умывания.", {lockDC:15}, "lodging"),
  service("good-room", "Хорошая комната", 36, "ночь", "Удобная комната с мягкой периной, занавесками и запирающейся дверью.", {lockDC:15}, "lodging"),
  service("excellent-room", "Отличная комната", 72, "ночь", "Роскошная комната с удобной постелью, вином и угощением. На двери надёжный замок.", {lockDC:18}, "lodging"),
  service("stable", "Стойло в конюшне", 2, "ночь", "Ночлег для скакуна в конюшне на время отдыха хозяина.", {}, "lodging")
];
export const SERVICE_PRESETS = [
  {id:"all",name:"Все услуги книги",ids:CORE_SERVICES.map(entry=>entry.id)},
  {id:"inn",name:"Таверна и ночлег",ids:["cold-bath","hot-bath","entertainment","laundry",...CORE_SERVICES.filter(entry=>entry.group==="lodging").map(entry=>entry.id)]},
  {id:"medic",name:"Лекарь",ids:["medic"]},
  {id:"craftsman",name:"Мастерская",ids:["craftsman"]},
  {id:"travel",name:"Перевозчик",ids:["coach-ride","horse-rental","sea-passage","toll","stable"]}
];
export const SERVICE_GROUPS = [{id:"services",name:"Услуги"},{id:"lodging",name:"Проживание"}];
export const CRITICAL_WOUND_FEES = {simple:10,complex:25,difficult:50,deadly:100};
export const SEA_ROUTES = [{id:"coast",name:"Обычный переход",multiplier:1},{id:"skellige",name:"На Скеллиге с материка",multiplier:2},{id:"north-nilfgaard",name:"Север ↔ Нильфгаард",multiplier:1.5}];
export const getServiceRule = entry => CORE_SERVICES.find(rule=>rule.id===entry.ruleId) ?? null;
export const defaultServices = () => CORE_SERVICES.map(({id,name,price,unit,description,group,pricing})=>({id,ruleId:id,name,price,unit,description,group,pricing,enabled:true}));

export function applyServicePreset(entries, presetId) {
  const preset = SERVICE_PRESETS.find(entry=>entry.id===presetId);
  if (!preset) throw new Error("Неизвестный пресет услуг.");
  return entries.map(entry=>entry.ruleId ? {...entry,enabled:preset.ids.includes(entry.ruleId)} : {...entry});
}
