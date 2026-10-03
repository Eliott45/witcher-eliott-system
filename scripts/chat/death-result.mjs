import { SYSTEM_ID } from "../config.mjs";
import { deathTarget } from "../data/death.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";

export function deathTooltip(save, { localize, format }) {
  return [format("WITCHER.Statistics.StunFormula", {
    body: save.body, will: save.will, physical: save.physical, stun: save.base
  }), format("WITCHER.Death.Formula", save), localize("WITCHER.Death.Rule")].join("<br><br>");
}

/** Resolve after the chat operation has reserved Luck, before persisting the result. */
export function prepareDeathResult(message) {
  const data = message.flags[SYSTEM_ID]?.deathSave;
  if (!data || data.resolved) return;
  const roll = message.rolls[0];
  const luck = message.flags[SYSTEM_ID]?.luck;
  const bonus = luck?.target === "death" ? luck.bonus : 0;
  const target = deathTarget(data.base, data.penalty, bonus);
  const save = { ...data, luck: bonus, target, result: roll.total, succeeded: roll.total < target, resolved: true };
  const i18n = { localize: key => game.i18n.localize(key), format: (key, values) => game.i18n.format(key, values) };
  const tooltip = deathTooltip(save, i18n);
  const title = i18n.localize("WITCHER.Death.Roll");
  const cause = i18n.localize(`WITCHER.Death.Causes.${save.cause}`);
  const outcome = i18n.localize(save.succeeded ? "WITCHER.Death.Success" : "WITCHER.Death.Failure");
  const threshold = `<strong class="witcher-stun-target" data-tooltip="${escapeTooltip(tooltip)}" tabindex="0">${target}</strong>`;
  const result = i18n.format("WITCHER.Death.Result", { result: roll.total, target: threshold,
    comparison: save.succeeded ? "&lt;" : "≥" });
  message.updateSource({
    [`flags.${SYSTEM_ID}.deathSave`]: save,
    flavor: `<section class="witcher-death-result ${save.succeeded ? "success" : "failure"}"><strong>${escapeTooltip(title)}</strong>`
      + `<small>${escapeTooltip(cause)}</small><p>${result}</p><p>${escapeTooltip(outcome)}</p>`
      + (bonus ? `<span class="witcher-luck-bonus">${escapeTooltip(i18n.format("WITCHER.Death.LuckBonus", { value: bonus }))}</span>` : "") + "</section>"
  });
}
