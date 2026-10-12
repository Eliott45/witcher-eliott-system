import { elixirArmor } from "../workshop/witcher-elixirs.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { equippedItems, armorZones } from "../data/physical-items.mjs";
import { layeredStoppingPower } from "../data/armor-layers.mjs";
import { spiritState } from "./creature-spirits.mjs";
import { creatureProfile, creatureHumanForm } from "../data/creature-modes.mjs";
import { bookMonstersEnabled } from "../settings.mjs";

// Core pp.153–162 with errata v4: SP first, then resistance, then the location multiplier.
// Critical bonus damage ignores armor and never ablates it (Sage's Answers 2 and 20).

const TYPE_CODES = { "К": "piercing", "Р": "slashing", "Д": "bludgeoning", "С": "elemental" };
export const DAMAGE_TYPE_NAMES = { piercing: "колющий", slashing: "режущий", bludgeoning: "дробящий", elemental: "стихийный" };
export const damageTypeLabel = text => parseDamageTypes(text).map(type => DAMAGE_TYPE_NAMES[type]).join(" / ");
export const parseDamageTypes = text => [...new Set(String(text ?? "").toUpperCase().split(/[^А-ЯЁ]+/u).map(code => TYPE_CODES[code]).filter(Boolean))];

/** Weapon properties that change how damage meets armor. */
export function weaponDamageTraits(weapon = {}) {
  const properties = String(weapon.properties ?? "").toLocaleLowerCase();
  return {
    types: parseDamageTypes(weapon.damageType),
    piercing: /улучшенное пробивающее броню/.test(properties) ? "improved" : /пробивающее броню/.test(properties) ? "normal" : "none",
    silverDice: properties.match(/серебрян\S*\s*\(([^)]+)\)/u)?.[1]?.trim() ?? "",
    silver: /серебрян/.test(properties),
    meteorite: /метеоритн/.test(properties),
    nonLethal: /несмертельн/.test(properties)
  };
}

export { layeredStoppingPower };

// Core p.154: damage resistance as written in item properties, including installed armor upgrades
// («Сопротивление режущему и колющему урону», «Сопротивление огню и дробящему урону»).
const RESIST_WORDS = [[/режущ/u, "slashing"], [/колющ/u, "piercing"], [/дробящ/u, "bludgeoning"], [/ого?н|пламен|стихийн/u, "elemental"]];
export function resistancesFromText(text) {
  const found = new Set();
  for (const match of String(text ?? "").toLocaleLowerCase("ru").matchAll(/сопротивлени[еяю]\s+([^;.\n]+)/gu))
    for (const [pattern, type] of RESIST_WORDS) if (pattern.test(match[1])) found.add(type);
  return [...found];
}
const itemResistances = item => { const data = effectiveItem(item); return [...new Set([...parseDamageTypes(data.resistances), ...resistancesFromText(data.properties)])]; };
/** A creature's own resistances (GM field, codes Р/К/Д/С or words). */
export const creatureResistances = actor => actor?.type === "npc"
  ? [...new Set([...parseDamageTypes(actor.system.creature?.resistances), ...resistancesFromText(`сопротивление ${actor.system.creature?.resistances ?? ""}`)])] : [];

/** Poison/bleeding resistance (core pp.78, 264): armor fields, properties with upgrades, or the creature field. */
export function conditionResistant(actor, kind) {
  const words = kind === "poison" ? /^(яд|яды|poison)$/iu : /^(кровотечение|bleeding)$/iu;
  const phrase = kind === "poison" ? /сопротивлени[еяю] (яду|ядам)|poison resistance/iu : /сопротивлени[еяю] кровотечению|bleed(ing)? resistance/iu;
  const fields = [...equippedItems(actor.items ?? []).filter(item => item.type === "armor").map(item => effectiveItem(item)),
    ...(actor.type === "npc" ? [{ resistances: actor.system.creature?.resistances ?? "" }] : [])];
  return fields.some(data => String(data.resistances ?? "").split(/[;,\n/]/u).some(value => words.test(value.trim())) || phrase.test(data.properties ?? ""));
}

export const LOCATION_ZONE = { head: "head", torso: "torso", rightArm: "torso", leftArm: "torso", rightLeg: "legs", leftLeg: "legs", tail: "torso" };

/** Armor protecting one hit location: worn layers, or a creature's natural armor when nothing is worn there. */
/** Armor at a location; `fireImmune` marks creatures fire cannot harm (Monster Hunter's Journal: barghests). */
export function armorAt(actor, location, options = {}) {
  const armor = locationArmor(actor, location, options);
  if (hasAbility(actor, "creature.fire-immunity")) armor.fireImmune = true;
  return armor;
}
function locationArmor(actor, location, { weakSpot = actor.system?.creature?.weakSpot ?? false } = {}) {
  const zone = LOCATION_ZONE[location] ?? "torso";
  const items = equippedItems(actor.items).filter(item => item.type === "armor" && armorZones(item).includes(zone));
  const worn = items.map(item => ({ item, sp: Math.max(0, effectiveItem(item).stoppingPower?.value ?? 0), resistances: itemResistances(item) }));
  const innate = creatureResistances(actor), incorporeal = spiritState(actor).incorporeal;
  // Griffin and Arachas decoctions (core p.248) add SP to every location; it is never worn down.
  const extra = elixirArmor(actor), extraSp = extra.reduce((sum, layer) => sum + layer.sp, 0), extraLayers = extra.map(layer => ({ id: "", name: layer.name, sp: layer.sp }));
  const profile = weakSpot ? creatureProfile(actor) : null;
  const weakBase = profile?.id === "rock-troll" && location === "torso" ? 5 : profile?.id === "arachas" ? 10 : null;
  if (weakBase !== null) {
    const natural = Math.max(0, (actor.system.creature?.naturalArmor ?? profile.armor) - (profile.armor - weakBase));
    return { zone, incorporeal, weakSpot: true, sp: natural + extraSp, resistances: [],
      layers: [...(natural ? [{ id: "", name: profile.id === "rock-troll" ? "Живот тролля" : "Задняя часть панциря", sp: natural }] : []), ...extraLayers],
      ablate: natural ? ["natural"] : [], natural: Boolean(natural) };
  }
  if (worn.length) {
    const top = worn.reduce((best, layer) => layer.sp > best.sp ? layer : best, worn[0]);
    return { zone, incorporeal, sp: layeredStoppingPower(worn.map(layer => layer.sp)) + extraSp, resistances: [...new Set([...worn.flatMap(layer => layer.resistances), ...innate])],
      layers: [...worn.map(layer => ({ id: layer.item.id, name: layer.item.name, sp: layer.sp })), ...extraLayers], ablate: worn.filter(layer => layer.sp > 0).map(layer => layer.item.id), natural: false };
  }
  const natural = actor.type === "npc" && !creatureHumanForm(actor) ? Math.max(0, actor.system.creature?.naturalArmor ?? 0) : 0;
  return { zone, incorporeal, sp: natural + extraSp, resistances: innate, layers: [...(natural ? [{ id: "", name: "Естественная броня", sp: natural }] : []), ...extraLayers], ablate: natural ? ["natural"] : [], natural: Boolean(natural) };
}

const hasAbility = (actor, ruleId) => (actor.items ?? []).some(item => item.type === "ability" && item.system.ruleId === ruleId);
/** Errata p.162: every monster except beasts halves non-silver damage; fire is exempt. */
export function monsterResistant(actor) {
  if (actor.type !== "npc" || creatureHumanForm(actor)) return false;
  if (hasAbility(actor, "creature.monster-resistance")) return true;
  return !["beast", "humanoid"].includes(actor.system.creature?.category ?? "humanoid");
}
const METEORITE_CATEGORIES = new Set(["beast", "hybrid", "draconid", "insectoid", "ogroid"]);
/** The metal that bypasses monster resistance under the world's selected rules. */
export function monsterMaterial(actor) {
  if (bookMonstersEnabled() && actor.type === "npc" && !creatureHumanForm(actor)
    && METEORITE_CATEGORIES.has(actor.system.creature?.category)) return "meteorite";
  return monsterResistant(actor) ? "silver" : null;
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
 * `monsterMaterial` selects the effective resistance; legacy `monster: true` means silver.
 */
export function resolveDamage({ base, silver = 0, location, multiplier, traits, armor, monster = false,
  monsterMaterial = monster ? "silver" : null, vulnerableToFire = false, critical = null, extra = null }) {
  const steps = [], note = (label, value, detail = "") => steps.push({ label, value, detail });
  const fire = traits.types.includes("elemental");
  const physical = traits.physical ?? !fire;
  if (armor.incorporeal && physical) return { total: 0, steps: [{ label: "Бесплотность: физическая атака не действует", value: 0 }],
    penetrated: false, ablate: [], location, immune: true };
  if (armor.fireImmune && fire && !physical) return { total: 0, steps: [{ label: "Невосприимчивость к огню", value: 0 }],
    penetrated: false, ablate: [], location, immune: true };
  const silverApplies = monsterMaterial === "silver" && silver > 0;
  let damage = base + (silverApplies ? silver : 0);
  note("Бросок урона", base, traits.types.map(type => DAMAGE_TYPE_NAMES[type]).join(" / "));
  if (silverApplies) note("Серебро против чудовища", `+${silver}`);
  // A sword oil against its monster class (core p.248) adds to the weapon damage before armor.
  for (const bonus of [extra].flat().filter(entry => entry?.value)) { damage += bonus.value; note(bonus.label, `+${bonus.value}`, bonus.detail ?? ""); }
  const sp = traits.piercing === "improved" ? Math.floor(armor.sp / 2) : armor.sp;
  if (armor.sp) note(traits.piercing === "improved" ? "ПБ (улучшенное пробивание: ½)" : "ПБ брони", `−${sp}`, armor.layers.map(layer => `${layer.name} ${layer.sp}`).join(", "));
  damage = Math.max(0, damage - sp);
  const penetrated = damage > 0;
  // Core p.155 (errata «Staged Penetration»): only a hit that gets through wears the armor, every layer by 1.
  if (armor.sp) note(penetrated ? "Броня пробита: ПБ −1" : "Броня выдержала: ПБ не снижается", "", penetrated ? armor.layers.map(layer => layer.name).join(", ") : "");
  const resisted = penetrated && traits.types.length > 0 && traits.types.every(type => armor.resistances.includes(type));
  if (resisted && traits.piercing === "none") { damage = Math.floor(damage / 2); note("Сопротивление урону", "½", traits.types.map(type => DAMAGE_TYPE_NAMES[type]).join("/")); }
  else if (resisted) note("Сопротивление урону", "игнорируется", "пробивающее броню");
  if (multiplier !== 1) { damage = Math.floor(damage * multiplier); note("Зона попадания", `×${multiplier === 0.5 ? "½" : multiplier}`); }
  if (monsterMaterial && !traits[monsterMaterial] && !fire && damage > 0) {
    damage = Math.floor(damage / 2);
    note(monsterMaterial === "meteorite" ? "Чудовище: не метеоритная сталь" : "Чудовище: не серебро", "½");
  }
  if (vulnerableToFire && fire && damage > 0) { damage *= 2; note("Уязвимость к огню", "×2"); }
  if (critical) { damage += critical.bonus; note(`Критическое ранение: ${critical.name.toLocaleLowerCase("ru")}`, `+${critical.bonus}`, "броня не блокирует"); }
  return { total: damage, steps, penetrated, ablate: penetrated ? [armor.ablate ?? []].flat() : [], location };
}
