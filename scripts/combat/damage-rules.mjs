import { effectiveItem } from "../data/workshop.mjs";
import { equippedItems, armorZones } from "../data/physical-items.mjs";

// Core pp.153–162 with errata v4: SP first, then resistance, then the location multiplier.
// Critical bonus damage ignores armor and never ablates it (Sage's Answers 2 and 20).

const TYPE_CODES = { "К": "piercing", "Р": "slashing", "Д": "bludgeoning", "С": "elemental" };
export const DAMAGE_TYPE_NAMES = { piercing: "колющий", slashing: "режущий", bludgeoning: "дробящий", elemental: "стихийный" };
export const parseDamageTypes = text => [...new Set(String(text ?? "").toUpperCase().split(/[^А-ЯЁ]+/u).map(code => TYPE_CODES[code]).filter(Boolean))];

/** Weapon properties that change how damage meets armor. */
export function weaponDamageTraits(weapon = {}) {
  const properties = String(weapon.properties ?? "").toLocaleLowerCase();
  return {
    types: parseDamageTypes(weapon.damageType),
    piercing: /улучшенное пробивающее броню/.test(properties) ? "improved" : /пробивающее броню/.test(properties) ? "normal" : "none",
    silverDice: properties.match(/серебрян\S*\s*\(([^)]+)\)/u)?.[1]?.trim() ?? "",
    silver: /серебрян/.test(properties),
    nonLethal: /несмертельн/.test(properties)
  };
}

// Core p.155 «Дополнительная броня».
const layerBonus = difference => difference <= 4 ? 5 : difference <= 8 ? 4 : difference <= 14 ? 3 : difference <= 20 ? 2 : 0;
/** Combine layers lightest-first: 3 + 12 → 15, then 15 + 20 → 24 (errata example). */
export function layeredStoppingPower(values) {
  const layers = values.filter(value => value > 0).sort((a, b) => a - b);
  if (!layers.length) return 0;
  return layers.slice(1).reduce((total, next) => Math.max(total, next) + layerBonus(Math.abs(next - total)), layers[0]);
}

export const LOCATION_ZONE = { head: "head", torso: "torso", rightArm: "torso", leftArm: "torso", rightLeg: "legs", leftLeg: "legs", tail: "torso" };

/** Armor protecting one hit location: worn layers, or a creature's natural armor when nothing is worn there. */
export function armorAt(actor, location) {
  const zone = LOCATION_ZONE[location] ?? "torso";
  const items = equippedItems(actor.items).filter(item => item.type === "armor" && armorZones(item).includes(zone));
  const worn = items.map(item => ({ item, sp: Math.max(0, effectiveItem(item).stoppingPower?.value ?? 0), resistances: parseDamageTypes(effectiveItem(item).resistances) }));
  if (worn.length) {
    const top = worn.reduce((best, layer) => layer.sp > best.sp ? layer : best, worn[0]);
    return { zone, sp: layeredStoppingPower(worn.map(layer => layer.sp)), resistances: [...new Set(worn.flatMap(layer => layer.resistances))],
      layers: worn.map(layer => ({ id: layer.item.id, name: layer.item.name, sp: layer.sp })), ablate: top.sp > 0 ? top.item.id : null, natural: false };
  }
  const natural = actor.type === "npc" ? Math.max(0, actor.system.creature?.naturalArmor ?? 0) : 0;
  return { zone, sp: natural, resistances: [], layers: natural ? [{ id: "", name: "Естественная броня", sp: natural }] : [], ablate: null, natural: Boolean(natural) };
}

const hasAbility = (actor, ruleId) => (actor.items ?? []).some(item => item.type === "ability" && item.system.ruleId === ruleId);
/** Errata p.162: every monster except beasts halves non-silver damage; fire is exempt. */
export function monsterResistant(actor) {
  if (actor.type !== "npc") return false;
  if (hasAbility(actor, "creature.monster-resistance")) return true;
  return !["beast", "humanoid"].includes(actor.system.creature?.category ?? "humanoid");
}
export const fireVulnerable = actor => hasAbility(actor, "creature.fire-vulnerable");

// Core p.158: margin over defense → level and armor-ignoring bonus damage.
export const CRITICAL_LEVELS = [
  { id: "deadly", name: "Смертельное", margin: 15, bonus: 10, stabilize: 18 },
  { id: "severe", name: "Тяжёлое", margin: 13, bonus: 8, stabilize: 16 },
  { id: "medium", name: "Среднее", margin: 10, bonus: 5, stabilize: 14 },
  { id: "light", name: "Лёгкое", margin: 7, bonus: 3, stabilize: 12 }
];
export const criticalLevel = margin => CRITICAL_LEVELS.find(level => margin >= level.margin) ?? null;

/**
 * Step-by-step damage against one hit location. Every step is recorded so the chat card can explain the result.
 * `base` is the rolled weapon damage (already ×2 for a strong strike); `silver` the separate silver dice total.
 */
export function resolveDamage({ base, silver = 0, location, multiplier, traits, armor, monster = false, vulnerableToFire = false, critical = null }) {
  const steps = [], note = (label, value, detail = "") => steps.push({ label, value, detail });
  const fire = traits.types.includes("elemental");
  const silverApplies = monster && silver > 0;
  let damage = base + (silverApplies ? silver : 0);
  note("Бросок урона", base);
  if (silverApplies) note("Серебро против чудовища", `+${silver}`);
  const sp = traits.piercing === "improved" ? Math.floor(armor.sp / 2) : armor.sp;
  if (armor.sp) note(traits.piercing === "improved" ? "ПБ (улучшенное пробивание: ½)" : "ПБ брони", `−${sp}`, armor.layers.map(layer => `${layer.name} ${layer.sp}`).join(", "));
  damage = Math.max(0, damage - sp);
  const penetrated = damage > 0;
  const resisted = penetrated && traits.types.length > 0 && traits.types.every(type => armor.resistances.includes(type));
  if (resisted && traits.piercing === "none") { damage = Math.floor(damage / 2); note("Сопротивление брони", "½", traits.types.map(type => DAMAGE_TYPE_NAMES[type]).join("/")); }
  else if (resisted) note("Сопротивление брони", "игнорируется", "пробивающее броню");
  if (multiplier !== 1) { damage = Math.floor(damage * multiplier); note("Зона попадания", `×${multiplier === 0.5 ? "½" : multiplier}`); }
  if (monster && !traits.silver && !fire && damage > 0) { damage = Math.floor(damage / 2); note("Чудовище: не серебро", "½"); }
  if (vulnerableToFire && fire && damage > 0) { damage *= 2; note("Уязвимость к огню", "×2"); }
  if (critical) { damage += critical.bonus; note(`Критическое ранение: ${critical.name.toLocaleLowerCase("ru")}`, `+${critical.bonus}`, "броня не блокирует"); }
  return { total: damage, steps, penetrated, ablate: penetrated ? armor.ablate : null, location };
}
