import { INVOCATION_ROWS } from "./invocations.mjs";
import { SIGN_ROWS } from "./signs.mjs";
import { RITUAL_ROWS } from "./rituals.mjs";
import { HEX_ROWS } from "./hexes.mjs";
import { SPELL_TARGET_BY_ID } from "./spell-targets.mjs";
export { SPELL_TARGETS, spellTargetLabel } from "./spell-targets.mjs";
// Core RU pp.99–108. Brief descriptions are paraphrased; numbers follow the book + official errata.
export const SPELL_ELEMENTS={mixed:"Смешанные",earth:"Земля",air:"Воздух",fire:"Огонь",water:"Вода"};
export const SPELL_GRADES={novice:"Новичок",journeyman:"Подмастерье",master:"Мастер",archpriest:"Верховный жрец"};
export const MAGIC_TRADITIONS={mage:"Маг",druid:"Друид",priest:"Проповедник"};
export const MAGIC_KINDS={spell:"Заклинание / инвокация",sign:"Знак",ritual:"Ритуал",hex:"Порча"};
export const MAGIC_CATEGORIES={...MAGIC_TRADITIONS,sign:"Ведьмачьи знаки",ritual:"Ритуалы",hex:"Порчи"};
export const HEX_DANGERS={low:"Низкая",medium:"Средняя",high:"Высокая"};
export const magicCategory=system=>system.kind&&system.kind!=="spell"?system.kind:system.tradition??"mage";
export const SPELL_DEFENSES={none:"Нет",willTriple:"Воля цели × 3",dodge:"Уклонение",block:"Блокирование",resistMagic:"Сопротивление магии",spellCasting:"Сотворение заклинаний",gm:"СЛ определяет ведущий"};
export const SPELL_RANGE_KINDS={distance:"Дистанция, м",self:"На себя",selfOrDistance:"На себя или дистанция",radius:"Радиус, м",cone:"Конус, м",unlimited:"Неограниченная",special:"По описанию"};
export const SPELL_DURATION_KINDS={instant:"Мгновенно",rounds:"Раунды",hours:"Часы",days:"Дни",sustained:"Поддержание",permanent:"Постоянно",special:"Особая"};
const rows=[];
const add=(grade,element,page,spells)=>{for(const [id,name,cost,range,duration,defense,description,damage=""] of spells)rows.push({id:`spell.${id}`,name,grade,element,page,cost,range,duration,defense,description,damage});};
// Range: numeric metres, r = radius, c = cone, self, unlimited.
// Duration: i = instant, r/h + formula, s + upkeep, p = permanent, otherwise explicit text.
add("novice","mixed",102,[
 ["afan-mirror","Зеркало Афана",3,10,"s2","none","Создаёт 1d10 нематериальных копий заклинателя. Управление ими не требует действия; копии не могут выходить за пределы дистанции."],
 ["blinding-dust","Слепящая пыль",3,4,"r1d10","dodge,block","Пыль ослепляет цель на время действия заклинания."],
 ["dispel","Рассеивание",0,10,"i","spellCasting","Отменяет заклинание, ритуал или порчу. Затраты — половина исходной стоимости отменяемой магии. Проверка Сотворения заклинаний должна превысить исходную проверку. Может использоваться как защита от магической атаки, в том числе с физической составляющей."],
 ["glamour","Очарование",5,"self","h1d6","none","Иллюзия привлекательности: +3 к Соблазнению, Харизме и Лидерству на время действия."],
 ["magic-compass","Магический компас",3,"self","h1d6","none","Указывает направление на знакомое заклинателю место либо на север."],
 ["mind-manipulation","Управление чувствами",3,5,"r1d10","resistMagic","На время действия навязывает цели ненависть, любовь, подавленность или эйфорию."],
 ["summon-staff","Призыв посоха",2,"unlimited","i","none","Дематериализует собственный посох и отправляет в место, посещённое за последний день. Повторное сотворение возвращает посох."],
 ["telepathy","Телепатия",2,10,"s1","none","Мысленное общение с одной целью без языкового барьера. При чтении мыслей маг может заметить вторжение: каждый раунд Магические познания против исходной проверки Телепатии." ]
]);
add("novice","earth",102,[
 ["cenlly-graig","Сенлли Грейг",3,5,"i","dodge,block","Камни наносят 1d6 урона за каждый пункт превышения защиты цели, максимум 10d6. Это одна атака (errata).","1d6"],
 ["codi-bywyd","Коди Бивид",2,4,"i","none","За один ход превращает семечко в небольшое взрослое растение. Подходит для трав, в том числе алхимических, но не для крупных деревьев."],
 ["diagnostic-spell","Магическое обследование",3,5,"i","none","Показывает оставшиеся ПЗ, критические ранения, болезни и отравление цели."],
 ["earthen-spike","Каменный шип",5,6,"i","dodge,block","Каменный сталагмит наносит 5d6 урона. Он остаётся на месте, пока не получит 20 пунктов урона и не будет уничтожен.","5d6"],
 ["korath-breath","Дыхание Кората",3,"c3","i","dodge,block","Осколки земли и скал в конусе ослепляют не защитившихся противников на 1d6 раундов."],
 ["luthien-quill","Перо Лютиэнь",2,1,"i","none","Создаёт текст или рисунок на твёрдой неживой поверхности." ]
]);
add("novice","earth",103,[
 ["magic-healing","Магическое исцеление",5,2,"r1d10","none","Восстанавливает 3 ПЗ за ход в течение действия. Может применяться несколько раз для лечения критического ранения; тогда обычные ПЗ не восстанавливаются."],
 ["talfryn-prison","Тюрьма Тальфрина",3,10,"Пока корни не уничтожены","dodge","Опутывает цель корнями. Корни уничтожаются 15 пунктами урона. Каждый раунд цель может действием пройти Уклонение/Изворотливость против результата сотворения, чтобы вырваться." ]
]);
add("novice","air",103,[
 ["adenydd","Адэнидд",4,"self","s2","none","Позволяет планировать: за каждые 2 м падения перемещение на 2 м в выбранном направлении. Достигнув земли во время действия, заклинатель не получает урон от падения."],
 ["air-pocket","Воздушный пузырь",3,12,"r2d10","none","Пузырь свежего воздуха радиусом 1 м под водой или в непригодной для дыхания среде."],
 ["bronwyn-gust","Шквал Бронвина",2,2,"i","dodge","Отталкивает цель на столько метров, на сколько сотворение превысило защиту, и наносит 1d6 урона. Столкновение с преградой вызывает урон от таранного удара.","1d6"],
 ["freshen-air","Освежение воздуха",2,"r4","s2","none","Очищает воздух в радиусе 4 м вокруг заклинателя от дыма, ядовитого газа и других загрязнений."],
 ["urien-shelter","Убежище Уриена",3,"r8","h1d6","none","Защищает зону вокруг заклинателя от сильной жары, холода, дождя и снега."],
 ["static-storm","Статическая буря",5,"r5","r2d6","none","Все в радиусе, кроме заклинателя, кто носит металлическую броню или держит металлическое оружие, получают 2 урона за раунд."],
 ["telekinesis","Телекинез",3,5,"s2","none","Поднимает и перемещает предмет массой до 5 кг за уровень Сотворения заклинаний. Манипуляции используют Волю + Сотворение со штрафом −3, сложные действия −5. Дальность метания определяется Волей вместо ТЕЛ."],
 ["zephyr","Зефир",5,"r2","i","none","Отталкивает всех в радиусе 2 м на 6 м и наносит 1d6 урона (errata). Столкновение вызывает дополнительный таранный урон.","1d6"]
]);
add("novice","fire",103,[
 ["aenye","Энье",5,12,"i","dodge,block","Огненный сгусток наносит 4d6 урона; вероятность горения — 75%.","4d6"],
 ["aine-versesos","Айна Версеос",1,"r4","s2","none","Создаёт яркий свет в радиусе 4 м вокруг заклинателя."],
 ["brand-fire","Огненное клеймо",4,8,"i","none","Выжигает на обнажённой коже простой символ или клеймо, нанося 1d6 урона и оставляя шрам. Лечащее прикосновение СЛ 15 может удалить клеймо, но остаётся большой шрам.","1d6"],
 ["cadfan-grasp","Хватка Кадфана",4,8,"r1d6","none","Нагревает металлический предмет. Держащий его отпускает предмет либо получает 2d6 урона в соответствующую конечность. Можно нагреть оружие: +2d6 урона и 50% вероятности горения.","2d6"]
]);
add("novice","fire",104,[
 ["magic-flare","Магическая вспышка",2,"r8","i","resistMagic","Вспышка видна за 10 км. Все в радиусе 8 м проходят Сопротивление магии, иначе ослеплены на 1d6 раундов."],
 ["raise-flame","Управление пламенем",3,10,"s2","none","Распространяет уже горящее пламя на 2 м за раунд; уменьшает или усиливает небольшой огонь, изменяя его урон на 1."],
 ["tanio-ilchar","Танио Ильхар",3,8,"i","dodge","Всполох в зоне 2×2 м с вероятностью 100% поджигает цели внутри."],
 ["fire-stream","Волна огня",4,"c3","i","dodge,block","Поток огня в трёхметровом конусе наносит 2d6 урона и с вероятностью 50% поджигает цель.","2d6"]
]);
add("novice","water",104,[
 ["carys-hail","Град Кэрис",3,5,"i","dodge,block","За каждый пункт превышения защиты цели — 1d6 урона, максимум 5d6; вероятность заморозить — 25%. Это одна атака (errata).","1d6"],
 ["control-water","Управление водой",5,10,"s2","gm","Меняет течение воды: удваивает скорость пловцов, увеличивает скорость кораблей в полтора раза, замедляет или останавливает речное течение."],
 ["curse-sedna","Проклятие Седны",5,12,"s2","dodge","Создаёт водоворот размером 4 м. В пределах 5 м от него цель каждый раунд проходит Плавание против результата сотворения либо уходит под воду. Для всплытия повторяет проверку; иначе задыхается."],
 ["dormyn-fog","Туман Дормина",3,"r10","s2","none","Плотный туман: −3 к Вниманию, обзор сокращается до 4 м для всех находящихся в зоне."],
 ["downpour","Ливень",2,"r8","s2","none","Сильный дождь гасит открытое пламя и снимает горение в зоне."],
 ["ice-slick","Гололёд",2,10,"r2d10","dodge","Ледяной участок 2×2 м. Пересекающий его проходит Атлетику против результата сотворения, иначе падает."],
 ["puro-dwr","Пиро Дюр",2,4,"r1d10","none","Очищает 1 м³ воды от яда и болезней, но не удаляет живые существа. В большом водоёме после окончания эффекта вода постепенно снова загрязняется."],
 ["rhewi","Рьеви",2,8,"r1d10","dodge","Слой льда делает цель замороженной. Покрытый льдом неживой предмет нельзя использовать или перемещать." ]
]);
add("journeyman","mixed",105,[
 ["eilhart-technique","Метод Эйльхарт",12,3,"i","resistMagic","Извлекает из памяти цели одну тайну. Критический провал при защите навсегда уменьшает ИНТ цели на 1."],
 ["illusion","Иллюзия",8,20,"s4","resistMagic","Создаёт зрительную иллюзию, в которую верят провалившие защиту. Она не имеет запаха, не звучит и неосязаема."],
 ["teleportation","Телепортация",10,"unlimited","i","none","Переносит только заклинателя и его вещи в знакомое место: Сотворение СЛ 15. Провал смещает точку на 1d6 миль. С предметом из незнакомого места можно телепортироваться туда против СЛ 20; при провале — смещение не более 2d10 миль." ]
]);
add("journeyman","earth",105,[
 ["elgan-theory","Теория Эльгана",10,8,"r2d10","none","Магнитит металлический предмет. Металл в пределах 2 м притягивается и прилипает к нему; оторвать — Сила СЛ 18. Примагниченные к экипировке вещи входят в переносимый вес."],
 ["rhwystr-graig","Ристр Грейг",15,20,"Пока не уничтожена","none","Создаёт каменную стену 2×3 м с прочностью 30 в пределах 20 м (errata)."],
 ["stammelford-tremor","Землетрясение Стаммельфорда",12,30,"r1d10","dodge","Разрушает поверхность в зоне 10 м: −2 РЕА и −3 СКОР. Небольшие строения рушатся с вероятностью 10%. Каждый раунд требуется Атлетика, чтобы не провалиться в землю; провалившиеся задыхаются до успешного выхода. После окончания земля остаётся повреждённой." ]
]);
add("journeyman","air",106,[
 ["alzur-thunder","Гром Альзура",15,25,"i","dodge","Молния наносит 8d6 урона с вероятностью горения 75%. Проходит через цели по прямой; после каждой цели урон следующей уменьшается на 1d6.","8d6"],
 ["gwynt-troelli","Гвинт Троэлли",12,"r10","s4","none","Ветровой барьер отражает дистанционные атаки, не превысившие результат сотворения. Снаряд отлетает на 8 м в случайном направлении."],
 ["suffocate","Удушение",14,10,"s4","resistMagic","Наносит цели 1d10 урона за ход; цель ошеломлена. Эффект прекращается, если заклинателя ранят оружием или он теряет концентрацию.","1d10"]
]);
add("journeyman","fire",106,[
 ["demetia-crest","Вспышка Деметии Крест",12,10,"s4","none","Сфера чистой магии поглощает урон, равный удвоенному уровню Сотворения заклинаний. Попавшие снаряды уничтожаются; живые существа проходят свободно."],
 ["flaming-vortex","Пылающий вихрь",15,"r10","s4","dodge","Огненный торнадо шириной 2 м перемещается за ход на число метров, равное уровню Сотворения. При касании цели нужна встречная проверка против Уклонения. Попадание: 5d6 урона, горение 50%. Вихрь не выходит за дистанцию.","5d6"],
 ["seirff-haul","Сейриф Хайль",10,10,"r2d10","dodge","Огненные змеи захватывают цель, и она горит до успешного Уклонения против сотворения. Каждый раунд неудачи увеличивает СЛ следующего выхода на 1." ]
]);
add("journeyman","water",106,[
 ["anialwch","Аньяльх",8,10,"i","resistMagic","Высушивает цель: 4d6 урона, игнорирующего броню и щиты, и уменьшение текущей Выносливости на отдельные 4d6.","4d6"],
 ["merigold-hailstorm","Градобитие Меригольд",15,"r30","s4","dodge","Каждый раунд все в зоне проходят Уклонение против сотворения либо получают 2d6 урона по каждой части тела.","2d6"],
 ["waves-naglfar","Волны Нагльфара",10,"r3","i","dodge,block","Ледяная волна наносит не защитившимся 4d6 урона и замораживает их.","4d6"]
]);
add("master","mixed",107,[
 ["mental-command","Мысленный приказ",25,10,"До выполнения приказа","resistMagic","Внушает точный приказ. Приказ, противоречащий природе цели, даёт ей +5 к защите. Цель может повторять Сопротивление магии каждые 1d6 раундов, чтобы освободиться."],
 ["magical-portal","Магический портал",22,"unlimited","s6","none","Открывает в пределах 10 м портал 1×2 м в знакомое место. Всё подходящее по размеру проходит сквозь него. Закрытие на проходящем объекте разрезает его: для существа — критическая потеря конечности. Незнакомое место доступно по правилам телепортации вслепую." ]
]);
add("master","earth",107,[
 ["polymorphism","Полиморфизм",22,"self","До повторного сотворения","none","Превращает в змею, кошку, птицу или собаку с физическими параметрами этого животного; вещи меняются вместе с телом. Для возвращения нужно снова сотворить заклинание. Двимерит в животной форме лишает возможности вернуться."],
 ["transmutation","Трансмутация",25,2,"p","none","Изменяет свойства минералов и металлов: один металл в другой, необработанный самоцвет — в обработанный для магии. Не создаёт и не изменяет двимерит и соприкасающиеся с ним металлы." ]
]);
add("master","air",107,[
 ["dervish","Дервиш",22,"r2","s6","dodge","Торнадо отражает дистанционные атаки как Гвинт Троэлли и действует на окружающих как Зефир. Заклинатель может двигаться и атаковать. Если он сам приближается к цели ближе 2 м, Зефир на неё не действует."],
 ["storm","Гроза",25,"r20","s6","dodge","Каждый раунд любой в зоне, кроме заклинателя, с вероятностью 35% становится целью молнии. При провале Уклонения — 8d6 урона в торс и вероятность горения 75%.","8d6"]
]);
add("master","fire",108,[
 ["melgar-fire","Огонь Мельгара",25,"r40","r2d6","dodge,block","Каждый в зоне, кроме заклинателя, с вероятностью 75% становится целью огненного шара. Защита против результата сотворения; попадание наносит 4d6 урона в случайную часть тела и с вероятностью 75% поджигает.","4d6"],
 ["mirror-effect","Зеркальный эффект",25,20,"r2d6","dodge,block","Луч наносит 10d6 урона. Его можно блокировать, но блокирующий предмет также получает урон; ветер не отражает луч. Зеркальная поверхность отражает его в случайном направлении, сама получая урон. Заклинание обычно не действует в помещении; при сильном снегопаде или пасмурной погоде урон вдвое меньше.","10d6"]
]);
add("master","water",108,[
 ["part-water","Расступление вод",25,"r10","s6","none","Создаёт свободное от воды пространство до 10×100×10 м. Водные существа покидают зону, проход сквозь водяные стены не пропускает воду внутрь. Пространство можно ориентировать вертикально; подводное сотворение открывает путь вместе с заклинателем."],
 ["tryferi-gaeaf","Трифери Геаф",22,20,"r1d10","dodge,block","Создаёт число двухметровых шипов, равное половине уровня Сотворения. Каждый атакует отдельно: 5d6 урона с пробиванием брони. Только причинивший урон шип замораживает цель и наносит 2 урона за раунд до Силы СЛ 20, 20 урона по шипу или конца заклинания.","5d6"]
]);

function magicEntry(row,documentId) {
  const rangeKind=typeof row.range==="number"?"distance":["self","unlimited","special"].includes(row.range)?row.range:row.range.startsWith("selfOr")?"selfOrDistance":row.range[0]==="r"?"radius":"cone";
  const durationPrefix=row.duration[0];
  const durationKind=({i:"instant",r:"rounds",h:"hours",d:"days",s:"sustained",p:"permanent"})[durationPrefix]??"special";
  return {id:row.id,documentId,name:row.name,
    system:{ruleId:row.id,...(row.kind?{kind:row.kind}:{}),...(row.ritual?{ritual:row.ritual}:{}),...(row.hex?{hex:row.hex}:{}),tradition:row.tradition??"mage",deity:row.deity??"",costStep:row.costStep??1,costMax:row.costMax??0,costHint:row.costHint??"",description:`<p>${row.description}</p>`,grade:row.grade,element:row.element,
      cost:row.cost,variableCost:row.variableCost??row.id==="spell.dispel",range:{kind:rangeKind,value:typeof row.range==="number"?row.range:Number(String(row.range).replace(/^[a-z]+/i,""))||0},
      duration:{kind:durationKind,formula:["rounds","hours","days"].includes(durationKind)?row.duration.slice(1):"",maintenance:durationKind==="sustained"?Number(row.duration.slice(1)):0,...(row.maintenanceMode?{maintenanceMode:row.maintenanceMode}:{}),text:durationKind==="special"?row.duration:""},
      defense:row.defense.split(","),target:[...(SPELL_TARGET_BY_ID[row.id]??[])],damage:row.damage??"",source:"Базовая книга",page:row.page}};
}
export const CORE_SPELLS=rows.map((row,index)=>magicEntry(row,`spel${String(index+1).padStart(12,"0")}`));
export const CORE_INVOCATIONS=INVOCATION_ROWS.map((row,index)=>magicEntry(row,`invo${String(index+1).padStart(12,"0")}`));
export const CORE_SIGNS=SIGN_ROWS.map((row,index)=>magicEntry(row,`sign${String(index+1).padStart(12,"0")}`));
export const CORE_RITUALS=RITUAL_ROWS.map((row,index)=>magicEntry(row,`ritu${String(index+1).padStart(12,"0")}`));
export const CORE_HEXES=HEX_ROWS.map((row,index)=>magicEntry(row,`hexx${String(index+1).padStart(12,"0")}`));
export const CORE_MAGIC=[...CORE_SPELLS,...CORE_INVOCATIONS,...CORE_SIGNS,...CORE_RITUALS,...CORE_HEXES];
export const spellFolderId=(grade,tradition="mage")=>tradition==="mage"?`spell${grade.padEnd(11,"0")}`:`inv${tradition.slice(0,3)}${grade.padEnd(10,"0")}`;
const kindFolder=(kind,grade="")=>`mag${kind.slice(0,3)}${grade}`.padEnd(16,"0");
export const spellSources=()=>CORE_MAGIC.map(entry=>({_id:entry.documentId,name:entry.name,type:"spell",img:"icons/svg/book.svg",system:structuredClone(entry.system),effects:[],folder:entry.system.kind?kindFolder(entry.system.kind,entry.system.kind==="hex"?"":entry.system.grade):spellFolderId(entry.system.grade,entry.system.tradition),ownership:{default:2},sort:0,flags:{}}));
export const spellFolders=()=>{
  const folder=(_id,name,parent=null)=>({_id,name,type:"Item",folder:parent,sorting:"a",sort:0,color:"#805c89",flags:{}});
  const folders=["novice","journeyman","master"].map(grade=>folder(spellFolderId(grade),SPELL_GRADES[grade]));
  for(const tradition of ["druid","priest"]) {
    const parent=`inv${tradition.padEnd(13,"0")}`;
    folders.push(folder(parent,tradition==="druid"?"Инвокации друида":"Инвокации жреца"));
    for(const grade of new Set(CORE_INVOCATIONS.filter(s=>s.system.tradition===tradition).map(s=>s.system.grade)))folders.push(folder(spellFolderId(grade,tradition),SPELL_GRADES[grade],parent));
  }
  for(const kind of ["sign","ritual","hex"]) {
    const parent=kindFolder(kind);folders.push(folder(parent,MAGIC_CATEGORIES[kind]));
    if(kind!=="hex")for(const grade of new Set(CORE_MAGIC.filter(s=>s.system.kind===kind).map(s=>s.system.grade)))folders.push(folder(kindFolder(kind,grade),SPELL_GRADES[grade],parent));
  }
  return folders;
};
export function spellRange({kind,value}) {return kind==="special"?"По описанию":kind==="self"?"На себя":kind==="unlimited"?"Неограниченная":`${kind==="selfOrDistance"?"На себя / ":kind==="radius"?"Радиус ":kind==="cone"?"Конус ":""}${value} м`;}
export function spellDuration({kind,formula,maintenance,text,maintenanceMode}) {
  if(kind==="sustained")return `Поддержание · ${maintenanceMode==="fullCost"?"исходная стоимость":maintenanceMode==="halfCost"?"½ исходной стоимости":`${maintenance} ВЫН`}/раунд`;
  if(["rounds","hours","days"].includes(kind)) {
    const plural=/^\d+$/.test(formula)?new Intl.PluralRules("ru").select(Number(formula)):"many";
    const words={rounds:{one:"раунд",few:"раунда",many:"раундов"},hours:{one:"час",few:"часа",many:"часов"},days:{one:"день",few:"дня",many:"дней"}};
    return `${formula} ${words[kind][plural]??words[kind].many}`;
  }
  return kind==="special"?text:SPELL_DURATION_KINDS[kind];
}
