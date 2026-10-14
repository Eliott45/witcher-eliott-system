import { weaponRecord } from "./equipment-records.mjs";
import { equipmentUuid } from "./workshop.mjs";
import { materialUuid } from "./workshop-materials.mjs";

export const MANTICORE_SOURCE = "Школа Мантикоры";
export const MANTICORE_FOLDER = { id: "gearManticore001", name: MANTICORE_SOURCE };
export const MANTICORE_TRAINING = "Мастер щита: выхватывание и убирание щита не требуют действия. Парирование щитом без штрафа. Руку со щитом можно использовать для знаков, бросков бомб и питья эликсиров.";

// Follow the supplied Russian supplement's rarity (У). The original English PDF prints R.
// The supplement omits shield class; medium is the user's chosen ruling for shield strikes.
const shield = weaponRecord("mantShield000001", ["manticore-shield", "Щит школы Мантикоры", "melee", "Д", 0, "u", "0", 20, 1, 0, 0, "none", 1, 2, 0,
  "Метеоритное; Серебряное (3d6)", "shield", 0], MANTICORE_SOURCE);
export const MANTICORE_EQUIPMENT = [{ ...shield, source: "manticore", flags: { "witcher-eliott-system": { priceUnavailable: true } },
  system: { ...shield.system, shieldClass: "medium", description: `<p>Щит ведьмаков школы Мантикоры, покрытый метеоритной сталью и инкрустированный серебром. Предназначен для защиты и ударов по чудовищам.</p><p>Надёжность 20, один слот усиления, скованность 0, вес 2 кг. Дополнительный серебряный урон 3d6 применяется против восприимчивых к серебру существ.</p><p>${MANTICORE_TRAINING}</p>` } }];

export const MANTICORE_RECIPES = [{ id: "diagram.weapon.manticore-shield", documentId: "mantDiagram00001", name: "Чертёж: Щит школы Мантикоры", type: "recipe", source: "manticore",
  system: { source: MANTICORE_SOURCE, price: 1304, recipe: { category: "diagram", grade: "master", dc: 20, time: 8 * 3600, investment: 652, quantity: 1,
    forge: true, tools: ["gear.crafting-tools"], resultUuid: equipmentUuid(shield.documentId),
    components: [["hardened-leather", 2], ["hardened-timber", 4], ["meteorite", 3], ["silver", 2], ["etching-acid", 4], ["ester-grease", 2], ["river-clay", 6]]
      .map(([id, quantity]) => ({ uuid: materialUuid(id), substance: "", quantity })) } } }];
