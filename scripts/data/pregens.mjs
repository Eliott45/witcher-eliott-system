import { SYSTEM_ID } from "../config.mjs";

/** Embed canonical catalogue records, retaining their IDs and import provenance. */
export function pregenSources(packs) {
  const take = (pack, ruleId, system = {}, name) => {
    const source = packs[pack].find(item => item.system.ruleId === ruleId);
    if (!source) throw new Error(`Missing pregen reference: ${pack}/${ruleId}`);
    const item = structuredClone(source);
    delete item.folder;
    delete item.ownership;
    item.system = { ...item.system, ...system };
    if (name) item.name = name;
    item.flags = { ...item.flags, core: { ...item.flags?.core, sourceId: `Compendium.${SYSTEM_ID}.${pack}.Item.${item._id}` } };
    return item;
  };
  const gear = (id, quantity = 1, overrides = {}, name) => take("equipment", id, { quantity, equipped: false, ...overrides }, name);
  const horse = gear("transport.horse", 1, {}, "Плотва — осёдланная лошадь");
  const ranks = { training: 10, meditation: 10, source: 10, heliotrope: 6, "iron-stomach": 8,
    frenzy: 8, transmutation: 6, deflect: 10, "quick-strike": 8, whirl: 8 };
  const signs = ["yrden", "quen", "aard", "igni", "axii", "magic-trap", "active-shield", "aard-sweep", "firestream", "puppet"];
  const name = "Геральт из Ривии";
  return [{ _id: "pregenGeralt0001", name, type: "character", img: "icons/svg/mystery-man.svg", ownership: { default: 2 },
    prototypeToken: { name, actorLink: true, disposition: 1, texture: { src: "icons/svg/mystery-man.svg" },
      sight: { enabled: true, angle: 180 }, bar1: { attribute: "health" }, bar2: { attribute: "stamina" } },
    flags: { [SYSTEM_ID]: { pregen: { id: "geralt-of-rivia", source: "Базовая книга, стр. 12", revision: 1 } } },
    system: {
      details: { race: "witcher", profession: "witcher", gender: "Мужской" },
      // Printed values already include racial modifiers: REF +1, DEX +1, EMP −4.
      attributes: { intelligence: 6, reflex: 13, dexterity: 9, body: 8, speed: 9, empathy: 7, craft: 5, will: 8, luck: 3 },
      health: { value: 55, max: 55 }, stamina: { value: 40, max: 40 }, vigor: 7,
      skills: { awareness: 8, riding: 4, spellCasting: 8, alchemy: 5, brawling: 6, dodgeEscape: 10,
        wildernessSurvival: 9, swordsmanship: 11, athletics: 10, smallBlades: 9, melee: 7, deduction: 8,
        crossbow: 6, stealth: 8, intimidation: 9, physique: 6, resistCoercion: 8, resistMagic: 6, endurance: 10 },
      languages: [{ id: "language.common", name: "Всеобщий", level: 8 }],
      lifepath: { witcher: { school: "wolf", notes: "Ведьмак школы Волка, воспитанный в Каэр Морхене. Отдельные броски тренировок и десятилетий на стр. 12 не заданы и оставлены незаполненными." } },
      biography: {
        appearance: "Белые волосы, ведьмачьи глаза, шрамы. За спиной стальной и серебряный мечи; на шее медальон школы Волка.",
        backstory: "Геральт из Ривии, Белый Волк — знаменитый ведьмак и охотник на чудовищ. Участник событий в Вызиме и Лок Муинне. В момент, описанный базовой книгой, путешествует по Северу в поисках Йеннифэр и Цири.",
        allies: "Йеннифэр из Венгерберга; Цири; ведьмаки Каэр Морхена.",
        sessionNotes: "Преген из базовой книги, стр. 12. Максимум ПЗ 55 = 40 от ТЕЛ/ВОЛИ + 15 от надетых доспехов Ворона. Предел магии 7 записан по блоку персонажа (Магический источник 10). Возраст, кроны, опыт и репутация в блоке не указаны. Всеобщий 8 — родной язык по общему правилу стр. 49. Портрет можно заменить в листе." },
      notes: "Источник: базовая книга, стр. 12. Снаряжение: стр. 247–248, 254–255, 258, 263–264; официальная errata R. Talsorian v4."
    },
    items: [
      ...Object.entries(ranks).map(([id, level]) => take("abilities", `profession.witcher.${id}`, { level })),
      ...signs.map(id => take("spells", `sign.${id}`)),
      gear("weapon.wolf", 1, { equipped: true, grip: 2 }), gear("weapon.moon-blade"), gear("weapon.short-dagger"),
      gear("armor.raven", 1, { equipped: true }), gear("weapon.throwing-knife", 5), gear("weapon.hand-crossbow"),
      gear("ammunition.standard", 20, {}, "Арбалетные болты"), gear("ammunition.explosive", 5, {}, "Взрывные арбалетные болты"),
      gear("gear.belt-pouch"), gear("bomb.grapeshot", 3), gear("bomb.samum", 3), gear("potion.thunderbolt", 3),
      gear("potion.swallow", 3), gear("decoction.wyvern"), gear("decoction.katakan"), gear("oil.humanoid"),
      gear("gear.alchemy-tools"), horse, gear("tack.saddle", 1, { containerId: horse._id, equipped: true }),
      gear("gear.bandolier"), gear("gear.witcher-medallion", 1, { equipped: true })
    ], effects: []
  }];
}
