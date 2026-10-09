import { ATTRIBUTE_KEYS } from "../data/statistics.mjs";
import { luckPoints } from "../data/luck.mjs";
import { attributeTooltip, modifierLines, stunTooltip } from "./statistics-tooltips.mjs";
import { selectedLuck } from "../data/luck.mjs";
import { deathTarget } from "../data/death.mjs";
import { deathTooltip } from "../chat/death-result.mjs";

/** Sheet icons for the eight rolled attributes and the derived rows of the sidebar. */
const ATTRIBUTE_ICONS = { intelligence: "fa-brain", reflex: "fa-person-running", dexterity: "fa-feather-pointed", body: "fa-hand-fist",
  speed: "fa-angles-right", empathy: "fa-eye", craft: "fa-hammer", will: "fa-shield-halved" };
const ROW_ICONS = { Initiative: "fa-bolt", Movement: "fa-shoe-prints", Run: "fa-person-running", Leap: "fa-angles-up",
  Recovery: "fa-bed", WoundThreshold: "fa-droplet" };

/** Keep the displayed arithmetic alongside the same derived values used by tokens and rolls. */
export function statisticsContext(system, { localize, format }) {
  const statistics = system.statistics;
  const value = number => number ?? "—";
  const description = key => localize(`WITCHER.Statistics.${key}Description`);
  const base = {
    body: value(statistics.adjusted.body), will: value(statistics.adjusted.will),
    speed: value(statistics.effective.speed), reflex: value(statistics.initiative),
    physical: value(statistics.recovery), health: statistics.healthMax ?? system.health.max, maximum: statistics.recovery === null ? "—" : statistics.recovery * 5,
    stun: value(statistics.stun), threshold: statistics.woundThreshold,
    run: value(statistics.run), leap: value(statistics.leap), carry: value(statistics.carryMax),
    carryBase: statistics.effective.body === null ? "—" : statistics.effective.body * 10
  };
  const tooltip = (key, formula) => [description(key), format(`WITCHER.Statistics.${formula}Formula`, base)].join("<br><br>");
  const row = (key, number, formula, unit = "") => ({
    key, label: `WITCHER.Statistics.${key}`, value: value(number), icon: `fa-solid ${ROW_ICONS[key]}`,
    tooltip: tooltip(key, formula), unit: unit ? localize(`WITCHER.Statistics.${unit}`) : ""
  });
  const physicalReady = statistics.healthMax !== null;
  const resourceHint = physicalReady ? "" : `<br><br>${localize("WITCHER.Statistics.UnfilledPhysical")}`;
  const points = luckPoints(statistics.effective.luck, system.luckSpent, system.luckPending);
  const rollHint = key => format("WITCHER.Statistics.AttributeRoll", {
    attribute: localize(`WITCHER.Attributes.${key}.Label`), value: value(statistics.effective[key])
  });
  const death = { base: value(statistics.stun), penalty: system.death?.penalty ?? 0, luck: selectedLuck(system).length,
    body: base.body, will: base.will, physical: base.physical };
  death.target = statistics.stun === null ? "—" : deathTarget(statistics.stun, death.penalty, death.luck);
  death.tooltip = deathTooltip(death, { localize, format });
  death.active = statistics.dying;
  death.dead = statistics.dead;
  return {
    vigorTotal: statistics.vigor,
    death,
    luck: { points, available: points.filter(point => !point.spent).length, maximum: value(statistics.effective.luck),
      pending: points.filter(point => point.selected).length,
      valueTooltip: attributeTooltip(system, "luck", { localize, format }),
      tooltip: localize("WITCHER.Attributes.luck.Description"), rollHint: rollHint("luck"), unset: system.attributes.luck === null },
    attributes: ATTRIBUTE_KEYS.filter(key => key !== "luck").map(key => ({
      key, value: system.attributes[key], label: `WITCHER.Attributes.${key}.Label`, icon: `fa-solid ${ATTRIBUTE_ICONS[key]}`,
      short: `WITCHER.Attributes.${key}.Short`, tooltip: localize(`WITCHER.Attributes.${key}.Description`),
      valueTooltip: attributeTooltip(system, key, { localize, format }),
      reduced: statistics.effective[key] < system.attributes[key], modified: statistics.effective[key] !== system.attributes[key],
      effective: value(statistics.effective[key]), rollHint: rollHint(key), unset: system.attributes[key] === null
    })),
    physicalReady,
    healthTooltip: [tooltip("Health", "Resource") + resourceHint, ...modifierLines(statistics, "healthMax", localize), format("WITCHER.Statistics.TotalValue", { value: statistics.healthMax ?? system.health.max })].join("<br>"),
    staminaTooltip: [tooltip("Stamina", "Resource") + resourceHint, ...modifierLines(statistics, "staminaMax", localize), format("WITCHER.Statistics.TotalValue", { value: statistics.staminaMax ?? system.stamina.max })].join("<br>"),
    stunTooltip: stunTooltip(system, { localize, format }), stunValue: value(statistics.stun),
    stunUnavailable: statistics.stun === null,
    recovery: row("Recovery", statistics.recovery, "Recovery"),
    woundThreshold: row("WoundThreshold", statistics.woundThreshold, "WoundThreshold"),
    movementRows: [
      row("Initiative", statistics.initiative === null ? null : `+${statistics.initiative}`, "Initiative"),
      row("Movement", statistics.effective.speed, "Movement", "Meters"),
      row("Run", statistics.run, "Run", "Meters"), row("Leap", statistics.leap, "Leap", "Meters")
    ],
    carryMax: value(statistics.carryMax), carryTooltip: [description("Carry"),
      format("WITCHER.Statistics.CarryFormula", { ...base, body: value(statistics.effective.body) }),
      ...modifierLines(statistics, "carryMax", localize), format("WITCHER.Statistics.TotalValue", { value: base.carry })].join("<br>"),
    carriedWeight: system.carriedWeight ?? 0,
    vigorTooltip: [description("Vigor"), format("WITCHER.Statistics.BaseValue", { value: system.vigor }),
      ...modifierLines(statistics, "vigor", localize), format("WITCHER.Statistics.TotalValue", { value: statistics.vigor })].join("<br>"),
    wounded: statistics.wounded && !statistics.dying && !statistics.dead,
    woundNotice: "WITCHER.Statistics.Wounded"
  };
}
