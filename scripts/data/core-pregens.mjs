import { SYSTEM_ID, VISION_ANGLE } from "../config.mjs";
import { ATTRIBUTE_KEYS } from "./statistics.mjs";
import { backgroundModifiers, modifierTotal } from "./background-modifiers.mjs";

const common = { id: "language.common", name: "Всеобщий", level: 8 };
const elder = { id: "language.elder", name: "Старшая Речь", level: 8 };
const dwarven = { id: "language.dwarven", name: "Краснолюдский", level: 8 };
const witcherSigns = ["yrden", "quen", "aard", "igni", "axii", "magic-trap", "active-shield", "aard-sweep", "firestream", "puppet"].map(id => `sign.${id}`);

/** Printed ranks include unconditional racial bonuses; the actor derives those bonuses again. */
function baseValues(printed, modifiers, prefix) {
  return Object.fromEntries(Object.entries(printed).map(([key, value]) => [key, value - modifierTotal(modifiers, `${prefix}.${key}`)]));
}

/** The seven character profiles on core pp.13–19. Missing catalogue entries stay explicit, never substituted. */
export function additionalPregenSources({ take, gear }) {
  const abilityRanks = (profession, ranks) => Object.entries(ranks).map(([id, level]) => take("abilities", `profession.${profession}.${id}`, { level }));
  const worn = id => gear(id, 1, { equipped: true });
  const held = (id, grip = 1) => gear(id, 1, { equipped: true, grip });
  const named = (id, name, quantity = 1) => gear(id, quantity, {}, name);
  const mount = ({ cart = false, bags = false } = {}) => {
    const horse = named("transport.horse", "Осёдланная лошадь");
    const items = [horse, gear("tack.saddle", 1, { containerId: horse._id, equipped: true })];
    if (bags) items.push(gear("tack.saddlebags", 1, { containerId: horse._id, equipped: true }));
    if (cart) {
      const wagon = gear("transport.cart");
      wagon.system.transport.mountId = horse._id;
      items.push(wagon);
    }
    return items;
  };
  const notebook = named("gear.ledger", "Записная книжка с зашифрованными именами любовниц");
  // A second journal is a separate embedded Item, but still refers to the same catalogue record.
  notebook._id = "pregenDandNote01";
  notebook.system.description = "<p>Личная записная книжка. Имена записаны шифром.</p>";
  const lute = named("musical-instrument", "Лютня");
  lute.system.description = "<p>Струнный музыкальный инструмент для сольного исполнения и сопровождения песен.</p>";
  const flute = named("musical-instrument", "Флейта");
  flute.system.description = "<p>Духовой музыкальный инструмент, удобный для игры в дороге.</p>";
  const ritualBag = [{ name: "Сумка с ингредиентами для ритуалов", quantity: 1 }];
  const profiles = [
    {
      documentId: "pregenYennefer01", id: "yennefer-of-vengerberg", name: "Йеннифэр из Венгерберга", page: 13,
      race: "human", profession: "mage", gender: "Женский", attributes: [10, 8, 6, 7, 5, 6, 8, 10, 7], health: 40, stamina: 40, vigor: 25,
      skills: { humanPerception: 10, spellCasting: 10, hexWeaving: 10, ritualCrafting: 10, persuasion: 7,
        charisma: 5, riding: 7, courage: 10, socialEtiquette: 8, seduction: 10, groomingStyle: 8, staffSpear: 4,
        resistMagic: 10, resistCoercion: 10, education: 9, awareness: 6, endurance: 5, dodgeEscape: 8, stealth: 8 },
      ranks: { "magic-training": 10, scheming: 10, gossip: 8, "political-connections": 9, "reverse-engineer": 6,
        distillation: 7, mutation: 8, "in-touch": 10, dimeritium: 8, overdraw: 8 },
      magic: ["spell.dispel", "spell.glamour", "spell.teleportation", "spell.telepathy", "spell.alzur-thunder", "spell.stammelford-tremor",
        "spell.magical-portal", "spell.mental-command", "hex.eternal-itch", "ritual.magic-barrier", "ritual.telecommunication"],
      items: [held("weapon.crystal-staff", 2), gear("weapon.stiletto"), worn("armor.halfling-doublet"), worn("armor.legs.3"),
        worn("gear.gem-amulet"), gear("material.fifth-essence", 10), gear("material.infused-dust", 6), gear("gear.chalk", 8),
        gear("gear.makeup-kit"), gear("gear.alchemy-tools"), gear("alchemy.perfume"), gear("alchemy.sterilizing", 5), gear("alchemy.numbing", 5),
        ...mount(), gear("gear.writing-kit"), gear("gear.mirror"), named("gear.perfume", "Духи"), named("gear.ledger", "Дневник"), gear("shoulder-bag")],
      missing: ritualBag,
      appearance: "Темноволосая чародейка в чёрно-белой одежде, с фиолетовыми глазами.",
      backstory: "Могущественная чародейка, обучавшаяся у Тиссаи де Врие. Её судьба тесно связана с Геральтом и Цири. После возвращения с острова туманов находится в Нильфгаарде и действует рядом с императорским двором."
    },
    {
      documentId: "pregenDandelion1", id: "dandelion", name: "Лютик", page: 14,
      race: "human", profession: "bard", gender: "Мужской", attributes: [7, 4, 7, 4, 6, 10, 4, 8, 10], health: 30, stamina: 30, vigor: 0,
      skills: { charisma: 10, deceit: 9, performance: 10, humanPerception: 9, persuasion: 8, streetwise: 9,
        fineArts: 10, seduction: 10, socialEtiquette: 7, dodgeEscape: 7, groomingStyle: 8, gambling: 6, stealth: 5,
        education: 7, business: 4, pickLock: 5, deduction: 5 },
      languages: [common, elder, dwarven],
      ranks: { busking: 10, "return-act": 9, captivate: 8, "good-friend": 8, fade: 6, rumor: 7, "fit-in": 6, sharpen: 9, needling: 8, "et-tu": 7 },
      items: [held("weapon.short-dagger"), worn("armor.halfling-doublet"), worn("armor.legs.3"), lute, notebook,
        named("gear.perfume", "Одеколон"), gear("gear.spirits"), gear("gear.fashionable-clothing"), gear("gear.writing-kit"),
        named("gear.ledger", "Дневник"), named("gear.gwent-deck", "Колода для гвинта (Королевства Севера)"), gear("gear.hidden-pocket"),
        gear("gear.belt-pouch"), gear("alchemy.invisible-ink"), gear("gear.makeup-kit"), gear("gear.mirror"),
        gear("gear.loaded-dice"), gear("gear.thieves-tools"), gear("gear.map"), gear("gear.flint")],
      appearance: "Щеголеватый бард с лютней и неизменной любовью к ярким нарядам.",
      backstory: "Поэт, музыкант, выпускник Оксенфуртской академии и давний спутник Геральта. Прославляет их приключения в балладах. В Новиграде намерен вместе с Золтаном превратить унаследованное заведение «Шалфей и розмарин» в кабаре."
    },
    {
      documentId: "pregenZoltan0001", id: "zoltan-chivay", name: "Золтан Хивай", page: 15,
      race: "dwarf", profession: "merchant", gender: "Мужской", attributes: [7, 8, 7, 10, 5, 7, 7, 9, 6], health: 45, stamina: 45, vigor: 0,
      skills: { charisma: 8, smallBlades: 5, education: 6, streetwise: 9, business: 9, persuasion: 8, humanPerception: 7,
        gambling: 7, resistCoercion: 8, swordsmanship: 8, melee: 9, endurance: 10, fineArts: 6, intimidation: 9, brawling: 8, crossbow: 6, physique: 8 },
      languages: [dwarven, elder, { ...common, level: 9 }],
      ranks: { "well-traveled": 10, market: 8, "foul-play": 8, promise: 7, rags: 9, "inside-man": 8, "treasure-map": 6, connections: 9, fence: 6, "warrior-debt": 5 },
      items: [held("weapon.dwarven-axe"), gear("weapon.short-dagger"), gear("weapon.vicovaro"), gear("weapon.crossbow"),
        named("ammunition.standard", "Арбалетные болты", 20), worn("armor.torso.3"), worn("armor.legs.3"),
        named("gear.art-tools", "Инструменты для творчества (ювелир)"), gear("gear.writing-kit"), named("gear.ledger", "Дневник"),
        gear("shoulder-bag"), gear("gear.dice-poker-board"), gear("gear.flint"), ...mount({ cart: true, bags: true }),
        gear("gear.bedroll"), gear("gear.bullseye-lantern"), gear("gear.merchant-tools"), named("gear.gwent-deck", "Колода для гвинта (Королевства Севера)")],
      appearance: "Коренастый рыжебородый краснолюд с боевым топором.",
      backstory: "Краснолюдский воин, путешественник и торговец, друг Геральта и Лютика. Воевал под Бренной, участвовал в событиях в Вызиме и долине Понтара. Сейчас живёт в Новиграде и помогает Лютику с будущим кабаре."
    },
    {
      documentId: "pregenTriss00001", id: "triss-merigold", name: "Трисс Меригольд", page: 16,
      race: "human", profession: "mage", gender: "Женский", attributes: [9, 7, 7, 5, 5, 8, 7, 9, 6], health: 35, stamina: 35, vigor: 21,
      skills: { humanPerception: 7, spellCasting: 10, hexWeaving: 8, ritualCrafting: 9, persuasion: 7, charisma: 8,
        courage: 8, riding: 5, socialEtiquette: 9, seduction: 9, groomingStyle: 9, staffSpear: 5, resistMagic: 10,
        resistCoercion: 7, education: 9, awareness: 8, leadership: 8, dodgeEscape: 8, stealth: 6 },
      ranks: { "magic-training": 10, scheming: 6, gossip: 6, "political-connections": 7, "reverse-engineer": 7,
        distillation: 6, mutation: 4, "in-touch": 8, dimeritium: 7, overdraw: 6 },
      magic: ["spell.dispel", "spell.teleportation", "spell.magical-portal", "spell.diagnostic-spell", "spell.aenye", "spell.merigold-hailstorm",
        "spell.tanio-ilchar", "spell.urien-shelter", "ritual.hydromancy", "ritual.telecommunication", "hex.shadows"],
      items: [held("weapon.crystal-staff", 2), gear("weapon.dagger"), worn("armor.halfling-doublet"), worn("armor.legs.3"),
        gear("material.fifth-essence", 4), gear("material.white-myrtle", 4), gear("material.pearl", 4), gear("material.lunar-shards", 2),
        gear("material.berbercane", 2), worn("gear.gem-amulet"), gear("gear.makeup-kit"), named("gear.perfume", "Духи"),
        gear("gear.alchemy-tools"), gear("shoulder-bag"), gear("alchemy.wives-tears", 2), gear("alchemy.talgar-tears", 2),
        gear("alchemy.pantagran", 2), gear("alchemy.perfume", 2), gear("alchemy.hallucinogen", 2)],
      missing: ritualBag,
      appearance: "Рыжеволосая чародейка с зелёными глазами.",
      backstory: "Бывшая советница короля Фольтеста и участница Ложи Чародеек. Близка с Геральтом и Йеннифэр, известна собственным заклинанием «Градобитие Меригольд». В Новиграде помогает преследуемым магам и ученикам бежать на север."
    },
    {
      documentId: "pregenRoche00001", id: "vernon-roche", name: "Вернон Роше", page: 17,
      race: "human", profession: "man-at-arms", gender: "Мужской", attributes: [7, 9, 8, 8, 6, 4, 5, 9, 4], health: 40, stamina: 40, vigor: 0,
      skills: { brawling: 7, swordsmanship: 8, melee: 9, crossbow: 8, smallBlades: 7, wildernessSurvival: 6,
        courage: 10, physique: 6, intimidation: 9, dodgeEscape: 8, leadership: 8, tactics: 9, awareness: 8,
        resistCoercion: 9, riding: 5, streetwise: 4, athletics: 6, stealth: 6, endurance: 8 },
      ranks: { "tough-as-nails": 10, "extreme-range": 7, "twin-shot": 6, "pin-point": 4, bloodhound: 7,
        "booby-trap": 6, "tactical-awareness": 7, fury: 8, zweihand: 9, shrug: 8 },
      items: [held("weapon.mace"), gear("weapon.short-dagger"), gear("weapon.kord"), gear("weapon.crossbow"),
        named("ammunition.standard", "Арбалетные болты", 20), named("ammunition.broadhead", "Арбалетные болты с широким наконечником", 10),
        named("ammunition.armor-piercing", "Бронебойные арбалетные болты", 10), worn("armor.torso.6"), worn("armor.legs.4"),
        gear("armor-upgrade.steel"), gear("gear.belt-pouch"), gear("alchemy.chloroform", 2), gear("gear.rope"), gear("gear.grapple"),
        gear("gear.flint"), gear("gear.waterskin"), gear("gear.rations"), named("gear.gwent-deck", "Колода для гвинта (Королевства Севера)"),
        gear("gear.stakes"), gear("gear.bedroll")],
      notes: "Стальное усиление брони лежит в инвентаре: на стр. 17 не указано, на какие части брони оно установлено. Колышки (×5) перенесены одним набором из пяти.",
      appearance: "Темерский военный в кожаной куртке и головной повязке.",
      backstory: "Командир «Синих полосок», верный королю Фольтесту и Темерии. Опытный разведчик и боец, участвовал в расследовании убийств королей. После гибели своего отряда продолжает бороться за будущее страны."
    },
    {
      documentId: "pregenIorveth001", id: "iorveth", name: "Иорвет", page: 18,
      race: "elf", profession: "man-at-arms", gender: "Мужской", attributes: [7, 9, 10, 7, 8, 4, 5, 8, 4], health: 35, stamina: 35, vigor: 0,
      skills: { brawling: 7, swordsmanship: 8, melee: 8, archery: 9, smallBlades: 7, wildernessSurvival: 8,
        courage: 10, physique: 4, intimidation: 9, dodgeEscape: 9, leadership: 6, tactics: 6, awareness: 9,
        resistCoercion: 8, performance: 5, riding: 6, athletics: 7, stealth: 8, endurance: 7 },
      languages: [elder],
      ranks: { "tough-as-nails": 10, "extreme-range": 8, "twin-shot": 9, "pin-point": 8, bloodhound: 7,
        "booby-trap": 6, "tactical-awareness": 4, fury: 7, zweihand: 6, shrug: 6 },
      items: [held("weapon.elven-zefar", 2), named("ammunition.standard", "Стрелы", 20),
        named("ammunition.elven-burrowing", "Эльфские ввинчивающиеся стрелы", 20), gear("weapon.vrihedd-blade"), gear("weapon.dagger"),
        worn("armor.scoiatael-armor"), flute, gear("gear.rope"), gear("gear.grapple"), gear("gear.belt-pouch"), gear("gear.flint"),
        gear("gear.waterskin"), gear("gear.rations"), gear("gear.stakes"), gear("gear.cooking-tools"), gear("gear.surgical-tools"),
        gear("shoulder-bag"), gear("gear.bow-case"), gear("alchemy.sterilizing", 5), gear("alchemy.numbing", 5)],
      notes: "Колышки (×5) перенесены одним набором из пяти. Бонус Скрытности брони скоя’таэля действует только в дикой природе.",
      appearance: "Эльф с повязкой на повреждённом глазу, вооружённый длинным луком.",
      backstory: "Командир отряда скоя’таэлей в долине Понтара. Бывший боец бригады «Врихедд», переживший предательство Нильфгаарда. Продолжает вооружённую борьбу за Старший Народ, прекрасно знает тактику людей и имперской армии."
    },
    {
      documentId: "pregenLetho00001", id: "letho-of-gulet", name: "Лето из Гулеты", page: 19,
      race: "witcher", profession: "witcher", gender: "Мужской", attributes: [7, 12, 10, 12, 8, 2, 5, 8, 5], health: 50, stamina: 50, vigor: 7,
      skills: { awareness: 9, deduction: 5, spellCasting: 6, alchemy: 6, brawling: 6, dodgeEscape: 10, wildernessSurvival: 8,
        swordsmanship: 11, athletics: 9, smallBlades: 10, firstAid: 5, humanPerception: 8, disguise: 6, stealth: 9,
        intimidation: 9, physique: 10, resistCoercion: 9, resistMagic: 6, endurance: 10 },
      ranks: { training: 10, meditation: 10, source: 10, heliotrope: 5, "iron-stomach": 6,
        frenzy: 7, transmutation: 7, deflect: 10, "quick-strike": 9, whirl: 6 },
      school: "viper", magic: witcherSigns,
      items: [held("weapon.dwarven-cleaver"), gear("weapon.short-dagger"), gear("weapon.torrwr"), worn("gear.witcher-medallion"),
        gear("potion.blizzard"), gear("potion.golden-oriole"), gear("potion.swallow"), gear("decoction.werewolf"),
        gear("decoction.grave-hag"), gear("decoction.arachas"), gear("weapon.throwing-knife", 4), worn("armor.torso.4"), worn("armor.legs.4"),
        gear("gear.alchemy-tools"), gear("alchemy.black-venom", 3), gear("alchemy.chloroform", 3), gear("gear.bandolier"), ...mount()],
      missing: [{ name: "Бомба «Северный ветер»", quantity: 3 }, { name: "Бомба «Чёртов гриб»", quantity: 3 }],
      appearance: "Очень крупный, мускулистый и бритоголовый ведьмак школы Змеи.",
      backstory: "Ведьмак школы Змеи, известный как Убийца Королей. Работал на Нильфгаард в надежде восстановить свою школу; стоял за убийствами Демавенда и Фольтеста. После событий в Лок Муинне его судьба остаётся неясной."
    }
  ];
  return profiles.map(profile => {
    const details = { race: profile.race, profession: profile.profession, gender: profile.gender };
    const modifiers = backgroundModifiers(details), missing = profile.missing ?? [];
    const notes = ["Возраст, кроны, опыт и репутация в блоке не указаны. Родной язык добавлен на уровне 8 по общему правилу; явно указанные в блоке языки сохранены.",
      "Расовые бонусы уже включены в значения книги: в листе они вычисляются из базовых значений. Надетая броня отдельно применяет скованность.", profile.notes,
      missing.length ? `В каталоге пока отсутствуют и не добавлены в инвентарь: ${missing.map(item => `${item.name} ×${item.quantity}`).join("; ")}.` : ""].filter(Boolean).join("\n\n");
    return { _id: profile.documentId, name: profile.name, type: "character", img: "icons/svg/mystery-man.svg", sort: profile.page * 100000, ownership: { default: 2 },
      prototypeToken: { name: profile.name, actorLink: true, disposition: 1, texture: { src: "icons/svg/mystery-man.svg" },
        sight: { enabled: true, angle: VISION_ANGLE }, bar1: { attribute: "health" }, bar2: { attribute: "stamina" } },
      flags: { [SYSTEM_ID]: { pregen: { id: profile.id, source: `Базовая книга, стр. ${profile.page}`, revision: 1, missing: structuredClone(missing) } } },
      system: { details, attributes: baseValues(Object.fromEntries(ATTRIBUTE_KEYS.map((key, index) => [key, profile.attributes[index]])), modifiers, "attributes"),
        health: { value: profile.health, max: profile.health }, stamina: { value: profile.stamina, max: profile.stamina }, vigor: profile.vigor,
        skills: baseValues(profile.skills, modifiers, "skills"), languages: structuredClone(profile.languages ?? [common]),
        ...(profile.school ? { lifepath: { witcher: { school: profile.school } } } : {}),
        biography: { appearance: profile.appearance, backstory: profile.backstory, sessionNotes: notes }, notes: `Базовая книга, стр. ${profile.page}.` },
      items: [...abilityRanks(profile.profession, profile.ranks), ...(profile.magic ?? []).map(id => take("spells", id)), ...profile.items], effects: [] };
  });
}
