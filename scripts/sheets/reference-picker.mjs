import { SYSTEM_ID } from "../config.mjs";
import { ORIGIN_GROUPS } from "../data/origins.mjs";
import { FAMILY_GROUPS } from "../data/family-statuses.mjs";
import { selectionEntries, filterEntries } from "./selection-data.mjs";

/** Local browsing only; the actor is updated by its sheet after confirmation. */
export async function chooseReference(kind, current, { isWitcher = false, initialGroup = "", entries: suppliedEntries, groups: suppliedGroups, title, hint } = {}) {
  if (kind === "familyStatus" && isWitcher) return null;
  const localize = key => game.i18n.localize(key);
  const entries = suppliedEntries ?? selectionEntries(kind, localize);
  const isLifepath = ["familyStatus", "influentialFriend"].includes(kind);
  const groups = suppliedGroups ?? (kind === "profession" ? { magic: "WITCHER.Professions.Magic", mundane: "WITCHER.Professions.Mundane" } : isLifepath ? FAMILY_GROUPS : kind === "origin" ? ORIGIN_GROUPS : {
    peoples: "WITCHER.Picker.Peoples", mutants: "WITCHER.Picker.Mutants"
  });
  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/reference-picker.hbs`, {
      entries: entries.map(entry => ({ ...entry, selected: entry.id === current })),
      groups: Object.entries(groups).map(([id, label]) => ({ id, label })),
      excluded: kind === "origin" && isWitcher,
      hintKey: hint ?? (kind === "profession" ? "WITCHER.Professions.Advancement" : kind === "influentialFriend" ? "WITCHER.Friends.Hint" : "WITCHER.Picker.ReferenceOnly")
    }
  );
  let selected = current;
  let group = isLifepath ? entries.find(entry => entry.id === current)?.group ?? initialGroup : initialGroup;
  const result = await foundry.applications.api.DialogV2.wait({
    modal: true,
    classes: ["witcher-picker"],
    position: { width: 780 },
    window: { title: title ?? localize({ profession: "WITCHER.Professions.Choose", race: "WITCHER.Sheet.ChooseRace", origin: "WITCHER.Sheet.ChooseOrigin", familyStatus: "WITCHER.Sheet.ChooseFamilyStatus", influentialFriend: "WITCHER.Sheet.ChooseFriend" }[kind]), resizable: true },
    content,
    buttons: [
      { action: "clear", label: "WITCHER.Picker.Clear", type: "button", callback: () => "" },
      { action: "cancel", label: "WITCHER.Picker.Cancel", type: "button", callback: () => ({ cancelled: true }) },
      { action: "choose", label: "WITCHER.Picker.Select", default: true, disabled: !current, callback: () => selected }
    ],
    render: (_event, dialog) => {
      const root = dialog.element;
      const search = root.querySelector(".witcher-picker-search");
      const rows = [...root.querySelectorAll("[data-entry-id]")];
      const filters = [...root.querySelectorAll("[data-filter]")];
      const choose = root.querySelector('[data-action="choose"]');
      const refresh = () => {
        const visible = new Set(filterEntries(entries, search.value, group).map(entry => entry.id));
        for (const row of rows) {
          row.hidden = !visible.has(row.dataset.entryId);
          row.classList.toggle("selected", row.dataset.entryId === selected);
        }
        for (const filter of filters) filter.setAttribute("aria-pressed", String(filter.dataset.filter === group));
        root.querySelector(".witcher-picker-count").textContent = game.i18n.format("WITCHER.Picker.Found", { count: visible.size });
        root.querySelector(".witcher-picker-empty").hidden = visible.size > 0;
        choose.disabled = !visible.has(selected);
      };
      search.addEventListener("input", refresh);
      for (const filter of filters) filter.addEventListener("click", () => {
        group = filter.dataset.filter;
        refresh();
      });
      for (const row of rows) row.querySelector("input[type=radio]").addEventListener("change", event => {
        selected = event.target.value;
        refresh();
      });
      refresh();
      search.focus();
    }
  });
  return typeof result === "string" && (result === "" || entries.some(entry => entry.id === result)) ? result : null;
}
