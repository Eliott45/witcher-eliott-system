import { dropItemToGround } from "../loot/loot.mjs";
import { scatterOffset } from "../canvas/scatter-overlay.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { trackRollDisplay, waitsForDice, diceSyncEnabled } from "../chat/roll-display.mjs";
import { rollStun } from "./stun-roll.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { woundEffectData } from "./critical-wound-effects.mjs";
import { modifierTotal } from "../data/background-modifiers.mjs";
import { GRAPPLE_ACTIONS, applyGrappleSuccess, grappleState } from "./grapple.mjs";
import { fumbleMagnitude, fumbleOutcome } from "../data/fumbles.mjs";
import { attackConcealed, creatureDetailsHidden, enemyAttackHidden, creatureDetailsSecret } from "../chat/concealment.mjs";
import { defenseQuote, rollDefense } from "./defense-rolls.mjs";
import { hitLocation, bodyPlanOf, ATTACK_LOCATIONS, weaponAttack, attackModes } from "./weapon-rules.mjs";
import { weaponDamageTraits, armorAt, monsterResistant, fireVulnerable, criticalLevel, resolveDamage } from "./damage-rules.mjs";
import { criticalWoundByRoll, aimedCriticalRoll, ORGAN_WOUNDS, ANATOMY_FREE_BONUS } from "../data/critical-wounds.mjs";

// One weapon attack card hosts the whole exchange: each attack roll gets its own defense, location, damage and
// application. Those are separate messages written by whoever owns that step (no cross-owner edits);
// they link back to the attack and are folded out of the log once the card can show them.

const flagsOf = message => message?.flags?.[SYSTEM_ID] ?? {};
const exchangeOf = message => flagsOf(message).exchange;
const linkedAny = (attackId, index, kind) => game.messages.find(message => {
  const link = exchangeOf(message);
  return link?.attack === attackId && link.index === index && link.kind === kind;
});
// Dice So Nice marks a message while its dice are in the air; the card waits so the result is not spoiled.
// A stalled animation (minimised window, lost focus) must not hide the result forever.
const rolling = message => diceSyncEnabled() && Boolean(message?._dice3danimating) && !message._witcherSettled && Date.now() - (message.timestamp ?? 0) < 12000;
const linked = (attackId, index, kind) => { const message = linkedAny(attackId, index, kind); return rolling(message) ? null : message; };
const targetToken = attack => attack?.target ? globalThis.canvas?.scene?.tokens.find(token => token.uuid === attack.target) ?? fromUuidSync(attack.target) : null;
const targetActor = attack => targetToken(attack)?.actor ?? null;
const anatomyFree = actor => ["specter", "elemental"].includes(actor?.system.creature?.category);
const DC_UNAWARE = 10;

async function post(data, mode = game.settings.get("core", "messageMode")) {
  const Message = foundry.documents.ChatMessage.implementation;
  return Message.create(Message.applyMode(data, mode));
}

/**
 * Core p.153 «Объединение сил» (errata v4): −1 to defense for every melee attacker beyond the first.
 * Counts distinct attackers who struck this target in melee during the same combat round, up to this attack.
 */
export function gangingUp(message) {
  const attack = flagsOf(message).weaponAttack;
  if (!attack?.combat || attack.ranged) return 0;
  const attackerOf = (entry, data) => data.attacker ?? entry.speakerActor?.uuid ?? entry.id;
  const attackers = new Set(game.messages.filter(entry => {
    const data = flagsOf(entry).weaponAttack;
    return data && !data.ranged && data.target === attack.target && data.combat?.id === attack.combat.id
      && data.combat.round === attack.combat.round && entry.timestamp <= message.timestamp;
  }).map(entry => attackerOf(entry, flagsOf(entry).weaponAttack)));
  attackers.add(attackerOf(message, attack));
  return Math.max(0, attackers.size - 1);
}

/** Defenses the target can choose for one incoming attack, best armed option per mode. */
export function defenseChoices(actor, incoming, defenseModifier = 0, allowed = null) {
  if (allowed) return allowed.map(mode => ({ ...defenseQuote(actor, { mode, itemId: "", incoming, defenseModifier }), mode, itemId: "" }));
  // One button per weapon or shield so the defender chooses what takes the blow, plus bare-handed options.
  const items = equippedItems(actor.items).filter(item => item.type === "weapon" && ["melee", "shield"].includes(item.system.category));
  const options = [{ mode: "dodge" }, { mode: "reposition" },
    ...items.map(item => ({ mode: "block", itemId: item.id })), { mode: "block", itemId: "" },
    ...items.map(item => ({ mode: "parry", itemId: item.id })), { mode: "parry", itemId: "" }];
  return options.map(option => ({ ...defenseQuote(actor, { ...option, incoming, defenseModifier }), mode: option.mode, itemId: option.itemId ?? "" }));
}

const incomingOf = attack => attack.ranged ? (attack.thrown ? "thrown" : "ranged") : "melee";

/** Count this round's defenses so the second and later ones cost 1 STA automatically (core p.151). */
function repeatDefense(actor) {
  const combat = game.combat, mark = actor.getFlag(SYSTEM_ID, "defenses");
  return Boolean(combat?.started && mark?.combat === combat.id && mark.round === combat.round && mark.count > 0);
}
async function countDefense(actor) {
  const combat = game.combat;
  if (!combat?.started) return;
  const mark = actor.getFlag(SYSTEM_ID, "defenses"), same = mark?.combat === combat.id && mark.round === combat.round;
  await actor.setFlag(SYSTEM_ID, "defenses", { combat: combat.id, round: combat.round, count: same ? mark.count + 1 : 1 });
}

export async function defendAttack(message, index, mode, itemId = "", repeat = null) {
  const attack = flagsOf(message).weaponAttack, actor = targetActor(attack);
  if (!actor?.isOwner || linkedAny(message.id, index, "defense")) return;
  const link = { attack: message.id, index, kind: "defense" };
  if (mode === "none") {
    return post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor.name)} не защищается.</p>`,
      flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { ...link, none: true } } } });
  }
  const gang = gangingUp(message);
  const defense = await rollDefense(actor, { mode, itemId, incoming: incomingOf(attack), repeat: repeat ?? repeatDefense(actor), defenseModifier: -gang,
    exchange: { ...link, gang } });
  if (!defense) return;
  await countDefense(actor);
  // A successful block wears the blocking item by 1 reliability (core p.164).
  const won = defense.rolls[0].total >= message.rolls[index].total;
  if (won && mode === "block" && itemId) {
    const item = actor.items.get(itemId), reliability = effectiveItem(item)?.reliability;
    if (item && !item.system.natural && reliability?.max) {
      const from = item.system.reliability.value, to = Math.max(0, from - 1);
      await item.update({ "system.reliability.value": to });
      await defense.update({ [`flags.${SYSTEM_ID}.exchange.wear`]: { name: item.name, from, to } });
    }
  }
  return defense;
}

/** Hit or miss for one attack roll, with the critical level when the margin is large enough. */
export function exchangeOutcome(message, index) {
  const attackTotal = message.rolls[index]?.total, defense = linked(message.id, index, "defense");
  if (!defense) return null;
  const none = exchangeOf(defense).none, defenseTotal = none ? DC_UNAWARE : defense.rolls[0]?.total;
  const hit = attackTotal > defenseTotal, margin = attackTotal - defenseTotal;
  // Core p.164: a successful block with the body sends the attack's damage into the blocking arm.
  const limbBlock = !hit && !none && Boolean(flagsOf(defense).defense?.limb);
  return { defense, none, attackTotal, defenseTotal, hit, limbBlock, margin, critical: hit && !flagsOf(message).weaponAttack?.special ? criticalLevel(margin) : null,
    mode: flagsOf(defense).defense?.mode ?? "", name: none ? "Без защиты" : flagsOf(defense).defense?.name ?? "Защита" };
}

const pendingRolls = new Set();

/** Record one attacker's step once, with the original attack's audience and dice animation. */
async function rollAttackStep(message, index, kind, prepare) {
  const attack = flagsOf(message).weaponAttack, outcome = exchangeOutcome(message, index), actor = message.speakerActor;
  const key = `${message.id}:${index}:${kind}`;
  if (!attack || !actor?.isOwner || !message.isContentVisible || !(outcome?.hit || outcome?.limbBlock) || pendingRolls.has(key)
    || linkedAny(message.id, index, kind) || linkedAny(message.id, index, "damage")) return;
  pendingRolls.add(key);
  const display = trackRollDisplay();
  try {
    const data = await prepare(attack, outcome, actor);
    if (!data) return;
    const { exchange, ...content } = data;
    const created = await foundry.documents.ChatMessage.implementation.create({ ...content,
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), blind: message.blind, whisper: [...message.whisper],
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true,
        exchange: { ...exchange, attack: message.id, index, kind } } } });
    await display.wait(created);
    return created;
  } finally { display.close(); pendingRolls.delete(key); }
}

function exchangeLocation(message, index) {
  const attack = flagsOf(message).weaponAttack;
  // A body block takes the blow on the blocking arm (core p.164); no location roll.
  if (exchangeOutcome(message, index)?.limbBlock) return ATTACK_LOCATIONS.find(entry => entry.id === "leftArm");
  return attack.location === "random" ? exchangeOf(linked(message.id, index, "location"))?.location
    : ATTACK_LOCATIONS.find(entry => entry.id === attack.location);
}

export function rollExchangeLocation(message, index) {
  return rollAttackStep(message, index, "location", async attack => {
    if (attack.location !== "random") return;
    const target = targetActor(attack), plan = bodyPlanOf(target);
    const roll = await new foundry.dice.Roll("1d10").evaluate({ allowInteractive: !message.blind });
    const { id, name, multiplier } = hitLocation(roll.total, plan, { hasTailOrWings: target?.system.creature?.hasTailOrWings ?? false });
    return { rolls: [roll], flavor: `<h3>${esc(attack.name)} · место попадания</h3><p>${esc(name)} · ×${multiplier} после брони</p>`,
      exchange: { location: { id, name, multiplier }, result: roll.total, bodyPlan: plan } };
  });
}

export function rollExchangeDamage(message, index) {
  return rollAttackStep(message, index, "damage", async (attack, outcome, actor) => {
    const location = exchangeLocation(message, index);
    if (!location) return;
    const target = targetActor(attack), item = actor.items.get(attack.itemId), weapon = item ? effectiveItem(item) : {};
    const traits = weaponDamageTraits(weapon), monster = target ? monsterResistant(target) : false;
    const options = { allowInteractive: !message.blind };
    const rolls = [await new foundry.dice.Roll(attack.damage).evaluate(options)];
    const silver = traits.silverDice && monster ? await new foundry.dice.Roll(traits.silverDice).evaluate(options) : null;
    if (silver) rolls.push(silver);
    let critical = null;
    if (outcome.critical) {
      // Older cards may contain a random location rolled before the attack, not an aimed strike.
      const aimed = attack.location !== "random" && !attack.locationRoll;
      const critRoll = await new foundry.dice.Roll(aimed && ["head", "torso"].includes(location.id) ? "1d6" : aimed ? "0" : "2d6").evaluate(options);
      if (critRoll.dice.length) rolls.push(critRoll);
      const tableRoll = aimed ? aimedCriticalRoll(location.id, critRoll.total) : critRoll.total;
      let wound = criticalWoundByRoll(outcome.critical.id, tableRoll), bonus = outcome.critical.bonus;
      if (wound && anatomyFree(target) && ORGAN_WOUNDS.has(wound.id)) { bonus += ANATOMY_FREE_BONUS[outcome.critical.id]; wound = null; }
      critical = { level: outcome.critical.id, name: outcome.critical.name, bonus, roll: tableRoll, aimed, wound };
    }
    return { rolls, flavor: `<h3>${esc(attack.name)} · урон</h3>`,
      exchange: { base: rolls[0].total, silver: silver?.total ?? 0,
        location: { id: location.id, name: location.name, multiplier: location.multiplier }, traits, critical } };
  });
}

/** Live preview of the damage against the target's current armor; the same function applies it. */
export function damagePreview(message, index) {
  const attack = flagsOf(message).weaponAttack, damage = linked(message.id, index, "damage"), target = targetActor(attack);
  if (!damage || !target) return null;
  const data = exchangeOf(damage), armor = armorAt(target, data.location.id);
  const critical = data.critical ? { name: data.critical.name, bonus: data.critical.bonus } : null;
  // Cracked Skull (core p.159): later wounds to the head deal ×4 instead of ×3.
  const multiplierFor = actor => data.location.id === "head" ? data.location.multiplier + modifierTotal(actor.system.statistics?.modifiers ?? [], "damage.headMultiplier") : data.location.multiplier;
  const hit = (actor, armorAtZone, base, silver, crit) => resolveDamage({ base, silver, location: data.location.id, multiplier: multiplierFor(actor),
    traits: data.traits, armor: armorAtZone, monster: monsterResistant(actor), vulnerableToFire: fireVulnerable(actor), critical: crit });
  const preview = { data, target, armor, result: hit(target, armor, data.base, data.silver, critical), shield: null };
  // House rule on core p.155: only a held creature can be a living shield. A torso hit goes into it as if it
  // were the target; whatever exceeds its BODY + torso SP gets through to the grappler's torso.
  const holding = data.location.id === "torso" ? grappleState(target).holding : null;
  if (holding?.actor) {
    const shieldArmor = armorAt(holding.actor, "torso"), body = holding.actor.system.statistics?.effective?.body ?? 0;
    const overflow = Math.max(0, data.base - body - shieldArmor.sp);
    preview.shield = { actor: holding.actor, token: holding.token, name: holding.name || holding.actor.name, armor: shieldArmor, body, overflow,
      result: hit(holding.actor, shieldArmor, data.base, data.silver, critical), through: hit(target, armor, overflow, 0, null) };
  }
  return preview;
}

/** HP loss, armor wear and a critical wound on one actor; returns what wore down. */
async function sufferDamage(actor, result, { wound = null, level = "", location = {} } = {}) {
  await actor.update({ "system.health.value": actor.system.health.value - result.total });
  const worn = [];
  for (const id of result.ablate) {
    if (id === "natural") {
      const value = actor.system.creature?.naturalArmor ?? 0;
      if (value > 0) { await actor.update({ "system.creature.naturalArmor": value - 1 }); worn.push(`естественная броня ${value} → ${value - 1}`); }
      continue;
    }
    const item = actor.items.get(id), from = item?.system.stoppingPower?.value;
    if (!item || !(from > 0)) continue;
    await item.update({ "system.stoppingPower.value": from - 1 });
    worn.push(`${item.name} ${from} → ${from - 1}`);
  }
  if (wound) await actor.createEmbeddedDocuments("ActiveEffect", [woundEffectData(wound.id, level, { location: location.id, locationName: location.name })]);
  return worn;
}

export async function applyExchangeDamage(message, index, { useShield = false } = {}) {
  const preview = damagePreview(message, index);
  if (!preview?.target.isOwner || linkedAny(message.id, index, "applied")) return;
  const { target, data } = preview, health = target.system.health.value, shield = useShield ? preview.shield : null;
  const own = shield ? shield.through : preview.result;
  const worn = await sufferDamage(target, own, shield ? {} : { wound: data.critical?.wound, level: data.critical?.level, location: data.location });
  const exchange = { attack: message.id, index, kind: "applied", total: own.total, steps: own.steps, from: health,
    ablated: worn.join(", "), armorHeld: !own.penetrated && preview.armor.sp > 0 && !shield };
  if (shield) {
    const shieldData = { token: shield.token, name: shield.name, total: shield.result.total, steps: shield.result.steps, ablate: shield.result.ablate,
      wound: data.critical?.wound ?? null, level: data.critical?.level ?? "", location: data.location, overflow: shield.overflow };
    // The grappler's owner may not own the held creature: the active GM applies that part.
    if (shield.actor.isOwner) { shieldData.ablated = (await sufferDamage(shield.actor, shield.result, shieldData)).join(", "); shieldData.applied = true; }
    exchange.shield = shieldData;
  }
  return post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }), content: `<p>${esc(target.name)}: −${own.total} ПЗ${shield ? ` · живой щит ${esc(shield.name)}: −${shield.result.total} ПЗ` : ""}</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, exchange } } }, "public");
}

/** Active GM: apply a living shield's share once when its owner could not. */
export async function applyShieldShare(message) {
  const link = exchangeOf(message), share = link?.shield;
  if (link?.kind !== "applied" || !share || share.applied || !game.users.activeGM?.isSelf) return;
  const actor = fromUuidSync(share.token)?.actor;
  if (!actor) return;
  await message.update({ [`flags.${SYSTEM_ID}.exchange.shield.applied`]: true });
  const ablated = await sufferDamage(actor, { total: share.total, ablate: share.ablate ?? [] }, share);
  if (ablated.length) await message.update({ [`flags.${SYSTEM_ID}.exchange.shield.ablated`]: ablated.join(", ") });
}

// ── Fumbles (core p.157, errata v4) ─────────────────────────────────────────

function attackFumbleTable(message, attack) {
  if (attack.special) return "unarmed";
  const item = message.speakerActor?.items.get(attack.itemId);
  if (attack.ranged) return "ranged";
  return item?.system.skill === "brawling" ? "unarmed" : "melee";
}
export function attackFumble(message, index) {
  const attack = flagsOf(message).weaponAttack;
  return fumbleOutcome(attackFumbleTable(message, attack), fumbleMagnitude(message.rolls[index]));
}
export function defenseFumble(defense) {
  const quote = flagsOf(defense).defense;
  if (!quote || rolling(defense)) return null;
  return fumbleOutcome(["block", "parry"].includes(quote.mode) && quote.itemId ? "armedDefense" : "unarmed", fumbleMagnitude(defense.rolls[0]));
}

async function applyStatus(actor, status) {
  const source = conditionSource(CONDITION_BY_ID[status]); delete source._id;
  if (actor.effects.some(effect => effect.statuses.has(status))) return;
  const timed = status === "staggered" ? { start: fullTurnStart(actor), duration: { value: 1, units: "rounds", expiry: "turnStart", expired: false } } : {};
  await actor.createEmbeddedDocuments("ActiveEffect", [{ ...source, ...timed }]);
}

// Each consequence is its own step with its own dice button (or rolled automatically when the world
// setting asks for it). A step is recorded as a linked message, so it never runs twice.
export function fumbleSteps(outcome, actor, itemId) {
  if (!outcome) return [];
  const apply = outcome.apply, item = itemId ? actor?.items.get(itemId) : null, steps = [];
  if (apply.status) steps.push({ id: "status", label: CONDITION_BY_ID[apply.status].name, hint: "Наложить состояние" });
  if (apply.reliability) steps.push({ id: "reliability", dice: apply.reliability, label: `Урон надёжности ${apply.reliability}`, hint: item ? `Оружие: ${item.name}` : "" });
  if (apply.headDamage) steps.push({ id: "head", dice: apply.headDamage, label: `${apply.headDamage} ${apply.nonLethal ? "несмертельного" : "смертельного"} урона в голову` });
  if (apply.selfHit) steps.push({ id: "self", dice: "1d10", label: "Ранил себя: место (1d10) и урон оружия", hint: "Урон по себе с учётом своей брони" });
  if (apply.allyHit) steps.push({ id: "ally", dice: "1d10", label: "Попал в союзника: место (1d10) и урон", hint: "Броски для ведущего; урон применяется к выбранному союзнику вручную" });
  if (apply.disarm) steps.push({ id: "disarm", dice: "1d10", label: "Куда отлетело оружие: направление 1d10, дистанция 1d6 м", hint: "Оружие будет убрано из рук" });
  if (apply.jam) steps.push({ id: "jam", label: "Заклинило: 1 раунд на исправление", hint: "Арбалет придётся перезарядить" });
  if (apply.stuck) steps.push({ id: "stuck", label: "Оружие застряло: 1 раунд, чтобы достать" });
  if (apply.stun) steps.push({ id: "stun", dice: "1d10", label: "Испытание Устойчивости" });
  return steps;
}

const stepKind = (role, id) => `fumble-${role}-${id}`;
const stepDone = (message, index, role, id) => linkedAny(message.id, index, stepKind(role, id)) ?? linkedAny(message.id, index, `fumble-${role}`);

function weaponDamageFormula(actor, item, attack, role) {
  if (role === "attack" && attack?.damage) return attack.damage;
  if (!item) return "1d6";
  try { return weaponAttack(actor, item, { mode: attackModes(actor, item)[0]?.id }).damage || "1d6"; } catch { return item.system.damage || "1d6"; }
}

/** Runs one consequence for the owner of the fumbling actor. */
export async function runFumbleStep({ message, index, role, actor, itemId, outcome, step }) {
  if (!actor?.isOwner || !outcome || stepDone(message, index, role, step.id)) return;
  const key = `${message.id}:${index}:${role}:${step.id}`;
  if (pendingRolls.has(key)) return;
  pendingRolls.add(key);
  try {
    const notes = [], rolls = [], extra = {}, item = itemId ? actor.items.get(itemId) : null, attack = flagsOf(message).weaponAttack;
    const roll = async formula => { const result = await new foundry.dice.Roll(formula).evaluate(); rolls.push(result); return result; };
    if (step.id === "status") { await applyStatus(actor, outcome.apply.status); notes.push(`${CONDITION_BY_ID[outcome.apply.status].name}`); }
    if (step.id === "reliability") {
      const result = await roll(step.dice);
      if (item?.system.reliability?.max) {
        const to = Math.max(0, item.system.reliability.value - result.total);
        await item.update({ "system.reliability.value": to });
        notes.push(`${item.name}: надёжность −${result.total} (${to}${to === 0 ? ", сломано" : ""})`);
      } else notes.push(`урон надёжности ${result.total}`);
    }
    if (step.id === "head") {
      const result = await roll(step.dice), key = outcome.apply.nonLethal ? "stamina" : "health";
      await actor.update({ [`system.${key}.value`]: actor.system[key].value - result.total });
      notes.push(`${result.total} ${outcome.apply.nonLethal ? "несмертельного" : "смертельного"} урона в голову`);
    }
    if (step.id === "self" || step.id === "ally") {
      const plan = step.id === "self" ? bodyPlanOf(actor) : "humanoid";
      const where = hitLocation((await roll("1d10")).total, plan), damage = await roll(weaponDamageFormula(actor, item, attack, role));
      if (step.id === "self") {
        const armor = armorAt(actor, where.id), traits = weaponDamageTraits(item ? effectiveItem(item) : {});
        const result = resolveDamage({ base: damage.total, location: where.id, multiplier: where.multiplier, traits, armor, monster: monsterResistant(actor), vulnerableToFire: fireVulnerable(actor) });
        const worn = await sufferDamage(actor, result);
        notes.push(`${where.name}: урон ${damage.total} → −${result.total} ПЗ${worn.length ? `; ПБ −1: ${worn.join(", ")}` : ""}`);
      } else {
        notes.push(`союзнику: ${where.name} (×${where.multiplier}), урон ${damage.total} до брони`);
        extra.ally = { location: { id: where.id, name: where.name, multiplier: where.multiplier }, damage: damage.total, traits: weaponDamageTraits(item ? effectiveItem(item) : {}) };
      }
    }
    if (step.id === "disarm") {
      const direction = await roll("1d10"), distance = await roll("1d6");
      if (item?.system.equipped) await item.update({ "system.equipped": false });
      const wielder = actor.token?.uuid ?? actor.getActiveTokens?.()[0]?.document?.uuid;
      if (wielder) extra.scatter = { token: wielder, result: direction.total, meters: distance.total };
      // The weapon lands on the ground at the scatter point: direction from 1d10, distance 1d6 m.
      const wielderToken = wielder ? fromUuidSync(wielder) : null;
      if (item && wielderToken?.parent) {
        const offset = scatterOffset(direction.total, wielderToken.rotation, 1), length = Math.hypot(offset.x, offset.y) || 1;
        const scene = wielderToken.parent, pixels = distance.total / scene.grid.distance * scene.grid.size, { width, height } = wielderToken.getSize();
        const point = { x: wielderToken.x + width / 2 + offset.x / length * pixels, y: wielderToken.y + height / 2 + offset.y / length * pixels };
        await dropItemToGround(actor, item, { quantity: 1, point, silent: true });
      } else if (item) await blockWeapon(actor, item, "disarmed", `Оружие выбито: ${item.name}`, `${item.name} отлетело на ${distance.total} м (направление ${direction.total} по таблице разброса). Подберите его, чтобы снова взять в руки.`, null);
      notes.push(`${item?.name ?? "Оружие"} выбито: направление ${direction.total} по таблице разброса, ${distance.total} м`);
    }
    if (step.id === "jam") {
      if (item?.system.skill === "crossbow" && item.system.loaded !== false) await item.update({ "system.loaded": false });
      if (item) await blockWeapon(actor, item, "jammed", `Заклинило: ${item.name}`, `${item.name} нельзя использовать до конца вашего следующего хода: тетива слетела или механизм заклинило.`, 1);
      notes.push(item?.system.skill === "crossbow" ? `${item.name}: заклинило, нужна перезарядка` : "1 раунд на исправление");
    }
    if (step.id === "stuck") {
      if (item) await blockWeapon(actor, item, "stuck", `Оружие застряло: ${item.name}`, `${item.name} застряло в ближайшем предмете. Пока его не достанете (это действие), им нельзя атаковать и блокировать.`, null);
      notes.push(`${item?.name ?? "Оружие"} застряло: достать — действие`);
    }
    if (step.id === "stun") { await rollStun(actor); notes.push("испытание Устойчивости брошено"); }
    return await post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), rolls, content: `<p>Провал: ${esc(notes.join("; "))}</p>`,
      flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index, kind: stepKind(role, step.id), notes, ...extra } } } }, "public");
  } finally { pendingRolls.delete(key); }
}

/** The fumbler picks the struck ally with the T key; damage goes through that ally's armor in the rolled zone. */
export async function applyFumbleToTarget({ message, index, role, actor }) {
  const record = linkedAny(message.id, index, stepKind(role, "ally")), ally = exchangeOf(record)?.ally;
  if (!ally || !actor?.isOwner || linkedAny(message.id, index, stepKind(role, "allyapply"))) return;
  const token = Array.from(game.user.targets ?? []).map(entry => entry.document ?? entry).find(entry => entry.actor && entry.actor.uuid !== actor.uuid);
  if (!token) throw new Error("Выберите цель (T): союзника, в которого попал удар.");
  const victim = token.actor, armor = armorAt(victim, ally.location.id);
  const result = resolveDamage({ base: ally.damage, location: ally.location.id, multiplier: ally.location.multiplier, traits: ally.traits, armor,
    monster: monsterResistant(victim), vulnerableToFire: fireVulnerable(victim) });
  const share = { token: token.uuid, name: token.name, total: result.total, steps: result.steps, ablate: result.ablate, applied: false };
  if (victim.isOwner) { share.ablated = (await sufferDamage(victim, result)).join(", "); share.applied = true; }
  return post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content: `<p>Провал: ${esc(token.name)} получает −${result.total} ПЗ (${esc(ally.location.name)})</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index, kind: stepKind(role, "allyapply"), share,
      notes: [`${token.name}: −${result.total} ПЗ (${ally.location.name})${share.applied ? "" : " — применяет мастер"}`] } } } }, "public");
}

/** Active GM: apply a deferred share (fumbled hit on an ally the player does not own) once. */
async function applyDeferredShare(message) {
  const link = exchangeOf(message), share = link?.share;
  if (!share || share.applied || !link.kind?.endsWith("allyapply") || !game.users.activeGM?.isSelf) return;
  const victim = fromUuidSync(share.token)?.actor;
  if (!victim) return;
  await message.update({ [`flags.${SYSTEM_ID}.exchange.share.applied`]: true });
  await sufferDamage(victim, { total: share.total, ablate: share.ablate ?? [] });
}

/** A weapon made unusable by a fumble, tracked as an effect on its wielder (core p.157). */
async function blockWeapon(actor, item, reason, name, description, rounds) {
  const timed = rounds ? { start: fullTurnStart(actor), duration: { value: rounds, units: "rounds", expiry: "turnEnd", expired: false } } : {};
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name, img: item.img || "icons/svg/sword.svg", description: `<p>${esc(description)}</p>`, ...timed,
    flags: { [SYSTEM_ID]: { weaponBlock: { itemId: item.id, reason } } } }]);
}

/** Optional world setting: the player who rolled the fumble resolves every step at once. */
async function autoResolveFumble(context) {
  const { message, index, role, actor, itemId, outcome, author } = context;
  if (!outcome || author !== game.user.id || !game.settings.get(SYSTEM_ID, "automaticFumbleRolls")) return;
  for (const step of fumbleSteps(outcome, actor, itemId)) await runFumbleStep({ ...context, step });
}

const fumbleHTMLSecret = (...args) => fumbleHTML(...args).replace('class="witcher-exchange-fumble"', 'class="witcher-exchange-fumble witcher-gm-only" data-tooltip="Игроки не видят до выбора защиты"');

function fumbleHTML(message, index, role, outcome, owner, actor, itemId) {
  if (!outcome) return "";
  const steps = fumbleSteps(outcome, actor, itemId);
  const rows = steps.map(step => {
    const done = stepDone(message, index, role, step.id);
    const result = done ? `<span class="is-done"><i class="fa-solid fa-check"></i> ${esc(exchangeOf(done).notes?.join("; ") || "применено")}</span>`
      : owner ? button(`data-fumble-step="${role}:${step.id}" data-index="${index}"`, `<i class="fa-solid ${step.dice ? "fa-dice-d10" : "fa-check"}"></i> ${esc(step.label)}`, true, step.hint)
      : `<span class="is-pending">${esc(step.label)} — ждём бросок</span>`;
    let follow = "";
    if (step.id === "ally" && done && exchangeOf(done).ally) {
      const applied = linkedAny(message.id, index, stepKind(role, "allyapply"));
      follow = applied ? `<span class="is-done"><i class="fa-solid fa-crosshairs"></i> ${esc(exchangeOf(applied).notes?.join("; ") ?? "")}</span>`
        : owner ? button(`data-fumble-ally="${role}" data-index="${index}"`, '<i class="fa-solid fa-crosshairs"></i> Применить к цели (T)', true, "Выберите токен союзника клавишей T и нажмите: урон пройдёт через его броню в выпавшей зоне") : "";
    }
    return `<li>${result}${follow}</li>`;
  }).join("");
  return `<div class="witcher-exchange-fumble"><b>Критический провал −${outcome.magnitude}</b> · ${esc(outcome.tableName)}: ${esc(outcome.text)}${rows ? `<ul class="witcher-fumble-steps">${rows}</ul>` : ""}</div>`;
}

// ── Rendering ────────────────────────────────────────────────────────────────

const stepsHTML = steps => `<ul class="witcher-roll-breakdown">${steps.map(step => `<li><span>${esc(step.label)}${step.detail ? ` <small>${esc(step.detail)}</small>` : ""}</span><b>${esc(step.value)}</b></li>`).join("")}</ul>`;
const button = (attrs, label, enabled, hint = "") => `<button type="button" ${attrs} ${enabled ? "" : "disabled"} ${hint ? `data-tooltip="${esc(hint)}"` : ""}>${label}</button>`;

export function exchangeRowHTML(message, index, attack = flagsOf(message).weaponAttack) {
  const total = message.rolls[index]?.total, target = targetActor(attack), outcome = exchangeOutcome(message, index);
  // Until the defense is chosen (and its dice landed) the defender does not learn the total or a fumble.
  const concealed = attackConcealed(message) && !linked(message.id, index, "defense");
  // The GM and the attacker's owners see it, marked like pf2e's GM-only info.
  const secret = !concealed && enemyAttackHidden(message) && !linked(message.id, index, "defense");
  const head = `<header><span>Атака ${attack.count > 1 ? `${index + 1} ` : ""}<b class="${secret ? "witcher-gm-only" : ""}" ${secret ? 'data-tooltip="Игроки не видят до выбора защиты"' : ""}>${concealed ? '<i class="fa-solid fa-eye-slash" data-tooltip="Итог атаки откроется после выбора защиты"></i>' : total}</b></span>`;
  const ownFumble = concealed ? "" : (secret ? fumbleHTMLSecret : fumbleHTML)(message, index, "attack", attackFumble(message, index), message.speakerActor?.isOwner, message.speakerActor, attack.itemId);
  const hideTargetNumbers = creatureDetailsHidden(target);
  if (!outcome) {
    if (!target?.isOwner) return `<li class="is-waiting">${head}<em>${linkedAny(message.id, index, "defense") ? "защита бросается…" : "ждём защиту"}</em></header>${ownFumble}</li>`;
    if (linkedAny(message.id, index, "defense")) return `<li class="is-waiting">${head}<em><i class="fa-solid fa-dice-d10 fa-spin"></i> защита бросается…</em></header>${ownFumble}</li>`;
    const gang = gangingUp(message);
    const choices = defenseChoices(target, incomingOf(attack), -gang, GRAPPLE_ACTIONS[attack.special]?.defenses ?? null).map(choice => button(`data-exchange-defend="${choice.mode}" data-item-id="${choice.itemId ?? ""}"`,
      `${esc(choice.name)}${choice.weaponName ? ` · ${esc(choice.weaponName)}` : ""}${choice.total != null && !choice.blocked ? ` <b>+${choice.total}</b>` : ""}`, !choice.blocked, choice.blocked || choice.note));
    const free = defenseChoices(target, incomingOf(attack))[0]?.activeDodge;
    const repeatBox = `<button type="button" class="witcher-exchange-repeat" data-exchange-repeat aria-pressed="${!free && repeatDefense(target)}" ${free ? "disabled" : ""} data-tooltip="${free ? "Активное уклонение: повторные защиты бесплатны" : "Вторая и следующие защиты за раунд стоят 1 ВЫН. Нажмите, чтобы переключить."}"><i class="fa-solid fa-rotate"></i> Повторная · ${free ? 0 : 1} ВЫН</button>`;
    const gangNote = gang ? `<p class="witcher-exchange-note" data-tooltip="Errata: −1 к защите за каждого нападающего в ближнем бою сверх первого">Объединение сил: ${gang + 1} нападающих в этом раунде · защита −${gang}</p>` : "";
    return `<li class="is-waiting">${head}<em>защита ${esc(target.name)}</em>${repeatBox}</header>${gangNote}<div class="witcher-exchange-actions">${choices.join("")}${button('data-exchange-defend="none"', "Не защищается", true, `Атака сравнивается со СЛ ${DC_UNAWARE}`)}</div>${ownFumble}</li>`;
  }
  const verdict = outcome.hit ? `<strong class="is-hit">Попадание +${outcome.margin}</strong>` : outcome.limbBlock ? `<strong class="is-hit">Заблокировано рукой</strong>`
    : `<strong class="is-miss">${outcome.mode === "parry" ? "Парировано" : outcome.mode === "block" ? "Заблокировано" : "Промах"}</strong>`;
  const gang = exchangeOf(outcome.defense).gang;
  const defenseLine = `${esc(outcome.name)} <b>${outcome.defenseTotal}</b>${gang ? ` <small data-tooltip="Объединение сил: нападающих в этом раунде ${gang + 1}">(объединение сил −${gang})</small>` : ""}`;
  let body = ownFumble + fumbleHTML(message, index, "defense", outcome.none ? null : defenseFumble(outcome.defense), target?.isOwner, target, flagsOf(outcome.defense)?.defense?.itemId);
  if (outcome.critical) body += `<p class="witcher-exchange-crit"><i class="fa-solid fa-burst"></i> Критическое ранение: ${esc(outcome.critical.name.toLocaleLowerCase("ru"))} (+${outcome.critical.bonus} урона)</p>`;
  if (!outcome.hit && outcome.mode === "parry") body += `<p class="witcher-exchange-note"><i class="fa-solid fa-person-falling"></i> ${esc(message.speakerActor?.name ?? "Атакующий")} ошеломлён: −2 к атаке и защите до начала своего хода.</p>`;
  const wear = exchangeOf(outcome.defense).wear;
  if (wear) body += `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield-halved"></i> Удар принял ${esc(wear.name)}: надёжность ${wear.from} → ${wear.to}${wear.to === 0 ? " · сломано" : ""}</p>`;
  if (attack.special) {
    const done = linkedAny(message.id, index, "special"), name = GRAPPLE_ACTIONS[attack.special]?.name ?? "";
    if (outcome.hit) body += done ? `<p class="witcher-exchange-applied is-special"><i class="fa-solid fa-hand-back-fist"></i> ${esc(exchangeOf(done).notes?.join(" ") ?? "")}</p>`
      : `<p class="witcher-exchange-note"><i class="fa-solid fa-hourglass-half"></i> ${esc(name)}: удалось — мастер применяет результат…</p>`;
    else body += `<p class="witcher-exchange-note">${esc(name)}: не удалось.</p>`;
    return `<li class="${outcome.hit ? "is-hit" : "is-miss"}">${head}<span>${defenseLine}</span><strong class="${outcome.hit ? "is-hit" : "is-miss"}">${outcome.hit ? "Удалось" : "Не удалось"}</strong></header>${body}</li>`;
  }
  if (outcome.limbBlock) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-hand"></i> Блок телом: урон атаки приходится в подставленную руку, ПБ учитывается. Критического ранения нет.</p>`;
  if (outcome.hit || outcome.limbBlock) {
    const damage = linked(message.id, index, "damage"), applied = linked(message.id, index, "applied");
    if (!damage && linkedAny(message.id, index, "damage")) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-dice-d6 fa-spin"></i> Урон бросается…</p>`;
    else if (!damage) {
      const location = exchangeLocation(message, index), locationMessage = linkedAny(message.id, index, "location");
      if (!location) {
        if (locationMessage) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-dice-d10 fa-spin"></i> Бросается место попадания…</p>`;
        else body += message.speakerActor?.isOwner ? `<div class="witcher-exchange-actions">${button("data-exchange-location", '<i class="fa-solid fa-dice-d10"></i> Место попадания · 1d10', true)}</div>` : `<p class="witcher-exchange-note">Ждём бросок места попадания.</p>`;
      } else {
        body += `<p class="witcher-exchange-location">${locationMessage ? `1d10: <b>${exchangeOf(locationMessage).result}</b> → ` : "Место попадания: "}<b>${esc(location.name)}</b> · ×${location.multiplier === 0.5 ? "½" : location.multiplier} после брони</p>`;
        body += message.speakerActor?.isOwner ? `<div class="witcher-exchange-actions">${button("data-exchange-damage", `<i class="fa-solid fa-dice-d6"></i> Урон ${esc(attack.damage)}`, true)}</div>` : `<p class="witcher-exchange-note">Ждём бросок урона.</p>`;
      }
    }
    else {
      const data = exchangeOf(damage), wound = data.critical?.wound;
      body += `<p class="witcher-exchange-damage">Урон <b>${data.base}</b>${data.silver ? ` + серебро <b>${data.silver}</b>` : ""} → ${esc(data.location.name)}${data.location.multiplier !== 1 ? ` (×${data.location.multiplier === 0.5 ? "½" : data.location.multiplier})` : ""}</p>`;
      if (wound) body += `<details class="witcher-exchange-wound"><summary>${esc(wound.name)}</summary><p>${esc(wound.effect)}</p></details>`;
      if (applied) {
        const result = exchangeOf(applied);
        if (result.shield) body += `<p class="witcher-exchange-applied is-shield" data-tooltip="${esc(stepsHTML(result.shield.steps))}" data-tooltip-class="witcher-roll-tooltip"><i class="fa-solid fa-user-shield"></i> Живой щит ${esc(result.shield.name)}: −${result.shield.total} ПЗ${result.shield.applied ? "" : " <small>(применяет мастер)</small>"}</p>${result.shield.ablated ? `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield-halved"></i> ПБ щита −1: ${esc(result.shield.ablated)}</p>` : ""}`;
        if (hideTargetNumbers) body += `<p class="witcher-exchange-applied"><i class="fa-solid fa-heart-crack"></i> −${result.total} ПЗ</p>`;
        else body += `<p class="witcher-exchange-applied" data-tooltip="${esc(stepsHTML(result.steps))}" data-tooltip-class="witcher-roll-tooltip"><i class="fa-solid fa-heart-crack"></i> −${result.total} ПЗ${result.shield ? " сквозь щит" : ""}</p>${result.ablated ? `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield-halved"></i> ПБ −1: ${esc(result.ablated)}</p>` : result.armorHeld ? `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield"></i> Броня выдержала удар — ПБ не снижается</p>` : ""}`;
        // Core p.158: every critical wound also forces a Stun save.
        if (data.critical && target?.isOwner) body += `<div class="witcher-exchange-actions">${button("data-exchange-stun", '<i class="fa-solid fa-dice-d10"></i> Испытание Устойчивости', true, "Критическое ранение требует испытания УСТ")}</div>`;
      } else if (target?.isOwner) {
        const preview = damagePreview(message, index), shield = preview.shield;
        if (shield) body += `<div class="witcher-exchange-shield"><p><i class="fa-solid fa-user-shield"></i> <b>Живой щит:</b> ${esc(shield.name)} в захвате прикрывает туловище. Удар принимает он; в вас проходит только урон сверх его ТЕЛ ${shield.body} + ПБ ${shield.armor.sp} = <b>${shield.overflow}</b>.</p>
          <div class="witcher-exchange-actions">${button("data-exchange-apply-shield", `<i class="fa-solid fa-user-shield"></i> Прикрыться: щит −${shield.result.total}, вам −${shield.through.total}`, true)}${button("data-exchange-apply", `<i class="fa-solid fa-heart-crack"></i> Принять самому −${preview.result.total}`, true)}</div>
          <details><summary>Расчёт для щита</summary>${stepsHTML(shield.result.steps)}</details><details><summary>Расчёт без щита</summary>${stepsHTML(preview.result.steps)}</details></div>`;
        else body += `<div class="witcher-exchange-actions">${button("data-exchange-apply", `<i class="fa-solid fa-heart-crack"></i> Применить −${preview.result.total} ПЗ`, true)}</div>${stepsHTML(preview.result.steps)}`;
      } else body += `<p class="witcher-exchange-note">Урон применяет владелец цели или мастер.</p>`;
    }
  }
  return `<li class="${outcome.hit || outcome.limbBlock ? "is-hit" : "is-miss"}">${head}<span>${defenseLine}</span>${verdict}</header>${body}</li>`;
}

export function renderExchange(message, html) {
  const flags = flagsOf(message);
  if (exchangeOf(message) && game.messages.has(exchangeOf(message).attack)) { html.classList.add("witcher-ambush-folded"); html.hidden = true; return; }
  const attack = flags.weaponAttack;
  if (!attack || !message.isContentVisible || !message.rolls?.length) return;
  if (!attack.target) return renderUntargetedFumbles(message, html, attack);
  const section = html.querySelector(".witcher-attack-chat");
  if (!section) return;
  for (const legacy of section.querySelectorAll("[data-weapon-damage], .witcher-location-buttons")) legacy.remove();
  const target = targetActor(attack);
  const list = document.createElement("div");
  list.className = "witcher-exchange";
  list.innerHTML = `<h4><i class="fa-solid fa-swords"></i> Против: ${esc(target?.name ?? "цель недоступна")}</h4><ol>${message.rolls.map((_roll, index) => exchangeRowHTML(message, index, attack)).join("")}</ol>`;
  (html.querySelector(".message-content") ?? section).append(list);
  concealAttackCard(message, html, attack);
  list.querySelectorAll(":scope > ol > li").forEach((row, index) => {
    const run = (selector, work) => row.querySelector(selector)?.addEventListener("click", async event => {
      event.stopPropagation(); event.currentTarget.disabled = true;
      try { await work(event.currentTarget); } catch (error) { ui.notifications.warn(error.message); }
      finally { ui.chat?.updateMessage(message, { notify: false }); }
    });
    row.querySelector("[data-exchange-repeat]")?.addEventListener("click", event => {
      event.stopPropagation();
      const toggle = event.currentTarget;
      toggle.setAttribute("aria-pressed", String(toggle.getAttribute("aria-pressed") !== "true"));
    });
    row.querySelectorAll("[data-exchange-defend]").forEach(choice => choice.addEventListener("click", async event => {
      event.stopPropagation(); for (const other of row.querySelectorAll("[data-exchange-defend]")) other.disabled = true;
      const repeatBox = row.querySelector("[data-exchange-repeat]");
      try { await defendAttack(message, index, choice.dataset.exchangeDefend, choice.dataset.itemId, repeatBox && !repeatBox.disabled ? repeatBox.getAttribute("aria-pressed") === "true" : null); } catch (error) { ui.notifications.warn(error.message); }
    }));
    run("[data-exchange-location]", () => rollExchangeLocation(message, index));
    run("[data-exchange-damage]", () => rollExchangeDamage(message, index));
    run("[data-exchange-apply]", () => applyExchangeDamage(message, index));
    run("[data-exchange-apply-shield]", () => applyExchangeDamage(message, index, { useShield: true }));
    run("[data-exchange-stun]", () => rollStun(targetActor(attack)));
    const fumbleContext = role => {
      if (role === "attack") return { message, index, role, actor: message.speakerActor, itemId: attack.itemId, outcome: attackFumble(message, index), author: message.author?.id };
      const defense = linked(message.id, index, "defense");
      return { message, index, role, actor: targetActor(attack), itemId: flagsOf(defense)?.defense?.itemId, outcome: defense ? defenseFumble(defense) : null, author: defense?.author?.id };
    };
    row.querySelectorAll("[data-fumble-step]").forEach(control => control.addEventListener("click", async event => {
      event.stopPropagation(); control.disabled = true;
      const [role, id] = control.dataset.fumbleStep.split(":"), context = fumbleContext(role);
      const step = fumbleSteps(context.outcome, context.actor, context.itemId).find(entry => entry.id === id);
      try { if (step) await runFumbleStep({ ...context, step }); } catch (error) { ui.notifications.warn(error.message); }
    }));
    row.querySelectorAll("[data-fumble-ally]").forEach(control => control.addEventListener("click", async event => {
      event.stopPropagation(); control.disabled = true;
      try { await applyFumbleToTarget(fumbleContext(control.dataset.fumbleAlly)); } catch (error) { control.disabled = false; ui.notifications.warn(error.message); }
    }));
    for (const role of ["attack", "defense"]) autoResolveFumble(fumbleContext(role)).catch(console.error);
  });
}

/** Hide what the defender must not know yet, and a creature's numbers from players who do not own it. */
function concealAttackCard(message, html, attack) {
  if (attackConcealed(message) && message.rolls.some((_roll, index) => !linked(message.id, index, "defense"))) {
    html.querySelectorAll(".dice-roll").forEach((element, index) => {
      if (linked(message.id, index, "defense")) return;
      element.hidden = true;
      element.insertAdjacentHTML("afterend", '<p class="witcher-concealed-roll"><i class="fa-solid fa-eye-slash"></i> Бросок атаки откроется после выбора защиты</p>');
    });
    html.querySelectorAll(".witcher-critical-result").forEach(element => { element.hidden = true; });
  }
  if (creatureDetailsHidden(message.speakerActor)) {
    html.querySelectorAll(".witcher-attack-chat > p[data-tooltip], .witcher-attack-modifiers").forEach(element => element.remove());
  } else if (creatureDetailsSecret(message.speakerActor)) html.querySelectorAll(".witcher-attack-chat > p[data-tooltip], .witcher-attack-modifiers").forEach(element => element.classList.add("witcher-gm-only"));
  // The viewer who may see a still-concealed attack gets it highlighted as hidden from players.
  if (!attackConcealed(message) && enemyAttackHidden(message)) html.querySelectorAll(".dice-roll").forEach((element, index) => {
    if (!linked(message.id, index, "defense")) { element.classList.add("witcher-gm-only"); element.dataset.tooltip ??= "Игроки не видят до выбора защиты"; }
  });
  if (!attackConcealed(message) && enemyAttackHidden(message) && message.rolls.some((_roll, index) => !linked(message.id, index, "defense")))
    html.querySelectorAll(".witcher-critical-result").forEach(element => element.classList.add("witcher-gm-only"));
}

function renderUntargetedFumbles(message, html, attack) {
  const blocks = message.rolls.map((_roll, index) => fumbleHTML(message, index, "attack", attackFumble(message, index), message.speakerActor?.isOwner, message.speakerActor, attack.itemId)).filter(Boolean);
  if (!blocks.length) return;
  const box = document.createElement("div");
  box.className = "witcher-exchange";
  box.innerHTML = blocks.join("");
  (html.querySelector(".message-content") ?? html).append(box);
  const context = index => ({ message, index, role: "attack", actor: message.speakerActor, itemId: attack.itemId, outcome: attackFumble(message, index), author: message.author?.id });
  box.querySelectorAll("[data-fumble-step]").forEach(control => control.addEventListener("click", async event => {
    event.stopPropagation(); control.disabled = true;
    const index = Number(control.dataset.index), id = control.dataset.fumbleStep.split(":")[1], ctx = context(index);
    const step = fumbleSteps(ctx.outcome, ctx.actor, ctx.itemId).find(entry => entry.id === id);
    try { if (step) await runFumbleStep({ ...ctx, step }); } catch (error) { ui.notifications.warn(error.message); }
  }));
  box.querySelectorAll("[data-fumble-ally]").forEach(control => control.addEventListener("click", async event => {
    event.stopPropagation(); control.disabled = true;
    try { await applyFumbleToTarget(context(Number(control.dataset.index))); } catch (error) { control.disabled = false; ui.notifications.warn(error.message); }
  }));
  message.rolls.forEach((_roll, index) => autoResolveFumble(context(index)).catch(console.error));
}

function refreshAttack(message) {
  const link = exchangeOf(message), attack = link && game.messages.get(link.attack);
  if (attack && ui.chat) ui.chat.updateMessage(attack, { notify: false });
}

/** Re-render once the linked dice have landed (or at once without Dice So Nice). */
function settleThenRefresh(message) {
  if (!exchangeOf(message)) return;
  if (!waitsForDice() || !message.rolls?.length) { refreshAttack(message); return void afterSettled(message).catch(console.error); }
  let timer;
  // Dice So Nice flags the message in its own hook, after ours; check again once it had the chance.
  setTimeout(() => { if (message._dice3danimating) refreshAttack(message); else done(); }, 150);
  let finished = false;
  const done = () => { if (finished) return; finished = true; message._witcherSettled = true; Hooks.off("diceSoNiceRollComplete", hook); clearTimeout(timer); refreshAttack(message); afterSettled(message).catch(console.error); };
  const hook = Hooks.on("diceSoNiceRollComplete", id => { if (id === message.id) done(); });
  timer = setTimeout(done, 12000);
}

/** A successful parry staggers the attacker (core p.164). One client writes it: the active GM, else the attacker's owner. */
async function afterSettled(message) {
  const link = exchangeOf(message);
  if (link?.kind !== "defense") return;
  const attackMessage = game.messages.get(link.attack), outcome = attackMessage && exchangeOutcome(attackMessage, link.index);
  if (outcome?.hit && flagsOf(attackMessage).weaponAttack?.special) {
    if (game.users.activeGM?.isSelf) await applyGrappleSuccess(attackMessage);
    return;
  }
  if (!outcome || outcome.hit || outcome.mode !== "parry") return;
  const attack = flagsOf(attackMessage).weaponAttack;
  const attacker = (attack.attacker && fromUuidSync(attack.attacker)?.actor) ?? attackMessage.speakerActor;
  const writer = game.users.activeGM ? game.users.activeGM.isSelf : attacker?.isOwner;
  if (!attacker || !writer) return;
  const key = `${attackMessage.id}:${link.index}`;
  if (attacker.effects.some(effect => effect.flags?.[SYSTEM_ID]?.parryKey === key)) return;
  const old = attacker.effects.filter(effect => effect.statuses.has("staggered"));
  if (old.length) await attacker.deleteEmbeddedDocuments("ActiveEffect", old.map(effect => effect.id));
  const source = conditionSource(CONDITION_BY_ID.staggered); delete source._id;
  await attacker.createEmbeddedDocuments("ActiveEffect", [{ ...source, start: fullTurnStart(attacker),
    duration: { value: 1, units: "rounds", expiry: "turnStart", expired: false }, flags: { [SYSTEM_ID]: { ...source.flags[SYSTEM_ID], parryKey: key } } }]);
}

export function registerAttackExchange() {
  Hooks.on("renderChatMessageHTML", renderExchange);
  Hooks.on("createChatMessage", message => { try { settleThenRefresh(message); } catch (error) { console.error(error); } });
  Hooks.on("createChatMessage", message => { applyShieldShare(message).catch(console.error); applyDeferredShare(message).catch(console.error); });
  // Every client sees where a scatter roll sent the weapon, on the wielder's token.
  Hooks.on("createChatMessage", message => {
    const scatter = exchangeOf(message)?.scatter;
    if (scatter) fromUuidSync(scatter.token)?.object?.showScatterResult?.(scatter.result);
  });
  Hooks.on("updateChatMessage", refreshAttack);
  Hooks.on("deleteChatMessage", refreshAttack);
  // Armor, health and equipment changes alter the live damage preview on open cards.
  const refreshAll = () => { if (!ui.chat) return; for (const message of game.messages.contents.slice(-30)) if (flagsOf(message).weaponAttack?.target) ui.chat.updateMessage(message, { notify: false }); };
  Hooks.on("updateItem", item => { if (item.type === "armor") refreshAll(); });
}
