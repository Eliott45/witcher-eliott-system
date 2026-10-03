import { ATTRIBUTE_KEYS } from "../data/statistics.mjs";
import { luckPoints } from "../data/luck.mjs";
import { attributeTooltip, modifierLines, stunTooltip } from "./statistics-tooltips.mjs";

/** Keep the displayed arithmetic alongside the same derived values used by tokens and rolls. */
export function statisticsContext(system, { localize, format }) {
  const statistics = system.statistics;
  const value = number => number ?? "—";
  const description = key => localize(`WITCHER.Statistics.${key}Description`);
  const base = {
    body: value(statistics.adjusted.body), will: value(statistics.adjusted.will),
    speed: value(statistics.adjusted.speed), reflex: value(statistics.initiative),
    physical: value(statistics.recovery), health: statistics.healthMax ?? system.health.max, maximum: value(statistics.healthMax),
    stun: value(statistics.stun), threshold: statistics.woundThreshold,
    run: value(statistics.run), leap: value(statistics.leap), carry: value(statistics.carryMax),
    carryBase: statistics.adjusted.body === null ? "—" : statistics.adjusted.body * 10
  };
  const tooltip = (key, formula) => [description(key), format(`WITCHER.Statistics.${formula}Formula`, base)].join("<br><br>");
  const row = (key, number, formula, unit = "") => ({
    key, label: `WITCHER.Statistics.${key}`, value: value(number),
    tooltip: tooltip(key, formula), unit: unit ? localize(`WITCHER.Statistics.${unit}`) : ""
  });
  const physicalReady = statistics.healthMax !== null;
  const resourceHint = physicalReady ? "" : `<br><br>${localize("WITCHER.Statistics.UnfilledPhysical")}`;
  const points = luckPoints(statistics.effective.luck, system.luckSpent, system.luckPending);
  const rollHint = key => format("WITCHER.Statistics.AttributeRoll", {
    attribute: localize(`WITCHER.Attributes.${key}.Label`), value: value(statistics.effective[key])
  });
  return {
    luck: { points, available: points.filter(point => !point.spent).length, maximum: value(statistics.effective.luck),
      pending: points.filter(point => point.selected).length,
      valueTooltip: attributeTooltip(system, "luck", { localize, format }),
      tooltip: localize("WITCHER.Attributes.luck.Description"), rollHint: rollHint("luck"), unset: system.attributes.luck === null },
    attributes: ATTRIBUTE_KEYS.filter(key => key !== "luck").map(key => ({
      key, value: system.attributes[key], label: `WITCHER.Attributes.${key}.Label`,
      short: `WITCHER.Attributes.${key}.Short`, tooltip: localize(`WITCHER.Attributes.${key}.Description`),
      valueTooltip: attributeTooltip(system, key, { localize, format }),
      reduced: statistics.effective[key] < system.attributes[key], modified: statistics.effective[key] !== system.attributes[key],
      effective: value(statistics.effective[key]), rollHint: rollHint(key), unset: system.attributes[key] === null
    })),
    physicalReady,
    healthTooltip: tooltip("Health", "Resource") + resourceHint,
    staminaTooltip: tooltip("Stamina", "Resource") + resourceHint,
    stunTooltip: stunTooltip(system, { localize, format }), stunValue: value(statistics.stun),
    stunUnavailable: statistics.stun === null,
    recovery: row("Recovery", statistics.recovery, "Recovery"),
    woundThreshold: row("WoundThreshold", statistics.woundThreshold, "WoundThreshold"),
    movementRows: [
      row("Initiative", statistics.initiative === null ? null : `+${statistics.initiative}`, "Initiative"),
      row("Run", statistics.run, "Run", "Meters"), row("Leap", statistics.leap, "Leap", "Meters")
    ],
    carryMax: value(statistics.carryMax), carryTooltip: [tooltip("Carry", "Carry"),
      ...modifierLines(statistics, "carryMax", localize), format("WITCHER.Statistics.TotalValue", { value: base.carry })].join("<br>"),
    carriedWeight: 0,
    vigorTooltip: description("Vigor"),
    wounded: statistics.wounded,
    woundNotice: system.health.value <= 0 ? "WITCHER.Statistics.Dying" : "WITCHER.Statistics.Wounded"
  };
}
