import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";
import { minimumRollSource } from "../dice/minimum-roll.mjs";

/** Persist a readable chain alongside native Roll data, so chat history stays useful. */
export function prepareCriticalResult(message) {
  if (message.flags[SYSTEM_ID]?.criticalResult) return;
  const sections = [];
  for (const [index, roll] of message.rolls.entries()) {
    const chains = roll.dice.flatMap(die => die.options?.[SYSTEM_ID]?.criticalChains ?? []);
    if (!chains.length) continue;
    const spentLuck = message.flags[SYSTEM_ID]?.luck;
    const luck = index === (spentLuck?.rollIndex ?? 0) ? spentLuck?.bonus ?? 0 : 0;
    const contribution = chains.reduce((total, chain) => total + chain.total, 0);
    const rawTotal = minimumRollSource(roll).total;
    const base = rawTotal - contribution - luck;
    const signed = number => `${number < 0 ? "−" : "+"} ${Math.abs(number)}`;
    const rendered = chains.map(chain => {
      const fumble = chain.kind === "fumble";
      const label = game.i18n.localize(`WITCHER.Critical.${fumble ? "Fumble" : "Success"}`);
      const path = chain.results.map(result => `<span class="witcher-chain-die">${escapeTooltip(result)}</span>`).join('<span class="witcher-chain-arrow" aria-hidden="true">→</span>');
      return `<div class="witcher-chain ${fumble ? "fumble" : "critical"}">
        <strong>${escapeTooltip(label)}</strong><div class="witcher-chain-path">${path}<span class="witcher-chain-sum">= ${chain.total < 0 ? "−" : ""}${Math.abs(chain.total)}</span></div>
        ${fumble ? `<small>${escapeTooltip(game.i18n.localize("WITCHER.Critical.FirstOne"))}</small>` : ""}</div>`;
    }).join("");
    const equation = `${base} ${chains.map(chain => signed(chain.total)).join(" ")}${luck ? ` + ${luck}` : ""} = ${roll.total}${rawTotal < roll.total ? " (минимум 0)" : ""}`;
    sections.push(`<section class="witcher-critical-result">${rendered}<div class="witcher-check-equation">${escapeTooltip(game.i18n.localize("WITCHER.Critical.Total"))}: ${escapeTooltip(equation)}</div></section>`);
  }
  if (sections.length) message.updateSource({
    flavor: `${message.flavor ?? ""}${sections.join("")}`, [`flags.${SYSTEM_ID}.criticalResult`]: true
  });
}
