import { SYSTEM_ID } from "../config.mjs";
import { equipmentUuid } from "./workshop.mjs";
import { materialUuid } from "./workshop-materials.mjs";
import { weaponRecord } from "./equipment-records.mjs";

/** «Развлечения в таверне» (Elsewhere & Beyond): cheating tools for the tavern games. */
export const TAVERN_SOURCE = "Развлечения в таверне";
export const TAVERN_FOLDER = { id: "gearTavern000001", name: TAVERN_SOURCE };
export const HIDDEN_WEIGHT_DC = 18;
const id = n => `tvrnItem${String(n).padStart(8, "0")}`;
export const DEVILS_MUSK = { id: "alchemy.devils-musk", documentId: id(1), type: "equipment", name: "Дьявольский мускус", source: "tavern", flags: { [SYSTEM_ID]: { priceUnavailable: true } },
  system: { source: TAVERN_SOURCE, kind: "alchemy", weight: .3, rarity: "rare", alchemy: { category: "substance" }, properties: "+3 к Силе на 5 минут; затем тошнота",
    description: "<p>Печально известный анаболический состав. Одна доза на 5 минут увеличивает Силу на +3, но по окончании действия вызывает тошноту. Закончить состязание лучше раньше, чем побочные эффекты станут заметны проницательным глазам.</p><p>Используйте дозу из инвентаря: эффект и последующая тошнота применяются автоматически.</p>" } };
const weight = weaponRecord(id(2), ["hidden-weight", "Скрытый вес", "brawling", "Д", 0, "c", "1d6", 5, 1, 0, 0, "small", 0, .5, 120, `Незаметное (Внимание СЛ ${HIDDEN_WEIGHT_DC}); Рукопашное: прибавляется к урону без оружия`], TAVERN_SOURCE);
export const HIDDEN_WEIGHT = { ...weight, source: "tavern", system: { ...weight.system,
  description: `<p>Груз, зажатый в ладони, добавляет удару вес и поддерживает костяшки пальцев. Запрещён в кулачном бою — заметить его можно проверкой Внимания СЛ ${HIDDEN_WEIGHT_DC}.</p><p>В «Кулачном бое» таверны каждый соперник один раз скрыто проверяет Внимание против экипированного груза.</p>` } };
export const TAVERN_EQUIPMENT = [DEVILS_MUSK, HIDDEN_WEIGHT];
export const TAVERN_RECIPES = [
  { id: "formula.devils-musk", documentId: `tvrnRecp${"1".padStart(8, "0")}`, type: "recipe", name: "Формула: Дьявольский мускус", source: "tavern", flags: { [SYSTEM_ID]: { priceUnavailable: true } },
    system: { source: TAVERN_SOURCE, price: 0, recipe: { category: "formula", grade: "journeyman", dc: 15, time: 3600, quantity: 1, tools: ["gear.alchemy-tools"], resultUuid: equipmentUuid(DEVILS_MUSK.documentId),
      components: [{ substance: "rebis", quantity: 3, uuid: "" }, { substance: "sol", quantity: 1, uuid: "" }] } } },
  { id: "diagram.weapon.hidden-weight", documentId: `tvrnRecp${"2".padStart(8, "0")}`, type: "recipe", name: "Чертёж: Скрытый вес", source: "tavern",
    system: { source: TAVERN_SOURCE, price: 120, recipe: { category: "diagram", grade: "novice", dc: 13, time: 45 * 60, investment: 60, quantity: 1, tools: ["gear.crafting-tools"], forge: true,
      resultUuid: equipmentUuid(HIDDEN_WEIGHT.documentId), components: ["steel", "linen", "thread"].map(material => ({ uuid: materialUuid(material), quantity: 1, substance: "" })) } } }
];
