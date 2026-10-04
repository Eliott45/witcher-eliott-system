import { SYSTEM_ID } from "../config.mjs";

// User-provided core p. 74. Store individual projectiles; the catalog sells standard ammo in tens.
export const AMMUNITION_ICON = "icons/weapons/ammunition/arrow-simple.webp";
export const CORE_AMMUNITION = [
  ["standard", "Стандартные боеприпасы", "К", "everywhere", 0.05, 1, "", "Стандартные боеприпасы продаются пачками по 10 штук за 10 крон (0,5 кг). В инвентаре учитываются отдельные боеприпасы: 1 штука весит 0,05 кг и стоит 1 крону."],
  ["blunt", "С затупленным наконечником", "Д", "common", 0.1, 5, "Несмертельное", "Один боеприпас с затупленным наконечником. Наносит дробящий урон; позволяет наносить несмертельный урон без штрафа."],
  ["broadhead", "С широким наконечником", "К", "common", 0.1, 10, "Кровопускающее (100%)", "Один боеприпас с широким наконечником. Если наносит урон цели, вызывает кровотечение."],
  ["armor-piercing", "Бронебойные", "К", "common", 0.1, 15, "Пробивающее броню", "Один бронебойный боеприпас. Игнорирует сопротивление брони соответствующему типу урона; не уменьшает её ПБ."]
].map(([id, name, damageType, rarity, weight, price, properties, description], index) => ({
  id: `ammunition.${id}`, documentId: `ammo${String(index + 1).padStart(12, "0")}`,
  name, img: AMMUNITION_ICON, type: "equipment", source: "ammunition",
  flags: id === "standard" ? { [SYSTEM_ID]: { ammunitionUnits: true } } : {},
  system: { kind: "ammunition", quantity: id === "standard" ? 10 : 1, purchaseQuantity: id === "standard" ? 10 : 1, weight, price, rarity, damageType,
    reliability: { value: 10, max: 10 }, concealment: "large", properties,
    description: `<p>${description}</p><p>Базовая книга, стр. 74.</p>`, source: "Базовая книга, стр. 74" }
}));
