import { SYSTEM_ID } from "./config.mjs";

const GROUPS = [
  { id: "OptionalRules", icon: "book-open", keys: ["bookMonsters", "adrenalineRules"] },
  { id: "Rolls", icon: "dice-d10", keys: ["automaticCriticalDice", "automaticFumbleRolls"] },
  { id: "Privacy", icon: "eye-slash", keys: ["concealAttackRolls", "concealCreatureDetails"] },
  { id: "Effects", icon: "wand-magic-sparkles", keys: ["waitDiceAnimation", "combatEffects", "combatBlood", "bloodLifetime", "spellAreaLifetime"] },
  { id: "Interface", icon: "language", keys: ["systemLanguage"] },
  { id: "Testing", icon: "flask", keys: ["debugDice"] }
];

/** Arrange native fields, keeping Foundry's permissions, search, defaults and form submission. */
export function arrangeSystemSettings(element) {
  const category = element.querySelector('[data-category="system"]');
  if (!category || category.classList.contains("witcher-settings")) return;
  category.classList.add("witcher-settings");
  const doc = category.ownerDocument;
  for (const group of GROUPS) {
    const rows = group.keys.map(key => ({ key, row: category.querySelector(`[name="${SYSTEM_ID}.${key}"]`)?.closest(".form-group") }))
      .filter(entry => entry.row);
    if (!rows.length) continue;
    const section = doc.createElement("section"), title = doc.createElement("h3"), icon = doc.createElement("i");
    section.className = "witcher-settings-group";
    icon.className = `fa-solid fa-${group.icon}`; icon.setAttribute("aria-hidden", "true");
    title.append(icon, ` ${game.i18n.localize(`WITCHER.Settings.Groups.${group.id}`)}`);
    section.append(title);
    for (const { key, row } of rows) {
      row.classList.add("witcher-setting");
      const setting = game.settings.settings.get(`${SYSTEM_ID}.${key}`), badge = doc.createElement("span");
      badge.className = "witcher-setting-scope";
      badge.textContent = game.i18n.localize(`WITCHER.Settings.${setting.scope === "world" ? "ScopeWorld" : "ScopeClient"}`);
      row.querySelector("label").append(badge);
      const toggle = row.querySelector('input[type="checkbox"]');
      if (toggle) toggle.setAttribute("role", "switch");
      section.append(row);
    }
    category.append(section);
  }
}

export function registerSettingsLayout() {
  Hooks.on("renderSettingsConfig", (_app, element) => arrangeSystemSettings(element));
}
