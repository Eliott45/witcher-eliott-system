import { equipmentUuid, MONSTER_CATEGORIES } from "./workshop.mjs";
// Amounts in formula strings are one unit of the named substance per letter.
export const SUBSTANCE_CODES = { V:"vitriol", R:"rebis", A:"aether", Q:"quebrith", H:"hydragenum", M:"vermilion", S:"sol", C:"caelum", F:"fulgur" };
const ordinary = [
 ["adda","Могила Адды",13,15,27,"AAHM",.1,18,"common","Консервирует пищу или тело на 1d10 дней. Для тела человека нужны 2 порции."],
 ["alkali","Щелочной порошок",12,15,27,"MQ",.1,18,"common","Нейтрализует одну порцию кислоты; отменяет урон от критического ранения живота."],
 ["clotting","Кровоостанавливающий порошок",12,15,30,"AR",.1,20,"common","Останавливает кровотечение на 2d10 раундов."],
 ["hallucinogen","Галлюциноген",12,15,47,"VR",.1,25,"common","Стойкость СЛ 15, иначе галлюцинации на 1d10 раундов."],
 ["invisible-ink","Невидимые чернила",11,15,22,"QA",.1,15,"common","Написанное проявляется после нагревания в течение хода."],
 ["numbing","Обезболивающие травы",12,15,18,"QM",.1,12,"everywhere","На 2d10 раундов снижают на 2 штрафы от боли критических ранений и состояния при смерти."],
 ["poisoners-friend","Друг отравителя",14,600,24,"MMVC",.1,16,"common","Скрывает вкус и запах яда в еде или питье: СЛ обнаружения 20."],
 ["smelling-salts","Нюхательная соль",14,600,37,"QRCC",.1,25,"common","Выводит из обычного бессознательного состояния или дезориентации. Флакона хватает на 25 применений; истощение требует восстановления STA."],
 ["sterilizing","Обеззараживающая жидкость",12,15,33,"QC",.1,22,"common","Естественное заживление +2; критические ранения заживают на 2 дня быстрее. Не суммируется."],
 ["succubus-breath","Дыхание суккуба",14,600,30,"SAAC",.1,20,"common","Нанесённое на кожу даёт +2 к Соблазнению. Выпитое даёт −5 против Соблазнения. Чёрный шоколад скрывает вкус, обнаружение СЛ 16."],
 ["wives-tears","Слёзы жён",14,600,28,"HAAV",.1,56,"rare","Немедленно прекращает опьянение."],
 ["acid","Кислотный раствор",16,900,84,"AQMVVV",.5,56,"rare","2d6 урона живым целям; 1d6/2 разрушающего урона снаряжению. Атлетика, дальность ТЕЛ×2 м, конус 2 м от точки попадания."],
 ["adhesive","Алхимический клей",15,600,52,"QHCCV",.1,28,"common","Застывает через 2 раунда. Разъединить склеенное: Сила СЛ 16. Бросок Атлетики, дальность ТЕЛ×2 м."],
 ["black-venom","Чёрный яд",15,600,67,"QQAAR",.1,45,"common","Отравляет при попадании в кровь или проглатывании; Стойкость СЛ 16 прекращает эффект. Покрыть клинок: полный раунд, действует 1d10 раундов."],
 ["chloroform","Хлороформ",16,900,54,"QQMMAV",.1,36,"common","Испытание УСТ −2; провал лишает сознания до успешного испытания. 25 применений во флаконе."],
 ["quick-fire","Быстрый огонь",16,900,67,"QRRCVM",.1,45,"rare","Делает поверхность горючей: воспламенение при контакте с огнём, +50% к шансу воспламенения."],
 ["bredans-fury","Ярость Бредана",22,1800,142,"SSSFFFCM",.5,95,"unique","При контакте с воздухом взрывается: 2d6 урона в радиусе 2 м. Бросок Атлетики, дальность ТЕЛ×2 м."],
 ["fisstech","Фисштех",18,1800,120,"RRRHHVVM",.1,80,"rare","Сильное привыкание: Стойкость СЛ 18 после дозы. Стойкость СЛ 16 против дезориентации на полчаса; результат ниже 10 при повторной проверке лишает сознания на 5 раундов."],
 ["pantagran","Эликсир Пантагорана",17,900,100,"MMAACSF",.5,67,"rare","Эйфория на 1d6/2 часа: −2 к Сопротивлению убеждению."],
 ["perfume","Ароматное зелье",18,1800,114,"QQAVVMHH",.5,76,"rare","Стойкость СЛ 16 против опьянения на 1d10 часов. Снять магией или Слезами жён; токсичность 25%."],
 ["talgar-tears","Слёзы Тальгара",20,1800,118,"HHHAAMVV",.1,79,"rare","Замораживает поражённое, двойной разрушающий урон снаряжению. Атлетика, ТЕЛ×2 м, конус 2 м от попадания."],
 ["zerrikanian-fire","Зерриканский огонь",17,900,97,"SSRRRFV",.5,65,"rare","Немедленно поджигает. Атлетика, дальность ТЕЛ×2 м, конус 2 м от попадания."]
];
const potions = [
 ["black-blood","Чёрная кровь",20,"VVVRA",60,25,"Выпивший вашу кровь отравлен (3 урона/раунд, Стойкость СЛ 20) и отталкивается на 2 м."],
 ["blizzard","Пурга",18,"VVRR",30,75,"После убийства +4 РЕА до конца действия; повторные убийства не увеличивают бонус."],
 ["cat","Кошка",16,"AMH",7200,25,"Нет штрафов темноты и слабого света; иммунитет к гипнозу; +2 к раскрытию иллюзий."],
 ["full-moon","Полнолуние",20,"QHHMM",1800,75,"+30 временных ПЗ. Несколько доз не суммируются."],
 ["golden-oriole","Иволга",16,"RMC",1800,50,"Невосприимчивость к ядам; нейтрализует действующие яды."],
 ["killer-whale","Косатка",18,"VVQF",1800,25,"Задержка дыхания в 1,5 раза дольше; нет штрафов зрения под водой."],
 ["maribor","Лес Марибора",18,"RMCS",45,50,"При получении кости адреналина получаете ещё одну."],
 ["petri","Зелье Петри",16,"RAQ",45,75,"+2 к Сотворению заклинаний, Наведению порчи и Проведению ритуалов."],
 ["swallow","Ласточка",16,"VAC",60,50,"Восстанавливает 3 ПЗ/раунд, кроме раунда, в котором по вам попали. Не суммируется."],
 ["tawny-owl","Неясыть",16,"VMQ",60,50,"Действие отдыха восстанавливает на 2 STA больше."],
 ["thunderbolt","Гром",18,"QQHH",45,75,"+3 к урону физическими атаками."],
 ["white-honey","Белый мёд",16,"VRA",0,0,"Снимает эффекты всех эликсиров и обнуляет токсичность."]
];
export const ALCHEMY = ordinary.map(([id,name,dc,time,formulaPrice,substances,weight,price,rarity,properties],i)=>({ id:`alchemy.${id}`,documentId:`alch${String(i+1).padStart(12,"0")}`,type:"equipment",name,source:"alchemy",system:{kind:"alchemy",weight,price,rarity,properties,alchemy:{category:"substance"},source:"Базовая книга, стр. 87–88 / 146–147"},formula:{dc,time,price:formulaPrice,substances,grade:i<11?"novice":i<16?"journeyman":"master"} }));
ALCHEMY.push(...potions.map(([id,name,dc,substances,duration,toxicity,properties],i)=>({id:`potion.${id}`,documentId:`alch${String(i+101).padStart(12,"0")}`,type:"equipment",name:`Эликсир «${name}»`,source:"alchemy",system:{kind:"alchemy",weight:.5,properties,alchemy:{category:"potion",duration,toxicity},source:"Базовая книга, стр. 247 / 249; цена не указана"},formula:{dc,time:1800,substances}})));
const oilFormulae = [[14,"VA"],[16,"MAHV"],[16,"QQHH"],[16,"RHQM"],[16,"CSVQ"],[16,"RSQF"],[14,"HR"],[16,"HSVQ"],[15,"RQC"],[16,"QMFA"],[16,"RHAF"],[16,"ASSF"]];
ALCHEMY.push(...MONSTER_CATEGORIES.map((category,i)=>({id:`oil.${category.id}`,documentId:`alch${String(i+201).padStart(12,"0")}`,type:"equipment",name:category.id==="humanoid"?"Яд повешенного":`Масло: ${category.name}`,source:"alchemy",system:{kind:"alchemy",weight:.5,properties:`+5 урона только против категории «${category.name}». Действует на конкретном оружии 30 минут.`,alchemy:{category:"oil",target:category.id,bonus:5,duration:1800},source:"Базовая книга, стр. 248 / 250; цена не указана"},formula:{dc:oilFormulae[i][0],time:900,substances:oilFormulae[i][1],dogTallow:true}})));
export const MUTAGENS = [
 ["griffin","Грифон","red",18,"meleeDamage",2,"Редкие перья"], ["katakan","Катакан","red",22,"attributes.reflex",1,"Высокий рост"],
 ["nekker","Накер","red",15,"meleeDamage",1,"Облысение и серая кожа"], ["werewolf","Волколак","red",20,"meleeDamage",3,"Шерсть на теле"],
 ["wyvern","Виверна","red",20,"meleeDamage",3,"Грубая кожа"], ["arachas","Главоглаз","green",18,"healthMax",5,"Зелёная кровь и жидкости организма"],
 ["fiend","Бес","green",22,"attributes.body",1,"Небольшие рога"], ["grave-hag","Кладбищенская баба","green",18,"healthMax",5,"Длинный серый язык"],
 ["noonwraith","Полуденница","green",20,"healthMax",10,"Сухая, натянутая кожа"], ["troll","Скальный тролль","green",20,"healthMax",10,"Сутулость"],
 ["golem","Голем","blue",18,"vigor",2,"Твёрдые наросты"], ["siren","Сирена","blue",15,"vigor",1,"Небольшие плавники"]
].map(([id,monster,color,dc,target,value,mutation],i)=>({id:`mutagen.${id}`,documentId:`muta${String(i+1).padStart(12,"0")}`,type:"equipment",name:`Мутаген: ${monster}`,source:"mutagens",system:{kind:"mutagen",weight:.5,properties:`Постоянно: +${value} ${{meleeDamage:"к урону в ближнем бою", "attributes.reflex":"к Реакции", "attributes.body":"к Телосложению", healthMax:"к максимуму ПЗ", vigor:"к пределу магии"}[target]}. Извлечение: Подготовка ведьмака СЛ 16. Подготовка: 1 час, Алхимия СЛ ${dc}.`,mutagen:{monster,color,dc,mutation,bonuses:[{target,value}],prepared:false},source:"Базовая книга, стр. 250–251; цена не указана"}}));
const decoctions = [
 ["arachas",16,"MARV","За каждые 10 свободных единиц переносимого веса +2 ПБ всех зон."], ["fiend",18,"AAVMF","Переносимый вес удваивается."],
 ["grave-hag",16,"AQVC","За каждого убитого в бою врага +2 регенерации ПЗ до конца боя."], ["griffin",16,"QMFA","Каждое получение более 5 урона даёт +2 ПБ всех зон; суммируется."],
 ["katakan",16,"MSFC","+3 к броску определения места критического ранения."], ["nekker",14,"RQH","Скакун не паникует; +3 к Верховой езде и Атлетике."],
 ["noonwraith",18,"SSVQA","Иммунитет к дезориентации, ослеплению и сбиванию с ног."], ["troll",18,"CQQVM","Регенерация 5 ПЗ за раунд."],
 ["werewolf",18,"RSHHF","Длительный бег не расходует Выносливость."], ["wyvern",18,"RRVAF","Успешное попадание даёт +1 к урону следующего удара; суммируется до конца боя или получения урона."]
];
ALCHEMY.push(...decoctions.map(([id,dc,substances,properties],i)=>({id:`decoction.${id}`,documentId:`alch${String(i+301).padStart(12,"0")}`,type:"equipment",name:`Отвар: ${MUTAGENS.find(m=>m.id===`mutagen.${id}`).system.mutagen.monster}`,source:"alchemy",system:{kind:"alchemy",weight:.5,properties,alchemy:{category:"decoction",duration:1800,toxicity:75},source:"Базовая книга, стр. 248 / 250; цена не указана"},formula:{dc,time:1800,substances,mutagenUuid:equipmentUuid(MUTAGENS.find(m=>m.id===`mutagen.${id}`).documentId)}})));
