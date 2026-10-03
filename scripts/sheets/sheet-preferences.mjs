import { SYSTEM_ID } from "../config.mjs";

export const SHEET_TABS = [
  { id: "main", label: "WITCHER.Sheet.Main", icon: "fa-solid fa-user" },
  { id: "skills", label: "WITCHER.Skills.Title", icon: "fa-solid fa-graduation-cap" },
  { id: "inventory", label: "WITCHER.Inventory.Title", icon: "fa-solid fa-sack" },
  { id: "actions", label: "WITCHER.Actions.Title", icon: "fa-solid fa-swords" },
  { id: "biography", label: "WITCHER.Sheet.Biography", icon: "fa-solid fa-book-open" },
  { id: "family", label: "WITCHER.Sheet.Family", icon: "fa-solid fa-people-roof" },
  { id: "lifepath", label: "WITCHER.Lifepath.Title", icon: "fa-solid fa-route" },
  { id: "effects", label: "WITCHER.Sheet.Effects", icon: "fa-solid fa-person-rays" }
];

export function registerSheetPreferences() {
  game.settings.register(SYSTEM_ID, "sheetPreferences", {
    scope: "user", config: false, type: Object, default: {}
  });
}

export function sheetPreferences(actorUuid) {
  return game.settings.get(SYSTEM_ID, "sheetPreferences")[actorUuid] ?? {};
}

export function visibleSheetTabs(hidden = []) {
  const visible = SHEET_TABS.filter(tab => !hidden.includes(tab.id));
  return visible.length ? visible : [SHEET_TABS[0]];
}

// Serialize writes so quickly collapsing several sections cannot discard earlier changes.
let pending = Promise.resolve();
export function updateSheetPreferences(actorUuid, changes) {
  const write = pending.then(async () => {
    const all = game.settings.get(SYSTEM_ID, "sheetPreferences");
    const previous = all[actorUuid] ?? {};
    const next = { ...previous, ...changes, collapsed: { ...previous.collapsed, ...changes.collapsed } };
    return game.settings.set(SYSTEM_ID, "sheetPreferences", { ...all, [actorUuid]: next });
  });
  pending = write.catch(() => {});
  return write;
}

export function reportPreferencesError(error) {
  console.error(`${SYSTEM_ID} | Could not save sheet preferences`, error);
  ui.notifications.error(game.i18n.localize("WITCHER.Sheet.PreferencesError"));
}

export async function chooseVisibleTabs(actorUuid) {
  const visible = new Set(visibleSheetTabs(sheetPreferences(actorUuid).hiddenTabs).map(tab => tab.id));
  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/sheet-tabs.hbs`, {
      tabs: SHEET_TABS.map(tab => ({ ...tab, visible: visible.has(tab.id) }))
    }
  );
  return foundry.applications.api.DialogV2.wait({
    modal: true, classes: ["witcher-tab-settings"], position: { width: 350 },
    window: { title: "WITCHER.Sheet.ManageTabs" }, content,
    buttons: [
      { action: "cancel", type: "button", label: "WITCHER.Picker.Cancel", callback: () => null },
      { action: "apply", label: "WITCHER.Sheet.Apply", default: true, callback: (_event, button) => {
        const checked = [...button.form.querySelectorAll("[data-sheet-tab]:checked")].map(input => input.value);
        return checked.length ? SHEET_TABS.filter(tab => !checked.includes(tab.id)).map(tab => tab.id) : null;
      } }
    ],
    render: (_event, dialog) => {
      const inputs = [...dialog.element.querySelectorAll("[data-sheet-tab]")];
      const apply = dialog.element.querySelector('[data-action="apply"]');
      for (const input of inputs) input.addEventListener("change", () => {
        apply.disabled = !inputs.some(entry => entry.checked);
      });
    }
  });
}
