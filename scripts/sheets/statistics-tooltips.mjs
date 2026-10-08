export const escapeTooltip = value => String(value).replace(/[&<>"']/g,
  character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function modifierLines(statistics, target, localize) {
  return statistics.modifiers.filter(modifier => modifier.target === target && !modifier.condition)
    .map(modifier => `${modifier.value >= 0 ? "+" : "−"}${Math.abs(modifier.value)} — ${escapeTooltip(localize(modifier.label))}`);
}

export function attributeTooltip(system, key, { localize, format }) {
  const { statistics, attributes } = system;
  if (attributes[key] === null) return localize("WITCHER.Statistics.UnfilledAttribute");
  const lines = [format("WITCHER.Statistics.BaseValue", { value: attributes[key] }),
    ...modifierLines(statistics, `attributes.${key}`, localize)];
  if (key === "empathy" && statistics.modifiers.some(modifier => modifier.source === "witcher.dulled-emotions")) lines.push(localize("WITCHER.Statistics.EmpathyLimit"));
  if (statistics.effective[key] !== statistics.adjusted[key]) {
    lines.push(format(statistics.dying || statistics.dead ? "WITCHER.Death.Calculation" : "WITCHER.Statistics.WoundCalculation",
      { value: statistics.adjusted[key], result: statistics.effective[key] }));
  }
  lines.push(format("WITCHER.Statistics.TotalValue", { value: statistics.effective[key] }));
  return lines.join("<br>");
}

export function stunTooltip(system, { localize, format }) {
  const statistics = system.statistics;
  return [localize("WITCHER.Statistics.StunDescription"), format("WITCHER.Statistics.StunFormula", {
    body: statistics.adjusted?.body ?? "—", will: statistics.adjusted?.will ?? "—",
    physical: statistics.physical ?? statistics.recovery ?? "—", stun: statistics.stun ?? "—"
  }), localize("WITCHER.Statistics.StunNoLuck")].join("<br><br>");
}
