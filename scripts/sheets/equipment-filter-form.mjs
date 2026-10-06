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

const NEUTRAL = { sort: "name", traitMode: "all", descending: false };
const isActive = field => field.type === "checkbox" ? field.checked && !(field.dataset.equipmentFilter in NEUTRAL)
  : field.value !== "" && field.value !== NEUTRAL[field.dataset.equipmentFilter];

/** Human-readable list of every filter that narrows the results, so none of them is ever invisible. */
export function activeEquipmentFilters(root) {
  const active = [];
  const query = root.querySelector(".witcher-picker-search").value.trim();
  if (query) active.push({ label: `«${query}»`, clear: () => { root.querySelector(".witcher-picker-search").value = ""; } });
  for (const field of root.querySelectorAll("[data-equipment-filter]")) {
    if (!isActive(field)) continue;
    const section = field.closest("details")?.querySelector("summary")?.firstChild?.textContent.trim();
    const own = field.closest("label")?.textContent.trim() ?? "";
    const text = field.type === "checkbox" ? own
      : field.tagName === "SELECT" ? `${own.replace(field.selectedOptions[0]?.textContent ?? "", "").trim() || section}: ${field.selectedOptions[0]?.textContent.trim()}`
      : `${own} ${field.value}`;
    active.push({ label: text, group: field.dataset.equipmentFilter === "types" ? "Тип" : section ?? "",
      clear: () => { if (field.type === "checkbox") field.checked = false; else field.value = ""; } });
  }
  return active;
}

/** Open sections that hold active filters and show how many each one has. */
export function syncFilterSections(root) {
  for (const section of root.querySelectorAll("[data-filter-section]")) {
    const count = [...section.querySelectorAll("[data-equipment-filter]")].filter(isActive).length;
    section.querySelector("[data-filter-count]").textContent = count || "";
    if (count) section.open = true;
  }
}
