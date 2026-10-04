// User-provided core p. 74. Standard ammunition is priced/weighed as a pack of ten;
// the other rows are single projectiles. No automatic shot consumption yet.
export const CORE_AMMUNITION = [
  ["standard", "Стандартные (×10)", "К", "everywhere", 0.5, 10, "", "Набор из 10 стандартных боеприпасов. Количество в инвентаре считает наборы; цена 10 крон и вес 0,5 кг указаны за весь набор."],
  ["blunt", "С затупленным наконечником", "Д", "common", 0.1, 5, "Несмертельное", "Один боеприпас с затупленным наконечником. Наносит дробящий урон; позволяет наносить несмертельный урон без штрафа."],
  ["broadhead", "С широким наконечником", "К", "common", 0.1, 10, "Кровопускающее (100%)", "Один боеприпас с широким наконечником. Если наносит урон цели, вызывает кровотечение."],
  ["armor-piercing", "Бронебойные", "К", "common", 0.1, 15, "Пробивающее броню", "Один бронебойный боеприпас. Игнорирует сопротивление брони соответствующему типу урона; не уменьшает её ПБ."]
].map(([id, name, damageType, rarity, weight, price, properties, description], index) => ({
  id: `ammunition.${id}`, documentId: `ammo${String(index + 1).padStart(12, "0")}`,
  name, type: "equipment", source: "ammunition",
  system: { kind: "ammunition", quantity: 1, weight, price, rarity, damageType,
    reliability: { value: 10, max: 10 }, concealment: "large", properties,
    description: `<p>${description}</p><p>Базовая книга, стр. 74.</p>`, source: "Базовая книга, стр. 74" }
}));
