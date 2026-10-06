import { effectiveItem } from "./workshop.mjs";

// Core pp.154–155 with errata v4 «Layering Table»: up to three layers on a body part, at most one
// medium and one heavy. SP combines by the bonus table; EV sums plus +1 per medium and +2 per heavy layer.
export const MAX_LAYERS = 3;
const ZONES = item => item.system.zone === "all" ? ["head", "torso", "legs"] : item.system.zone === "torso-legs" ? ["torso", "legs"] : [item.system.zone];
const isArmor = item => item?.type === "armor";
const CLASS_NAMES = { medium: "средней", heavy: "тяжёлой" };

/** Equipping `item` among `worn` armor: which pieces it replaces, or why it cannot be added. */
export function layeringPlan(item, worn) {
  const others = worn.filter(other => isArmor(other) && other.id !== item.id);
  const zones = ZONES(item), cls = item.system.armorClass ?? "light";
  // A second medium or heavy layer on a shared zone replaces the old one, as before.
  const replace = cls === "light" ? [] : others.filter(other => (other.system.armorClass ?? "light") === cls && ZONES(other).some(zone => zones.includes(zone)));
  const remaining = others.filter(other => !replace.includes(other));
  for (const zone of zones) {
    const count = remaining.filter(other => ZONES(other).includes(zone)).length + 1;
    if (count > MAX_LAYERS) return { replace: [], blocked: `На зоне уже ${MAX_LAYERS} слоя брони. Снимите один, чтобы надеть «${item.name}».` };
  }
  return { replace: replace.map(other => other.id), blocked: "", note: replace.length ? `Можно носить только один слой ${CLASS_NAMES[cls]} брони на зоне.` : "" };
}

/** Extra EV of layering: a medium/heavy piece that shares a zone with another worn piece. */
export function layeringEncumbrance(worn) {
  const armor = worn.filter(isArmor);
  return armor.reduce((sum, item) => {
    const layered = armor.some(other => other.id !== item.id && ZONES(other).some(zone => ZONES(item).includes(zone)));
    return sum + (!layered ? 0 : item.system.armorClass === "heavy" ? 2 : item.system.armorClass === "medium" ? 1 : 0);
  }, 0);
}

const layerBonus = difference => difference <= 4 ? 5 : difference <= 8 ? 4 : difference <= 14 ? 3 : difference <= 20 ? 2 : 0;
/** Combine layers lightest-first: 3 + 12 → 15, then 15 + 20 → 24 (errata example). */
export function layeredStoppingPower(values) {
  const layers = values.filter(value => value > 0).sort((a, b) => a - b);
  if (!layers.length) return 0;
  return layers.slice(1).reduce((total, next) => Math.max(total, next) + layerBonus(Math.abs(next - total)), layers[0]);
}
export const zoneStoppingPower = items => layeredStoppingPower(items.filter(isArmor).map(item => Math.max(0, effectiveItem(item).stoppingPower?.value ?? 0)));
