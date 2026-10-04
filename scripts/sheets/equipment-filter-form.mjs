export function bindEquipmentFilters(root, initial, refresh) {
  for (const field of root.querySelectorAll("[data-equipment-filter]")) {
    const value = initial[field.dataset.equipmentFilter];
    if (field.type === "checkbox") field.checked = Array.isArray(value) ? value.includes(field.value) : Boolean(value);
    else if (value != null) field.value = value;
    field.addEventListener("change", refresh);
  }
  root.querySelector("[data-clear-equipment]").addEventListener("click", () => {
    for (const field of root.querySelectorAll("[data-equipment-filter]")) {
      if (field.type === "checkbox") field.checked = false;
      else field.value = field.dataset.equipmentFilter === "sort" ? "name" : field.dataset.equipmentFilter === "traitMode" ? "all" : "";
    }
    root.querySelector(".witcher-picker-search").value = "";
    refresh();
  });
}
export function readEquipmentFilters(root) {
  const result = { query: root.querySelector(".witcher-picker-search").value, types: [], rarities: [], traits: [] };
  for (const field of root.querySelectorAll("[data-equipment-filter]")) {
    const key = field.dataset.equipmentFilter;
    if (Array.isArray(result[key])) { if (field.checked) result[key].push(field.value); }
    else result[key] = field.type === "checkbox" ? field.checked : field.value;
  }
  return result;
}
