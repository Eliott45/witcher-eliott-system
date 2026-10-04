import { SYSTEM_ID } from "../config.mjs";
import { REPUTATION_SKILLS, setReputationBonus } from "../data/reputation.mjs";
import { modifierLines } from "./statistics-tooltips.mjs";

export function reputationContext(system, { localize, format }) {
  const { statistics } = system;
  const state = system.reputation ?? { value: 0, bonusEnabled: false, skills: [] };
  const total = statistics.reputation;
  const sources = [format("WITCHER.Statistics.BaseValue", { value: state.value }),
    ...modifierLines(statistics, "reputation", localize),
    format("WITCHER.Statistics.TotalValue", { value: total })];
  if (state.value + statistics.reputationBonus > 10) sources.push(localize("WITCHER.Reputation.Cap"));
  const formula = format("WITCHER.Reputation.Formula", { will: statistics.effective.will ?? "—", level: total });
  return { total, bonus: statistics.reputationBonus, tooltip: sources.join("<br>"), formula,
    bonusEnabled: state.bonusEnabled, bonusActive: state.bonusEnabled && total > 0 && state.skills.length > 0,
    bonusHint: [localize("WITCHER.Reputation.BonusHint"),
      ...state.skills.map(key => localize(`WITCHER.Skills.Entries.${key}.Label`))].join("<br>"),
    rollUnavailable: statistics.effective.will === null };
}

export async function configureReputationBonus(_event, button) {
  if (!this.isEditable || this.reputationConfiguring) return;
  this.reputationConfiguring = true;
  try {
    const state = this.actor.system.reputation;
    const toggle = button.dataset.action === "toggleReputationBonus";
    if (toggle && (state.bonusEnabled || state.skills.length)) {
      return await setReputationBonus(this.actor, !state.bonusEnabled);
    }
    const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/reputation-bonus.hbs`, {
      skills: REPUTATION_SKILLS.map(key => ({ key, label: `WITCHER.Skills.Entries.${key}.Label`, selected: state.skills.includes(key) }))
    });
    const selected = await foundry.applications.api.DialogV2.prompt({
      window: { title: "WITCHER.Reputation.Configure" }, classes: ["witcher-tab-settings"], position: { width: 420 }, content,
      ok: { label: "WITCHER.Sheet.Apply", callback: (_event, button) => [...button.form.querySelectorAll("[data-reputation-skill]:checked")].map(input => input.value) },
      rejectClose: false
    });
    if (Array.isArray(selected)) await setReputationBonus(this.actor, toggle || this.actor.system.reputation.bonusEnabled, selected);
  } catch (error) { ui.notifications.error(error.message); }
  finally { this.reputationConfiguring = false; }
}
