import { effectiveItem } from "./workshop.mjs";
import { relicArmorLore } from "./relic-armor.mjs";

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
  const duplicate = other => relicArmorLore(item) && other.system.ruleId === item.system.ruleId;
  const replace = others.filter(other => duplicate(other) || cls !== "light" && (other.system.armorClass ?? "light") === cls && ZONES(other).some(zone => zones.includes(zone)));
  const remaining = others.filter(other => !replace.includes(other));
  for (const zone of zones) {
    const count = remaining.filter(other => ZONES(other).includes(zone)).length + 1;
    if (count > MAX_LAYERS) return { replace: [], blocked: `На зоне уже ${MAX_LAYERS} слоя брони. Снимите один, чтобы надеть «${item.name}».` };
  }
  return { replace: replace.map(other => other.id), blocked: "", note: replace.some(duplicate) ? "Повторная копия этой реликвии заменяет надетую; её эффекты не складываются."
    : replace.length ? `Можно носить только один слой ${CLASS_NAMES[cls]} брони на зоне.` : "" };
}

/** Layered pieces and the EV each adds: +1 for a medium, +2 for a heavy piece sharing a zone with another worn piece. */
export function layeringDetails(worn) {
  const armor = worn.filter(isArmor);
  return armor.filter(item => armor.some(other => other.id !== item.id && ZONES(other).some(zone => ZONES(item).includes(zone))))
    .map(item => ({ id: item.id, name: item.name, armorClass: item.system.armorClass ?? "light",
      extra: item.system.armorClass === "heavy" ? 2 : item.system.armorClass === "medium" ? 1 : 0 }));
}
export const layeringEncumbrance = worn => layeringDetails(worn).reduce((sum, piece) => sum + piece.extra, 0);

const layerBonus = difference => difference <= 4 ? 5 : difference <= 8 ? 4 : difference <= 14 ? 3 : difference <= 20 ? 2 : 0;
/** Combine layers lightest-first: 3 + 12 → 15, then 15 + 20 → 24 (errata example). */
export function layeredStoppingPower(values) {
  const layers = values.filter(value => value > 0).sort((a, b) => a - b);
  if (!layers.length) return 0;
  return layers.slice(1).reduce((total, next) => Math.max(total, next) + layerBonus(Math.abs(next - total)), layers[0]);
}
export const zoneStoppingPower = items => layeredStoppingPower(items.filter(isArmor).map(item => Math.max(0, effectiveItem(item).stoppingPower?.value ?? 0)));
