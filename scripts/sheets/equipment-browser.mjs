import { equipmentEntry } from "../data/equipment-search.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { chooseReference } from "./reference-picker.mjs";

export async function chooseEquipment({ categories = [], trait = "", documents, title = "Поиск предметов", hint = "Выберите предмет для добавления в инвентарь. Кроны не списываются." } = {}) {
  const items = documents ?? [...await game.packs.get("witcher-eliott-system.equipment").getDocuments(), ...game.items].filter(item => isPhysical(item) && item.testUserPermission(game.user, "OBSERVER"));
  const id = await chooseReference("inventory", "", { title, hint, advanced: true, initialEquipmentFilters: { types: categories, traits: trait ? [trait] : [] }, entries: items.map(equipmentEntry) });
  return items.find(item => (item.uuid ?? item.id) === id);
}
