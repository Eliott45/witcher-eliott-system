import { PEASANT_RITUALS, PEASANT_STEWS } from "./peasant-rules.mjs";
import { MATERIALS } from "./workshop-materials.mjs";
import { CORE_EQUIPMENT } from "./core-equipment.mjs";
import { SUBSTANCES } from "./workshop.mjs";

const component = row => {
  const item = [...MATERIALS, ...CORE_EQUIPMENT].find(item => item.id === row.id);
  if (!item) throw new Error(`Unknown peasant component: ${row.id}`);
  return `@UUID[Compendium.witcher-eliott-system.equipment.Item.${item.documentId}]{${item.name}} ×${row.quantity}`;
};
export function peasantReference(id) {
  if (id === "profession.peasant.stew") return "<h3>Семейные рецепты</h3>" + PEASANT_STEWS.map(row =>
    `<h4>${row.name}</h4><p>${row.materials.map(component).join("; ")}.</p><p>${row.description}</p>`).join("");
  if (id !== "profession.peasant.wisdom") return "";
  return "<h3>Народные ритуалы</h3>" + PEASANT_RITUALS.map(row => {
    const ingredients = [...(row.materials ?? []).map(component), ...Object.entries(row.substances ?? {}).map(([id, count]) => `${SUBSTANCES.find(s => s.id === id).name} ×${count}`),
      ...(row.plants ? [`Растительные ингредиенты ×${row.plants}`] : []), ...(row.ingredients ? [`Любые алхимические ингредиенты ×${row.ingredients}`] : []),
      ...(row.distinctIngredients ? [`Разные алхимические ингредиенты ×${row.distinctIngredients}`] : [])];
    return `<h4>${row.name} · СЛ ${row.dc}</h4>${ingredients.length ? `<p>${ingredients.join("; ")}.</p>` : ""}<p>${row.description}</p>`;
  }).join("");
}
