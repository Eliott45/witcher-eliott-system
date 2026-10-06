import { equipmentEntry, equipmentFacets, filterEquipment } from "../data/equipment-search.mjs";
import { isPhysical } from "../data/physical-items.mjs";
import { equipmentQuote, acquireEquipment } from "../data/equipment-purchase.mjs";
import { bindEquipmentFilters, readEquipmentFilters, activeEquipmentFilters, syncFilterSections } from "./equipment-filter-form.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";

export async function browseEquipmentCatalog({ actor, categories = [], trait = "", documents, title = "Поиск предметов", containerId = "" } = {}) {
  const items = documents ?? [...await game.packs.get("witcher-eliott-system.equipment").getDocuments(), ...game.items].filter(item => isPhysical(item) && item.testUserPermission(game.user, "OBSERVER"));
  const entries = items.map(equipmentEntry), byId = new Map(items.map(item => [item.uuid ?? item.id, item]));
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/equipment-browser.hbs`, {
    entries, facets: equipmentFacets(entries), hasActor: Boolean(actor), actorName: actor?.name ?? "",
    hintKey: "Нажмите на предмет, чтобы открыть его описание. Добавление бесплатно; покупка списывает указанную цену."
  });
  const subscriptions = [];
  try {
    return await foundry.applications.api.DialogV2.wait({
      modal: false, classes: ["witcher-picker", "witcher-equipment-browser"], position: { width: 1000, height: Math.min(860, Math.round(window.innerHeight * 0.88)) },
      window: { title, resizable: true }, content,
      buttons: [{ action: "close", label: "Закрыть", default: true }],
      render: (_event, dialog) => {
        const root = dialog.element, rows = new Map([...root.querySelectorAll("[data-entry-id]")].map(row => [row.dataset.entryId, row]));
        const search = root.querySelector(".witcher-picker-search"), quantity = root.querySelector("[data-catalog-quantity]");
        const notice = root.querySelector("[data-catalog-notice]");
        let busy = false;
        const refreshActions = () => {
          if (!actor) return;
          root.querySelector("[data-catalog-balance]").textContent = `${actor.system.crowns} крон`;
          quantity.disabled = busy || !actor.isOwner;
          for (const [id, row] of rows) {
            const quote = equipmentQuote(actor, byId.get(id), Number(quantity.value));
            for (const action of ["add", "buy"]) {
              const button = row.querySelector(`[data-catalog-action=${action}]`), buy = action === "buy";
              const reason = buy ? quote.buyReason : quote.addReason;
              button.disabled = busy || Boolean(reason);
              const help = reason || (buy ? `Купить ${quote.units} шт. за ${quote.cost} крон` : `Добавить ${quote.units} шт. в инвентарь бесплатно`);
              button.dataset.tooltip = help;
              button.parentElement.title = help;
            }
            row.querySelector("[data-catalog-cost]").textContent = Number.isFinite(quote.cost) ? `${quote.cost} кр.` : "—";
          }
        };
        const renderActive = () => {
          const active = activeEquipmentFilters(root), bar = root.querySelector("[data-catalog-active]"), chips = bar.querySelector("[data-catalog-chips]");
          bar.hidden = !active.length;
          chips.replaceChildren(...active.map(filter => {
            const chip = document.createElement("button");
            chip.type = "button"; chip.className = "witcher-catalog-chip";
            chip.innerHTML = `${filter.group ? `<small>${escapeTooltip(filter.group)}</small> ` : ""}${escapeTooltip(filter.label)} <i class="fa-solid fa-xmark" aria-hidden="true"></i>`;
            chip.setAttribute("aria-label", `Убрать фильтр: ${filter.label}`);
            chip.addEventListener("click", () => { filter.clear(); refresh(); });
            return chip;
          }));
          for (const result of root.querySelectorAll("[data-catalog-trait]")) result.setAttribute("aria-pressed", String(!!root.querySelector(`[data-equipment-filter=traits][value="${CSS.escape(result.dataset.catalogTrait)}"]`)?.checked));
          // Selected properties float to the top of their scrolling list, so they stay in view.
          const options = root.querySelector(".witcher-facet-options");
          for (const label of [...options.children].filter(label => label.querySelector("input").checked).reverse()) options.prepend(label);
          syncFilterSections(root);
        };
        const refresh = () => {
          const matched = filterEquipment(entries, readEquipmentFilters(root)), visible = new Set(matched.map(entry => entry.id));
          for (const [id, row] of rows) row.hidden = !visible.has(id);
          const list = root.querySelector(".witcher-picker-list");
          for (const entry of matched) list.append(rows.get(entry.id));
          root.querySelector(".witcher-picker-count").textContent = game.i18n.format("WITCHER.Picker.Found", { count: visible.size });
          root.querySelector(".witcher-picker-empty").hidden = visible.size > 0;
          renderActive();
          refreshActions();
        };
        root.addEventListener("click", async event => {
          const traitChip = event.target.closest("[data-catalog-trait]");
          if (traitChip) {
            const box = root.querySelector(`[data-equipment-filter=traits][value="${CSS.escape(traitChip.dataset.catalogTrait)}"]`);
            if (box) { box.checked = !box.checked; refresh(); }
            return;
          }
          const button = event.target.closest("[data-catalog-action]");
          if (!button || button.disabled) return;
          const item = byId.get(button.closest("[data-entry-id]").dataset.entryId);
          if (button.dataset.catalogAction === "view") {
            if (item.testUserPermission(game.user, "OBSERVER")) await item.sheet.render({ force: true });
            return;
          }
          if (busy || !actor?.isOwner) return;
          try {
            busy = true; refreshActions();
            const purchase = button.dataset.catalogAction === "buy", count = Number(quantity.value);
            const created = await acquireEquipment(actor, item, { purchase, quantity: count, containerId });
            notice.textContent = `${purchase ? "Куплено" : "Добавлено"}: ${item.name} × ${created.reduce((sum, entry) => sum + entry.system.quantity, 0)}`;
            notice.classList.remove("error");
          } catch (error) {
            notice.textContent = error.message; notice.classList.add("error");
          } finally { busy = false; refreshActions(); }
        });
        search.addEventListener("input", refresh);
        root.querySelector("[data-facet-search]")?.addEventListener("input", event => {
          const query = event.target.value.trim().toLocaleLowerCase();
          for (const option of root.querySelectorAll("[data-facet]")) option.hidden = Boolean(query) && !option.dataset.facet.toLocaleLowerCase().includes(query);
        });
        quantity?.addEventListener("input", refreshActions);
        bindEquipmentFilters(root, { types: categories, traits: trait ? [trait] : [] }, refresh);
        if (actor) subscriptions.push(["updateActor", Hooks.on("updateActor", updated => { if (updated.uuid === actor.uuid) refreshActions(); })]);
        refresh(); search.focus();
      }
    });
  } finally { for (const [name, id] of subscriptions) Hooks.off(name, id); }
}
