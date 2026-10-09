import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { fullTurnStart } from "../combat/full-turn-rules.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { SKILL_KEYS } from "../data/skills.mjs";
import { hexIdentification } from "./rules.mjs";

// What a piece of magic does to a target that failed its defense (or did not defend), read from its effect text
// (core pp.102–115 and the invocations). Chances are percentages; `blind` is the duration in rounds.
const HIT = {
  "spell.blinding-dust": { blind: "1d10" }, "spell.korath-breath": { blind: "1d6" }, "spell.magic-flare": { blind: "1d6" },
  "spell.aenye": { burning: 75 }, "spell.alzur-thunder": { burning: 75 }, "spell.storm": { burning: 75 }, "spell.melgar-fire": { burning: 75 },
  "spell.fire-stream": { burning: 50 }, "spell.flaming-vortex": { burning: 50 }, "spell.tanio-ilchar": { burning: 100 },
  "spell.seirff-haul": { burning: 100 }, "invocation.cleansing-fire": { burning: 100 },
  "spell.carys-hail": { frozen: 25 }, "spell.waves-naglfar": { frozen: 100 }, "spell.rhewi": { frozen: 100 }, "spell.tryferi-gaeaf": { frozen: 100 },
  "spell.suffocate": { staggered: 100 },
  "sign.igni": { burning: 50 }, "sign.firestream": { burning: 75 },
  // Aard: the wave staggers; 10% per Stamina spent to knock down (core p.114).
  "sign.aard": { staggered: 100, pronePerPower: 10 }, "sign.aard-sweep": { staggered: 100, pronePerPower: 10 },
  // Axii: a Stun save at −1 for the first point and −1 per two more, at most −4 is implied by the 7-point cap.
  "sign.axii": { stunSave: power => -(1 + Math.floor((Math.max(1, power) - 1) / 2)) },
  "invocation.web-lies": { stunned: true },
  "invocation.cursed-illness": { tiers: [[6, "poisoned"], [4, "stunned"], [2, "staggered"]] },
  // Lasting control or mind effects: a marker with the spell's own text, removed by the GM or by its end.
  "spell.mind-manipulation": { marker: true }, "spell.mental-command": { marker: true }, "spell.talfryn-prison": { marker: true },
  "sign.puppet": { marker: true, roundsPerPower: true }, "invocation.light-truth": { marker: true }, "invocation.blood-boil": { marker: true },
  // Hexes (core pp.120–121): the victim resists with Resist Magic; a failure leaves the hex until it is lifted.
  "hex.shadows": { hex: true }, "hex.devils-luck": { hex: true }, "hex.nightmare": { hex: true }, "hex.pestas-kiss": { hex: true }, "hex.beast": { hex: true },
  // Eternal Itch: −1 to every action. Attacks and defenses are skill checks, so every skill and attribute check gets −1.
  "hex.eternal-itch": { hex: true, modifiers: [...SKILL_KEYS.map(key => [`skills.${key}`, -1]), ["attributeCheck", -1]] }
};
// Damage that grows with the Stamina put into a sign (core p.114): Igni and Firestream deal 1d6 per point.
const PER_POWER = { "sign.igni": "d6", "sign.firestream": "d6" };

export const spellHitProfile = system => HIT[system?.ruleId] ?? null;
export function spellStrikeDamage(system, power = 0) {
  const die = PER_POWER[system?.ruleId];
  return die && power > 0 ? `${power}${die}` : system?.damage ?? "";
}

const timed = (actor, id, rounds, extra = {}) => {
  const source = conditionSource(CONDITION_BY_ID[id], text => globalThis.game?.i18n?.localize?.(text) ?? text); delete source._id;
  return foundry.utils.mergeObject(source, { ...(rounds ? { start: fullTurnStart(actor), duration: { value: rounds, units: "rounds", expiry: "turnEnd", expired: false } } : {}), ...extra });
};
const roll = async formula => (await new foundry.dice.Roll(formula).evaluate()).total;
const statusIcon = { burning: "горит", frozen: "заморожен", staggered: "ошеломлён", stunned: "дезориентирован", prone: "сбит с ног", poisoned: "отравлен", blinded: "ослеплён" };

/**
 * Roll and create the hit effects of a spell on one target. Immunities are respected. Returns notes for the card.
 * `power` is the Stamina put into a sign before focus.
 */
export async function applySpellHit(actor, attack) {
  const profile = HIT[attack?.ruleId], notes = [], effects = [];
  if (!profile || !actor) return { notes, effects };
  const power = Number(attack.power) || 1;
  const chance = async (id, percent, label = statusIcon[id]) => {
    if (!percent) return;
    if (immuneToCondition(actor, [id])) { notes.push(`${label}: иммунитет`); return; }
    const value = percent >= 100 ? null : await roll("1d100");
    if (value === null || value <= percent) { effects.push(id === "staggered" ? staggered(actor) : timed(actor, id, 0)); notes.push(value === null ? label : `${label} (${value} ≤ ${percent}%)`); }
    else notes.push(`не ${label} (${value} > ${percent}%)`);
  };
  for (const id of ["burning", "frozen", "staggered", "poisoned"]) await chance(id, profile[id]);
  if (profile.pronePerPower) await chance("prone", Math.min(100, profile.pronePerPower * power));
  if (profile.blind) {
    if (immuneToCondition(actor, ["blinded"])) notes.push("слепота: иммунитет");
    else { const rounds = await roll(profile.blind); effects.push(timed(actor, "blinded", rounds)); notes.push(`ослеплён на ${rounds} раунд.`); }
  }
  if (profile.stunned) await chance("stunned", 100);
  if (profile.tiers) { const tier = profile.tiers.find(([min]) => power >= min); if (tier) await chance(tier[1], 100); }
  if (profile.stunSave) {
    const modifier = profile.stunSave(power), stun = actor.system?.statistics?.stun ?? 0, target = Math.max(0, stun + modifier);
    if (immuneToCondition(actor, ["stunned"])) notes.push("дезориентация: иммунитет");
    else {
      const value = await roll("1d10");
      if (value < target) notes.push(`испытание УСТ ${value} (нужно меньше ${target}, штраф ${modifier}): устоял`);
      else { effects.push(timed(actor, "stunned", 0)); notes.push(`испытание УСТ ${value} (нужно меньше ${target}, штраф ${modifier}): дезориентирован`); }
    }
  }
  if (profile.hex) {
    effects.push(hexEffect(attack, profile));
    notes.push(`порча «${attack.name}» наложена`);
  }
  if (profile.marker) {
    const rounds = profile.roundsPerPower ? power : 0;
    effects.push({ name: attack.name ?? "Магия", img: "icons/svg/aura.svg", type: "base", description: attack.spellText ?? "",
      ...(attack.spellUuid ? { origin: attack.spellUuid } : {}),
      ...(rounds ? { start: fullTurnStart(actor), duration: { value: rounds, units: "rounds", expiry: "turnEnd", expired: false } } : {}),
      flags: { [SYSTEM_ID]: { spellMarker: attack.ruleId } } });
    notes.push(`под действием «${attack.name}»${rounds ? ` на ${rounds} раунд.` : ""}`);
  }
  if (effects.length) await actor.createEmbeddedDocuments("ActiveEffect", effects);
  return { notes, effects };
}
/** A hex stays until it is lifted: its text, the lifting ritual and the identification DCs (core p.121). */
export function hexEffect(attack, profile = HIT[attack?.ruleId] ?? {}) {
  const [education, training] = hexIdentification(attack.hex?.danger);
  const escape = value => String(value ?? "").replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
  return { name: `Порча: ${attack.name}`, img: "icons/svg/skull.svg", type: "base", ...(attack.spellUuid ? { origin: attack.spellUuid } : {}),
    description: `${attack.spellText ?? ""}${attack.hex?.lifting ? `<p><b>Снятие:</b> ${escape(attack.hex.lifting)}</p>` : ""}`
      + `<p>Опознать порчу и способ снятия: Образование СЛ ${education} или Подготовка ведьмака СЛ ${training}. Порча действует, пока её не снимут.</p>`
      + (attack.spellUuid ? `<p>Источник: @UUID[${attack.spellUuid}]{${escape(attack.name)}}</p>` : ""),
    flags: { [SYSTEM_ID]: { hexEffect: attack.ruleId, condition: { modifiers: (profile.modifiers ?? []).map(([target, value]) => ({ target, value })) } } } };
}
const staggered = actor => timed(actor, "staggered", 0, { start: fullTurnStart(actor), duration: { value: 1, units: "rounds", expiry: "turnStart", expired: false } });

// Effects a successful cast puts on the caster (core p.114 signs; p.102 Glamour; invocations).
const SELF = {
  "sign.quen": { shield: power => 5 * power, rounds: 10 },
  "sign.active-shield": { shield: power => 10 * power, sustained: true },
  "spell.glamour": { modifiers: [["skills.seduction", 3], ["skills.charisma", 3], ["skills.leadership", 3]], hours: "1d6" },
  "invocation.blessing-love": { modifiers: [["skills.charisma", 3], ["skills.seduction", 3]] }
};
// Effects a cast gives to chosen allies without a defense.
const BUFF = {
  "invocation.animal-strength": { modifiers: [["meleeDamage", 2], ["attributes.intelligence", -2]] },
  "spell.magic-healing": { heal: 3 },
  "invocation.healing-blessing": { heal: 3, sustained: true }
};
export const selfEffectOf = system => SELF[system?.ruleId] ?? null;
export const buffOf = system => BUFF[system?.ruleId] ?? null;

/** The ActiveEffect of a self or ally effect; `spell` is the cast item, `power` the Stamina before focus. */
export async function castEffectSource(actor, spell, definition, power = 1) {
  const s = spell.system, rounds = definition.rounds ?? 0;
  const hours = definition.hours ? await roll(definition.hours) : 0;
  const duration = definition.sustained ? {} : hours ? { seconds: hours * 3600 }
    : rounds ? { value: rounds, units: "rounds", expiry: "turnEnd", expired: false }
    : s.duration?.kind === "rounds" && s.duration.formula ? { value: await roll(s.duration.formula), units: "rounds", expiry: "turnEnd", expired: false } : {};
  const shield = definition.shield ? definition.shield(power) : 0;
  const lasting = hours ? `${hours} ч.` : duration.value ? `${duration.value} раунд.` : definition.sustained ? "пока поддерживается" : "";
  const text = String(s.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return { name: shield ? `${spell.name} (щит ${shield}/${shield})` : spell.name, img: spell.img || "icons/svg/aura.svg", type: "base", origin: spell.uuid,
    description: `<p>${text}</p>${definition.heal ? `<p>В начале каждого хода восстанавливает ${definition.heal} ПЗ, пока действует магия.</p>` : ""}${shield ? `<p>Щит поглощает ${shield} урона от атак до того, как он дойдёт до ПЗ; при 0 исчезает.</p>` : ""}${lasting ? `<p>Длительность: ${lasting}.</p>` : ""}<p>Источник: @UUID[${spell.uuid}]{${spell.name}}</p>`,
    ...(duration.value || duration.seconds ? { start: fullTurnStart(actor), duration } : {}),
    flags: { [SYSTEM_ID]: { castEffect: { ruleId: s.ruleId, spellId: spell.id, caster: spell.parent?.uuid ?? "", sustained: Boolean(definition.sustained) },
      ...(shield ? { magicShield: { hp: shield, max: shield, name: spell.name } } : {}),
      ...(definition.heal ? { magicHealing: definition.heal } : {}),
      condition: { modifiers: (definition.modifiers ?? []).map(([target, value]) => ({ target, value })) } } } };
}

/** Put the self effect of a successful cast on the caster, replacing an earlier copy of the same magic. */
export async function applySelfEffect(actor, spell, power) {
  const definition = selfEffectOf(spell?.system);
  if (!definition || typeof actor?.createEmbeddedDocuments !== "function") return null;
  const previous = Array.from(actor.effects).filter(effect => effect.flags?.[SYSTEM_ID]?.castEffect?.ruleId === spell.system.ruleId).map(effect => effect.id);
  if (previous.length) await actor.deleteEmbeddedDocuments("ActiveEffect", previous);
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [await castEffectSource(actor, spell, definition, power)]);
  return effect;
}

/** Quen / Active Shield: the shield takes attack damage first (core p.114). Returns what it soaked. */
export function magicShieldPlan(actor, total) {
  const shields = Array.from(actor?.effects ?? []).filter(effect => !effect.disabled && effect.flags?.[SYSTEM_ID]?.magicShield?.hp > 0);
  let left = Math.max(0, total), absorbed = 0;
  const updates = [], deletes = [];
  for (const effect of shields) {
    if (!left) break;
    const shield = effect.flags[SYSTEM_ID].magicShield, take = Math.min(shield.hp, left), hp = shield.hp - take;
    left -= take; absorbed += take;
    if (hp <= 0) deletes.push(effect.id);
    else updates.push({ _id: effect.id, name: `${shield.name} (щит ${hp}/${shield.max})`, [`flags.${SYSTEM_ID}.magicShield.hp`]: hp });
  }
  return { absorbed, remaining: left, updates, deletes };
}
export async function absorbWithMagicShield(actor, total) {
  const plan = magicShieldPlan(actor, total);
  if (plan.updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", plan.updates);
  if (plan.deletes.length) await actor.deleteEmbeddedDocuments("ActiveEffect", plan.deletes);
  return plan;
}

/** A sustained effect (Active Shield, Blessing of Healing) ends with its caster's concentration. */
export function endedSustainedEffects(holder, caster = holder) {
  const held = caster?.system?.magic?.sustainedId;
  return Array.from(holder?.effects ?? []).filter(effect => {
    const flag = effect.flags?.[SYSTEM_ID]?.castEffect;
    return flag?.sustained && (flag.caster || holder?.uuid) === caster?.uuid && flag.spellId !== held;
  }).map(effect => effect.id);
}

/** Healing or a boon for the chosen tokens (T), or the caster when nothing is targeted. */
export async function applyBuff(caster, spell, power, targets) {
  const definition = buffOf(spell?.system);
  if (!definition) return [];
  const recipients = targets.length ? targets : [caster];
  const done = [], refused = [];
  for (const actor of recipients) {
    if (!actor?.isOwner) { refused.push(actor?.name ?? "?"); continue; }
    const previous = Array.from(actor.effects).filter(effect => effect.flags?.[SYSTEM_ID]?.castEffect?.ruleId === spell.system.ruleId).map(effect => effect.id);
    if (previous.length) await actor.deleteEmbeddedDocuments("ActiveEffect", previous);
    await actor.createEmbeddedDocuments("ActiveEffect", [await castEffectSource(actor, spell, definition, power)]);
    done.push(actor.name);
  }
  if (refused.length) globalThis.ui?.notifications?.warn?.(`Нет прав на ${refused.join(", ")}: пусть эффект наложит ведущий.`);
  return done;
}

export function registerSpellEffects() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const cast = message.flags?.[SYSTEM_ID]?.magicCast, actor = message.speakerActor, spell = actor?.items.get(cast?.spellId);
    if (!spell || cast.maintenance || cast.fumble?.failed || !buffOf(spell.system) || !actor.isOwner || message.isContentVisible === false) return;
    const box = document.createElement("div");
    box.className = "witcher-spell-target";
    box.innerHTML = `<button type="button"><i class="fa-solid fa-hand-holding-heart"></i> Наложить на выбранные цели (T)</button><small>Без выбранных целей — на заклинателя. Цель не защищается.</small>`;
    box.querySelector("button").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        const targets = Array.from(game.user.targets ?? [], token => token.actor).filter(Boolean);
        const done = await applyBuff(actor, spell, cast.powerCost ?? spell.system.cost, targets);
        if (done.length) ui.notifications.info(`${spell.name}: ${done.join(", ")}.`);
      } catch (error) { ui.notifications.warn(error.message); }
      finally { event.currentTarget.disabled = false; }
    });
    (html.querySelector(".message-content") ?? html).append(box);
  });
  Hooks.on("updateActor", (caster, changes) => {
    if (!foundry.utils.hasProperty(changes, "system.magic.sustainedId") || !game.users.activeGM?.isSelf) return;
    const holders = new Set(game.actors);
    for (const scene of game.scenes) for (const token of scene.tokens) if (!token.actorLink && token.actor) holders.add(token.actor);
    for (const holder of holders) {
      const ids = endedSustainedEffects(holder, caster);
      if (ids.length) holder.deleteEmbeddedDocuments("ActiveEffect", ids).catch(() => {});
    }
  });
}
