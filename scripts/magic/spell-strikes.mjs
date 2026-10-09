import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { attackerToken, tokenGap, tokenDocument } from "../combat/attack-target.mjs";
import { SPELL_DEFENSES } from "../data/spells.mjs";
import { createYrdenZone, spellMentalImmunity } from "../combat/creature-spirits.mjs";
import { spellDamageWithGlyph } from "../data/rune-glyphs.mjs";
import { furyTargetError } from "../combat/experimental-effects.mjs";
import { spellArea } from "./spell-areas.mjs";
import { spellStrikeDamage } from "./spell-effects.mjs";

// Core p.168 «Выбор целей для магии»: a direct spell works like a ranged attack against each target; an area
// spell makes everyone in it defend against the same casting check; with no defense (or a willing target) the
// spell only needs a casting check without a magical fumble. Each target gets its own strike card that reads
// the casting roll of the source message, so Luck spent on that roll counts for every target.
export const SPELL_DEFENSE_MODES = { dodge: ["dodge", "reposition"], block: ["block"], resistMagic: ["resist"], spellCasting: ["counter"] };

/** Defense buttons and the DC of «Не защищается» for a spell's printed defenses. */
export function spellDefenses(system) {
  const listed = system.defense ?? ["none"];
  const defenses = [...new Set(listed.flatMap(key => SPELL_DEFENSE_MODES[key] ?? []))];
  // With defenses, an undefended target is treated like an unaware target of a ranged attack (distance DC + size).
  const unaware = listed.includes("willTriple") ? { willTriple: true } : defenses.length ? null
    : { dc: 0, note: listed.includes("gm") ? "СЛ определяет ведущий; без защиты — срабатывает без магического провала" : "срабатывает без магического провала" };
  return { defenses, unaware, label: listed.map(key => SPELL_DEFENSES[key]).join(" / ") };
}

// Core p.166 «Магические ранения»: magic that works through a physical force (wind, ice, stone) can cause
// critical wounds like a weapon. Fire and pure (mixed) magic are treated as non-physical here.
const PHYSICAL = new Set(["earth", "air", "water"]);
const ELECTRICITY = new Set(["spell.static-storm", "spell.alzur-thunder", "spell.storm"]);
export const spellTraits = (element, ruleId = "") => ({ types: element === "fire" ? ["elemental"] : [], physical: PHYSICAL.has(element) && !ELECTRICITY.has(ruleId),
  electricity: ELECTRICITY.has(ruleId), piercing: "none", silver: false, silverDice: "", nonLethal: false });

/** Spells that act on others: anything but «на себя». */
export const targetsOthers = system => !["self"].includes(system.range?.kind);

// These spells have a distance to a placed area or a line, rather than a radius in the Range field.
const DISTANT_AREAS = new Set(["spell.tanio-ilchar","spell.curse-sedna","spell.ice-slick","spell.stammelford-tremor","spell.alzur-thunder"]);
export function furySpellTargetError(actor,item,targets=Array.from(globalThis.game?.user?.targets??[])) {
  const system=item.system;
  const offensive=Boolean(system.damage)||(system.defense??[]).some(kind=>["dodge","block","resistMagic","willTriple"].includes(kind));
  if(!offensive||!targetsOthers(system)||["radius","cone"].includes(system.range?.kind)||DISTANT_AREAS.has(system.ruleId))return "";
  return Array.from(targets).map(tokenDocument).map(target=>furyTargetError(actor,target)).find(Boolean)??"";
}

/** The weaponAttack flags of a spell against one token; `spellSource` is set on extra cards only. */
export function strikeAttack(item, caster, target, { total = null, spellSource = null, glyph = null, effectDC = 0, adrenalineDice = 0, power = 0 } = {}) {
  const system = item.system, { defenses, unaware } = spellDefenses(system);
  // Igni and Firestream deal 1d6 per Stamina put into the sign (core p.114).
  const damage=spellDamageWithGlyph(spellStrikeDamage(system,power),glyph??{});
  return { itemId: item.id, name: item.name, mode: "spell", spell: true, unarmed: null, nonLethal: false, special: null,
    charge: false, push: false, dual: false, base: total, count: 1, damage, adrenalineDice, location: "random", multiplier: 1, body: 0, bonus: 0,
    target: target.uuid, attacker: caster.uuid, parts: [], ranged: true, band: "normal", dc: null, thrown: false,
    combat: game.combat?.started ? { id: game.combat.id, round: game.combat.round } : null, strike: 0, damageTypes: "",
    ...(spellSource ? { spellSource } : {}), glyph, effectDC, defenses, ruleId: system.ruleId ?? "", power: power || system.cost || 1, spellUuid: item.uuid ?? "",
    spellText: String(system.description ?? ""), blockable: (system.defense ?? []).includes("block"), ...(unaware ? { unaware } : {}), traits: spellTraits(system.element, system.ruleId),
    noCritical: !spellTraits(system.element, system.ruleId).physical || (!defenses.length && !unaware?.willTriple) };
}

/** Spell casts that can still reach targets: a spell, sign or invocation that did not fail, aimed at others. */
export function strikeable(message) {
  if (message.isContentVisible === false) return null;
  const cast = message.flags?.[SYSTEM_ID]?.magicCast, item = message.speakerActor?.items.get(cast?.spellId);
  if (!cast || cast.maintenance || ["ritual", "hex"].includes(cast.kind) || cast.fumble?.failed || !item || !targetsOthers(item.system)) return null;
  return item;
}

/**
 * Targets of the cast in `source`. The first target defends right on the casting card (like a weapon attack);
 * every further target gets its own card that reads the casting check from the source.
 */
export async function createSpellStrikes(actor, item, source, { total = null } = {}) {
  if (!actor.isOwner || source.isContentVisible === false) throw new Error("Нет доступа к результату сотворения.");
  const system = item.system, targets = Array.from(game.user.targets ?? []).map(tokenDocument);
  const frenzy=furySpellTargetError(actor,item,targets);if(frenzy)throw new Error(frenzy);
  const {glyph=null,effectDC=0,adrenalineDice=0,powerCost:power=0}=source.flags?.[SYSTEM_ID]?.magicCast??{};
  if(system.ruleId === "sign.yrden") {
    const caster = attackerToken(actor);
    const power = source.flags?.[SYSTEM_ID]?.magicCast?.powerCost ?? system.cost ?? 1;
    const zone = await createYrdenZone(actor, caster, source, power);
    return { created: 1, skipped: [], zone };
  }
  if (!targets.length || !targetsOthers(system)) return { created: 0, skipped: [] };
  let caster;
  try { caster = attackerToken(actor); } catch { ui.notifications.warn("Нет токена заклинателя на сцене: цели не назначены."); return { created: 0, skipped: [] }; }
  const { label } = spellDefenses(system), skipped = [];
  const reach = ["distance", "selfOrDistance"].includes(system.range?.kind) ? system.range.value : null;
  const valid = [];
  for (const target of targets) {
    if (!target.actor || target.parent?.id !== caster.parent?.id) { skipped.push(`${target.name}: на другой сцене`); continue; }
    const immunity = spellMentalImmunity(target.actor, system);
    if(immunity) { skipped.push(`${target.name}: ${immunity}`); continue; }
    const distance = target.uuid === caster.uuid ? 0 : tokenGap(caster, target);
    if (reach && distance != null && distance > reach) { skipped.push(`${target.name}: ${distance} м — дальше дистанции ${reach} м`); continue; }
    valid.push({ target, distance });
  }
  let created = 0;
  for (const [index, { target, distance }] of valid.entries()) {
    if (index === 0 && !source.flags?.[SYSTEM_ID]?.weaponAttack) {
      await source.update({ [`flags.${SYSTEM_ID}.weaponAttack`]: strikeAttack(item, caster, target, { total, glyph, effectDC, adrenalineDice, power }) });
      created++; continue;
    }
    const content = `<section class="witcher-attack-chat witcher-spell-strike"><h3><i class="fa-solid fa-wand-sparkles"></i> ${esc(item.name)} → ${esc(target.name)}</h3>`
      + `<p>Проверка сотворения — из сообщения выше${total != null ? ` (${total})` : ""}. Защита: ${esc(label)}.</p>`
      + (distance != null && target.uuid !== caster.uuid ? `<small>Расстояние ${distance} м${reach ? ` из ${reach} м` : ""}.</small>` : "") + `</section>`;
    await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content,
      whisper: [...(source.whisper ?? [])], blind: Boolean(source.blind),
      flags: { [SYSTEM_ID]: { skipLuck: true, weaponAttack: strikeAttack(item, caster, target, { total, spellSource: source.id, glyph, effectDC, power }) } } });
    created++;
  }
  if (skipped.length) ui.notifications.warn(`Не все цели: ${skipped.join("; ")}.`);
  return { created, skipped };
}

/** A button on a cast with no targets yet: choose targets (T) after the roll and send the spell at them. */
export function registerSpellStrikes() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const item = strikeable(message);
    // Area magic gets the «Разместить область» button from spell-areas.mjs instead.
    if (!item || message.flags[SYSTEM_ID]?.weaponAttack || !message.speakerActor?.isOwner || spellArea(item.system)) return;
    const yrden = item.system.ruleId === "sign.yrden";
    if (yrden && (message.flags[SYSTEM_ID].yrdenRegion || message.flags[SYSTEM_ID].yrdenRequest)) return;
    const box = document.createElement("div");
    box.className = "witcher-spell-target";
    box.innerHTML = yrden ? `<button type="button"><i class="fa-solid fa-circle"></i> Разместить круг Ирдена</button><small>Выделите токен заклинателя: круг радиусом 3 м останется на месте на 5 раундов.</small>`
      : `<button type="button"><i class="fa-solid fa-crosshairs"></i> Атаковать выбранные цели (T)</button><small>Выберите цели клавишей T: каждая защищается от этой проверки (${esc(spellDefenses(item.system).label)}).</small>`;
    box.querySelector("button").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        if (!yrden && !game.user.targets.size) throw new Error("Сначала выберите цели клавишей T.");
        await createSpellStrikes(message.speakerActor, item, message, { total: message.rolls[0]?.total ?? null });
      } catch (error) { ui.notifications.warn(error.message); event.currentTarget.disabled = false; }
    });
    (html.querySelector(".message-content") ?? html).append(box);
  });
}
