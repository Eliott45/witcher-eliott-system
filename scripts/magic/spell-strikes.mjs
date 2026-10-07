import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { attackerToken, tokenGap, tokenDocument } from "../combat/attack-target.mjs";
import { SPELL_DEFENSES } from "../data/spells.mjs";

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
export const spellTraits = element => ({ types: element === "fire" ? ["elemental"] : [], piercing: "none", silver: false, silverDice: "", nonLethal: false });

/** Spells that act on others: anything but «на себя». */
export const targetsOthers = system => !["self"].includes(system.range?.kind);

/** The weaponAttack flags of a spell against one token; `spellSource` is set on extra cards only. */
export function strikeAttack(item, caster, target, { total = null, spellSource = null } = {}) {
  const system = item.system, { defenses, unaware } = spellDefenses(system);
  return { itemId: item.id, name: item.name, mode: "spell", spell: true, unarmed: null, nonLethal: false, special: null,
    charge: false, push: false, dual: false, base: total, count: 1, damage: system.damage || null, location: "random", multiplier: 1, body: 0, bonus: 0,
    target: target.uuid, attacker: caster.uuid, parts: [], ranged: true, band: "normal", dc: null, thrown: false,
    combat: game.combat?.started ? { id: game.combat.id, round: game.combat.round } : null, strike: 0, damageTypes: "",
    ...(spellSource ? { spellSource } : {}), defenses, ...(unaware ? { unaware } : {}), traits: spellTraits(system.element),
    noCritical: !PHYSICAL.has(system.element) || (!defenses.length && !unaware?.willTriple) };
}

/** Spell casts that can still reach targets: a spell, sign or invocation that did not fail, aimed at others. */
export function strikeable(message) {
  const cast = message.flags?.[SYSTEM_ID]?.magicCast, item = message.speakerActor?.items.get(cast?.spellId);
  if (!cast || cast.maintenance || ["ritual", "hex"].includes(cast.kind) || cast.fumble?.failed || !item || !targetsOthers(item.system)) return null;
  return item;
}

/**
 * Targets of the cast in `source`. The first target defends right on the casting card (like a weapon attack);
 * every further target gets its own card that reads the casting check from the source.
 */
export async function createSpellStrikes(actor, item, source, { total = null } = {}) {
  const system = item.system, targets = Array.from(game.user.targets ?? []).map(tokenDocument);
  if (!targets.length || !targetsOthers(system)) return { created: 0, skipped: [] };
  let caster;
  try { caster = attackerToken(actor); } catch { ui.notifications.warn("Нет токена заклинателя на сцене: цели не назначены."); return { created: 0, skipped: [] }; }
  const { label } = spellDefenses(system), skipped = [];
  const reach = ["distance", "selfOrDistance"].includes(system.range?.kind) ? system.range.value : null;
  const valid = [];
  for (const target of targets) {
    if (!target.actor || target.parent?.id !== caster.parent?.id) { skipped.push(`${target.name}: на другой сцене`); continue; }
    const distance = target.uuid === caster.uuid ? 0 : tokenGap(caster, target);
    if (reach && distance != null && distance > reach) { skipped.push(`${target.name}: ${distance} м — дальше дистанции ${reach} м`); continue; }
    valid.push({ target, distance });
  }
  let created = 0;
  for (const [index, { target, distance }] of valid.entries()) {
    if (index === 0 && !source.flags?.[SYSTEM_ID]?.weaponAttack) {
      await source.update({ [`flags.${SYSTEM_ID}.weaponAttack`]: strikeAttack(item, caster, target, { total }) });
      created++; continue;
    }
    const content = `<section class="witcher-attack-chat witcher-spell-strike"><h3><i class="fa-solid fa-wand-sparkles"></i> ${esc(item.name)} → ${esc(target.name)}</h3>`
      + `<p>Проверка сотворения — из сообщения выше${total != null ? ` (${total})` : ""}. Защита: ${esc(label)}.</p>`
      + (distance != null && target.uuid !== caster.uuid ? `<small>Расстояние ${distance} м${reach ? ` из ${reach} м` : ""}.</small>` : "") + `</section>`;
    await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content,
      flags: { [SYSTEM_ID]: { skipLuck: true, weaponAttack: strikeAttack(item, caster, target, { total, spellSource: source.id }) } } });
    created++;
  }
  if (skipped.length) ui.notifications.warn(`Не все цели: ${skipped.join("; ")}.`);
  return { created, skipped };
}

/** A button on a cast with no targets yet: choose targets (T) after the roll and send the spell at them. */
export function registerSpellStrikes() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const item = strikeable(message);
    if (!item || message.flags[SYSTEM_ID]?.weaponAttack || !message.speakerActor?.isOwner) return;
    const box = document.createElement("div");
    box.className = "witcher-spell-target";
    box.innerHTML = `<button type="button"><i class="fa-solid fa-crosshairs"></i> Атаковать выбранные цели (T)</button><small>Выберите цели клавишей T: каждая защищается от этой проверки (${esc(spellDefenses(item.system).label)}).</small>`;
    box.querySelector("button").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        if (!game.user.targets.size) throw new Error("Сначала выберите цели клавишей T.");
        await createSpellStrikes(message.speakerActor, item, message, { total: message.rolls[0]?.total ?? null });
      } catch (error) { ui.notifications.warn(error.message); event.currentTarget.disabled = false; }
    });
    (html.querySelector(".message-content") ?? html).append(box);
  });
}
