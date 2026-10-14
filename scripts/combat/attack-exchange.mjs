import { originalProsthesis } from "../data/prosthetic-rules.mjs";
import { schoolCriticalLevel } from "./school-gear-rules.mjs";
import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { sizeClassOf } from "../data/creatures.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { weaponHitTraits, rollWeaponConditions, applyWeaponConditions, weaponConditionReport } from "./weapon-hit-effects.mjs";
import { spiritState, setSlipIncorporeal } from "./creature-spirits.mjs";
import { severHagTongue } from "./hag-actions.mjs";
import { onCreatureDamaged, afterCreatureBite } from "./creature-modes.mjs";
import { creatureHasInfiniteStamina, creatureSeesInvisible } from "../data/creature-modes.mjs";
import { isCreatureSpecial, creatureSpecialDefenses, applyCreatureSpecial, onCreatureExchangeApplied, onCreatureChargeMissed, destroyNoonCopy, creatureHypnosisPenalty } from "./creature-actions.mjs";
import { canAnswerDual, rollChargeContest } from "./brawling.mjs";
import { loadedBolt, firedUpdate } from "./crossbow-ammo.mjs";
import { hasStatus, setStatus, STUNNED } from "./status-effects.mjs";
import { dropItemToGround } from "../loot/loot.mjs";
import { scatterOffset } from "../canvas/scatter-overlay.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem, activeOil } from "../data/workshop.mjs";
import { onDamaged, onHit, onKill, elixirDamage, criticalLocationBonus } from "../workshop/witcher-elixirs.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { trackRollDisplay, waitsForDice, diceSyncEnabled } from "../chat/roll-display.mjs";
import { rollStun } from "./stun-roll.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { woundEffectData, prosthesisAt, setProsthesis } from "./critical-wound-effects.mjs";
import { modifierTotal } from "../data/background-modifiers.mjs";
import { GRAPPLE_ACTIONS, applyGrappleSuccess, grappleState } from "./grapple.mjs";
import { fumbleMagnitude, fumbleOutcome } from "../data/fumbles.mjs";
import { attackConcealed, creatureDetailsHidden, enemyAttackHidden, creatureDetailsSecret } from "../chat/concealment.mjs";
import { defenseQuote, rollDefense } from "./defense-rolls.mjs";
import { hitLocation, bodyPlanOf, attackLocation, weaponAttack, attackModes } from "./weapon-rules.mjs";
import { weaponDamageTraits, armorAt, monsterMaterial, fireVulnerable, resolveDamage } from "./damage-rules.mjs";
import { criticalWoundByRoll, aimedCriticalRoll, criticalWoundLocation, criticalWoundNeedsSide, ORGAN_WOUNDS, ANATOMY_FREE_BONUS } from "../data/critical-wounds.mjs";
import { criticalTableRoll, specterDamageBonus } from "./relic-weapon-rules.mjs";
import { applyWeaponWear } from "./weapon-wear.mjs";
import { experimentalFrozen, clearExperimentalFreeze } from "./experimental-effects.mjs";
import { adrenalineAbsorptionPlan, awardAdrenaline } from "./adrenaline.mjs";
import { magicShieldPlan, absorbWithMagicShield, applySpellHit } from "../magic/spell-effects.mjs";
import { heatedWeapon } from "../magic/cadfan.mjs";
import { igniteDragonClouds } from "./dragon-clouds.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { onPestaStruck } from "./pesta.mjs";
import { onBotchlingStruck, onBotchlingGrappled } from "./journal-beasts.mjs";
import { applyCreatureDamage } from "./creature-actions-damage.mjs";
import { experimentalAmmoReplacesDamage, experimentalAttackRolls, experimentalExchangeOutcome, resolveExperimentalAmmunition, experimentalAmmoHTML } from "./experimental-ammunition.mjs";

// One weapon attack card hosts the whole exchange: each attack roll gets its own defense, location, damage and
// application. Those are separate messages written by whoever owns that step (no cross-owner edits);
// they link back to the attack and are folded out of the log once the card can show them.

const flagsOf = message => message?.flags?.[SYSTEM_ID] ?? {};
const attackItem = (attack, actor) => attack?.groundWeaponUuid
  ? globalThis.fromUuidSync?.(attack.groundWeaponUuid) : actor?.items.get(attack?.itemId);
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
/** A spell strike (core p.168) has no roll of its own: it is the casting check of the source message, Luck included. */
export const attackRolls = message => {
  const projectiles = experimentalAttackRolls(message);
  if (projectiles) return projectiles;
  const source = flagsOf(message).weaponAttack?.spellSource;
  return source ? game.messages.get(source)?.rolls?.slice(0, 1) ?? [] : message.rolls;
};
const attackRoll = (message, index) => attackRolls(message)[index];
/** DC of a target that does not defend: 10 in melee; a ranged attack uses the distance DC plus the size modifier (core pp.164–165). */
export function unawareDC(attack, target) {
  if (attack?.unaware) return attack.unaware.willTriple
    ? { dc: (target?.system?.statistics?.effective?.will ?? 0) * 3, note: `СЛ ${(target?.system?.statistics?.effective?.will ?? 0) * 3}: Воля цели × 3` } : attack.unaware;
  if (!attack?.ranged) return { dc: DC_UNAWARE, note: `СЛ ${DC_UNAWARE}` };
  const size = sizeClassOf(target), base = attack.dc ?? 15, dc = base + size.modifier;
  return { dc, note: `СЛ ${dc}: дистанция ${base}${size.modifier ? `, размер «${size.name}» ${size.modifier > 0 ? "+" : "−"}${Math.abs(size.modifier)}` : ""}` };
}

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
  // One button per weapon or shield so the defender chooses what takes the blow, plus bare-handed options.
  const items = equippedItems(actor.items).filter(item => item.type === "weapon" && ["melee", "shield"].includes(item.system.category));
  // An archespore is rooted (Monster Hunter's Journal p.47): it cannot reposition.
  const rooted = Array.from(actor.items ?? []).some(item => item.type === "ability" && item.system?.ruleId === "creature.rooted");
  const options = [{ mode: "dodge" }, ...(rooted ? [] : [{ mode: "reposition" }]),
    ...(spiritState(actor).canSlip ? [{mode:"slip"}] : []),
    ...items.map(item => ({ mode: "block", itemId: item.id })), { mode: "block", itemId: "" },
    ...items.map(item => ({ mode: "parry", itemId: item.id })), { mode: "parry", itemId: "" }];
  // A restricted list (grapple, joint attack, a spell) keeps the per-item buttons of the modes it allows.
  const modes = allowed?.length && spiritState(actor).canSlip ? [...new Set([...allowed, "slip"])] : allowed;
  const chosen = modes ? modes.flatMap(mode => { const own = options.filter(option => option.mode === mode); return own.length ? own : [{ mode }]; }) : options;
  return chosen.filter(option => !(rooted && option.mode === "reposition")).map(option => ({ ...defenseQuote(actor, { ...option, incoming, defenseModifier }), mode: option.mode, itemId: option.itemId ?? "" }));
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
  const allowed=creatureSpecialDefenses(attack)??GRAPPLE_ACTIONS[attack.special]?.defenses??attack.defenses;
  const replacesDefense = mode === "slip" && spiritState(actor).canSlip && (!allowed || allowed.length > 0);
  if (mode!=="none" && allowed && !allowed.includes(mode) && !replacesDefense) throw new Error("Этот способ защиты не подходит против данной атаки.");
  if (mode === "parry" && attack.hitTraits?.noParry) throw new Error("Эту атаку нельзя парировать. Выберите другую защиту.");
  if (mode === "none") {
    const { dc, note } = unawareDC(attack, actor);
    return post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content: `<p>${esc(actor.name)} не защищается: ${esc(note)}.</p>`,
      flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { ...link, none: true, dc } } } });
  }
  const gang = gangingUp(message), hypnosis = creatureHypnosisPenalty(actor, message.speakerActor), invisible = attack.attackingInvisible && !creatureSeesInvisible(actor) ? -3 : 0;
  const defense = await rollDefense(actor, { mode, itemId, incoming: incomingOf(attack), repeat: repeat ?? repeatDefense(actor), defenseModifier: -gang + hypnosis + invisible,
    exchange: { ...link, gang } });
  if (!defense) return;
  await countDefense(actor);
  // A successful block wears the blocking item by 1 reliability (core p.164).
  const won = defense.rolls[0].total >= attackRoll(message, index).total;
  if (won && mode === "slip") await setSlipIncorporeal(actor);
  if (won && mode === "block" && itemId) {
    const item = actor.items.get(itemId), reliability = effectiveItem(item)?.reliability;
    if (item && !item.system.natural && reliability?.max) {
      // Graveir acid (Monster Hunter's Journal p.17): a successful block takes its own ablation dice instead of 1.
      const dice = attack.hitTraits?.blockWear ? await evaluateRoll(attack.hitTraits.blockWear, { allowInteractive: !message.blind }) : null;
      const wear = await applyWeaponWear(item, (dice?.total ?? 1) * (attack.hitTraits?.wearMultiplier ?? 1),
        { messageMode: message.blind ? "blind" : message.whisper?.length ? "gm" : "public" });
      await defense.update({ [`flags.${SYSTEM_ID}.exchange.wear`]: { name: item.name, from: wear.from, to: wear.to, protectedByRune: wear.protectedByRune, ...(dice ? { roll: dice.total } : {}) } });
    }
  }
  return defense;
}

/** Hit or miss for one attack roll, with the critical level when the margin is large enough. */
export function exchangeOutcome(message, index) {
  const projectile = experimentalExchangeOutcome(message);
  if (projectile) return projectile;
  const attackTotal = attackRoll(message, index)?.total, defense = linked(message.id, index, "defense");
  if (!defense) return null;
  const none = exchangeOf(defense).none, defenseTotal = none ? exchangeOf(defense).dc ?? DC_UNAWARE : defense.rolls[0]?.total;
  const hit = attackTotal > defenseTotal, margin = attackTotal - defenseTotal;
  // Core p.164: a successful block with the body sends the attack's damage into the blocking arm.
  const limbBlock = !hit && !none && Boolean(flagsOf(defense).defense?.limb);
  return { defense, none, attackTotal, defenseTotal, hit, limbBlock, margin, critical: hit && !flagsOf(message).weaponAttack?.special && !flagsOf(message).weaponAttack?.noCritical ? schoolCriticalLevel(margin, flagsOf(message).weaponAttack?.schoolGear) : null,
    mode: flagsOf(defense).defense?.mode ?? "", name: none ? "Без защиты" : flagsOf(defense).defense?.name ?? "Защита" };
}

const pendingRolls = new Set();

/** Record one attacker's step once, with the original attack's audience and dice animation. */
async function rollAttackStep(message, index, kind, prepare) {
  const attack = flagsOf(message).weaponAttack, outcome = exchangeOutcome(message, index), actor = message.speakerActor;
  const key = `${message.id}:${index}:${kind}`;
  if (!attack || attack.illusory || experimentalAmmoReplacesDamage(attack) || !actor?.isOwner || !message.isContentVisible || !(outcome?.hit || outcome?.limbBlock) || pendingRolls.has(key)
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

/** Core p.158: an unaimed critical takes its location from the wound table, not from 1d10. Old cards rolled their location before the attack. */
const criticalPicksLocation = (attack, outcome) => Boolean(outcome?.critical) && (attack.location === "random" || Boolean(attack.locationRoll));

function exchangeLocation(message, index) {
  const attack = flagsOf(message).weaponAttack, outcome = exchangeOutcome(message, index);
  const plan = bodyPlanOf(targetActor(attack));
  // A body block takes the blow on the blocking arm (core p.164); no location roll.
  if (outcome?.limbBlock) return attackLocation(flagsOf(outcome.defense).defense?.defendingLimb ?? "leftArm", plan);
  if (criticalPicksLocation(attack, outcome)) return null;
  return attack.location === "random" ? exchangeOf(linked(message.id, index, "location"))?.location
    : attackLocation(attack.location, plan);
}

export function rollExchangeLocation(message, index) {
  return rollAttackStep(message, index, "location", async (attack, outcome) => {
    if (attack.location !== "random" || criticalPicksLocation(attack, outcome)) return;
    const target = targetActor(attack), plan = bodyPlanOf(target);
    const roll = await evaluateRoll("1d10",{ allowInteractive: !message.blind });
    const { id, name, multiplier } = hitLocation(roll.total, plan, { hasTailOrWings: target?.system.creature?.hasTailOrWings ?? false });
    return { rolls: [roll], flavor: `<h3>${esc(attack.name)} · место попадания</h3><p>${esc(name)} · ×${multiplier} после брони</p>`,
      exchange: { location: { id, name, multiplier }, result: roll.total, bodyPlan: plan } };
  });
}

const frozenSources = actor => Array.from(actor?.effects ?? []).filter(effect => activeEffect(effect)
  && flagsOf(effect).experimental?.kind === "freeze").map(effect => ({ actor: actor.uuid ?? actor.id ?? "", effectId: effect.id }));
const freezeExtra = extra => Boolean(extra?.freeze) || extra?.label === "Алхимическое замораживание";
const damageExtrasFor = (actor, extras = []) => (extras ?? []).filter(extra => !freezeExtra(extra)
  || (extra.freeze ? frozenSources(actor).some(live => extra.freeze.some(source => source.actor === live.actor && source.effectId === live.effectId)) : experimentalFrozen(actor)));

export function rollExchangeDamage(message, index) {
  return rollAttackStep(message, index, "damage", async (attack, outcome, actor) => {
    const woundPicksLocation = criticalPicksLocation(attack, outcome);
    let location = exchangeLocation(message, index);
    if (!location && !woundPicksLocation) return;
    const target = targetActor(attack), item = attackItem(attack, actor), weapon = attack.weaponSnapshot?.system ?? (item ? effectiveItem(item) : {});
    const traits = attack.traits ?? weaponDamageTraits(weapon), material = target ? monsterMaterial(target) : null;
    const options = { allowInteractive: !message.blind };
    const rolls = [await evaluateRoll(attack.damage,options)];
    let hitTraits = attack.hitTraits ?? weaponHitTraits(weapon,actor);
    const ablation = hitTraits.ablating ? await evaluateRoll(hitTraits.ablationDice ?? "floor(1d6 / 2)",options) : null;
    if (ablation) rolls.push(ablation);
    const silver = traits.silverDice && material === "silver" ? await evaluateRoll(traits.silverDice,options) : null;
    if (silver) rolls.push(silver);
    let critical = null;
    if (outcome.critical) {
      const aimed = !woundPicksLocation;
      const critRoll = await evaluateRoll(aimed && ["head", "torso"].includes(location.id) ? "1d6" : aimed ? "0" : "2d6",options);
      if (critRoll.dice.length) rolls.push(critRoll);
      // Katakan decoction (core p.248): +3 to the critical location roll, within the table.
      const rolled = criticalTableRoll(critRoll.total, { weapon: attack.weaponProperties == null ? weapon : { properties: attack.weaponProperties },
        aimed, location: location?.id, extra: criticalLocationBonus(actor) });
      const tableRoll = aimed ? aimedCriticalRoll(location.id, rolled) : rolled;
      if (!aimed) {
        // The wound names the part struck; a limb's side is a coin toss.
        const side = criticalWoundNeedsSide(tableRoll) ? await evaluateRoll("1d2",options) : null;
        if (side) rolls.push(side);
        const id = criticalWoundLocation(tableRoll, bodyPlanOf(target), side?.total);
        location = attackLocation(id, bodyPlanOf(target));
      }
      let wound = criticalWoundByRoll(outcome.critical.id, tableRoll), bonus = outcome.critical.bonus;
      if (wound && anatomyFree(target) && ORGAN_WOUNDS.has(wound.id)) { bonus += ANATOMY_FREE_BONUS[outcome.critical.id]; wound = null; }
      if (attack.nonLethal) wound = null;
      critical = { level: outcome.critical.id, name: outcome.critical.name, bonus, roll: tableRoll, aimed, wound };
    }
    // Core p.248: an active oil adds its bonus against the monster class it was made for.
    const oilItem = attack.weaponSnapshot ?? item;
    const oil = oilItem ? activeOil(oilItem, attack.attackTime ?? game.time?.worldTime ?? 0) : null, category = target?.type === "npc" ? target.system.creature?.category : "humanoid";
    const oilBonus = oil && oil.target === category ? { name: oil.name, bonus: oil.bonus } : null;
    const extras = [...(oilBonus ? [{ label: `Масло: ${oilBonus.name}`, value: oilBonus.bonus }] : []), ...elixirDamage(actor)];
    const held = location.id === "torso" ? grappleState(target).holding?.actor : null;
    const iceSources = [...frozenSources(target), ...frozenSources(held)];
    if (iceSources.length) {
      const ice = await evaluateRoll("2d6",options); rolls.push(ice);
      extras.push({ label: "Алхимическое замораживание", value: ice.total, freeze: iceSources });
    }
    if (attack.adrenalineDice > 0 && index === 0) {
      const adrenaline = await evaluateRoll(`${attack.adrenalineDice}d6`,options); rolls.push(adrenaline);
      extras.push({ label: "Адреналин", value: adrenaline.total });
    }
    // Cadfan's Grasp (core p.103): a heated weapon deals +2d6 and burns with 50%.
    if (heatedWeapon(actor, attack.itemId)) {
      const heat = await evaluateRoll("2d6",options); rolls.push(heat);
      extras.push({ label: "Раскалено (Хватка Кадфана)", value: heat.total });
      hitTraits = { ...hitTraits, burning: Math.max(hitTraits.burning ?? 0, 50) };
    }
    // Monster Hunter's Journal p.29: the hym's shadow claws drain extra damage past armor and location.
    const drain = hitTraits.shadowDrain ? await evaluateRoll(hitTraits.shadowDrain, options) : null;
    if (drain) rolls.push(drain);
    const specter = specterDamageBonus(hitTraits, target);
    if (specter) extras.push({ label: "Лунный лук: против призрака", value: specter });
    return { rolls, flavor: `<h3>${esc(attack.name)} · урон</h3>`,
      exchange: { base: rolls[0].total, silver: silver?.total ?? 0, oil: oilBonus, extras, hitTraits, ablation: ablation?.total ?? 0, drain: drain?.total ?? 0,
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
  const oil = data.extras ?? (data.oil ? [{ label: `Масло: ${data.oil.name}`, value: data.oil.bonus }] : []);
  const extraTotal = oil.filter(extra => !freezeExtra(extra)).reduce((sum, entry) => sum + (entry?.value ?? 0), 0);
  const hit = (actor, armorAtZone, base, silver, crit, extra = damageExtrasFor(actor, oil)) => resolveDamage({ base, silver, location: data.location.id, multiplier: multiplierFor(actor),
    traits: data.traits, armor: armorAtZone, monsterMaterial: monsterMaterial(actor), vulnerableToFire: fireVulnerable(actor), critical: crit, extra });
  // Quen and Active Shield take the raw blow before armor (core p.114); unblockable magic goes straight through.
  const soak = attack.spell && !attack.blockable ? { absorbed: 0 } : magicShieldPlan(target, data.base);
  const preview = { data, target, armor, result: hit(target, armor, data.base - soak.absorbed, data.silver, critical), shield: null, prosthesis: null,
    magicShield: soak.absorbed || 0 };
  const wear = (result, armorAtZone = armor) => {
    if (result.immune) return result;
    const amount = ((result.penetrated ? 1 : 0) + (data.ablation ?? 0)) * (data.hitTraits?.wearMultiplier ?? 1);
    return { ...result, ablate: amount > 0 ? armorAtZone.ablate ?? [] : [], wear: amount,
      steps: amount > 1 ? [...result.steps, {label:"Разрушение брони", value:`ПБ −${amount}`} ] : result.steps };
  };
  preview.result = wear(preview.result);
  if (data.drain && !preview.result.immune) preview.result = { ...preview.result, total: preview.result.total + data.drain,
    steps: [...preview.result.steps, { label: "Теневые когти: мимо брони", value: `+${data.drain}` }] };
  if (preview.magicShield) preview.result = { ...preview.result, steps: [{ label: "Магический щит", value: `−${preview.magicShield}`, detail: "поглощено до брони" }, ...preview.result.steps] };
  // Core p.160: a blow to a prosthesis does not hurt its owner, but knocks the prosthesis off.
  const fitted = prosthesisAt(target, data.location.id);
  if (fitted && !originalProsthesis(fitted.item)) {
    preview.prosthesis = { effectId: fitted.effect.id, itemId: fitted.item.id, name: fitted.item.name };
    preview.result = { ...preview.result, total: 0, ablate: [], penetrated: false,
      steps: [...preview.result.steps, { label: "Удар пришёлся в протез", value: 0, detail: `${fitted.item.name} отваливается, владелец урона не получает` }] };
    return preview;
  }
  // House rule on core p.155: only a held creature can be a living shield. A torso hit goes into it as if it
  // were the target; whatever exceeds its BODY + torso SP gets through to the grappler's torso.
  const holding = data.location.id === "torso" ? grappleState(target).holding : null;
  if (holding?.actor) {
    const shieldArmor = armorAt(holding.actor, "torso"), body = holding.actor.system.statistics?.effective?.body ?? 0;
    const overflow = Math.max(0, data.base + extraTotal - body - shieldArmor.sp);
    preview.shield = { actor: holding.actor, token: holding.token, name: holding.name || holding.actor.name, armor: shieldArmor, body, overflow,
      result: wear(hit(holding.actor, shieldArmor, data.base, data.silver, critical), shieldArmor),
      through: overflow > 0 ? wear(hit(target, armor, overflow, 0, null, damageExtrasFor(target, oil).filter(freezeExtra))) : hit(target, armor, 0, 0, null, null) };
  }
  return preview;
}

/** The prosthesis comes off and lands in front of its owner; without a scene it is simply taken off. */
async function knockOffProsthesis(actor, { effectId, itemId }) {
  const effect = actor.effects.get(effectId), item = actor.items.get(itemId);
  if (effect) await setProsthesis(effect, null);
  if (!item) return;
  if (item.system.equipped) await item.update({ "system.equipped": false });
  const token = actor.token ?? actor.getActiveTokens?.()[0]?.document;
  if (token?.parent) await dropItemToGround(actor, item, { quantity: 1, silent: true }).catch(error => ui.notifications.warn(error.message));
}

/** Push kick (core p.163): the target flies BODY/3 m straight away from the attacker. */
const attackerActor = (attack, message) => (attack.attacker && fromUuidSync(attack.attacker)?.actor) ?? message.speakerActor;
export const pushMeters = attack => attack.schoolShieldStrike ? 4 : Math.max(1, Math.floor((fromUuidSync(attack.attacker)?.actor?.system.statistics?.effective?.body ?? 3) / 3));
async function pushTarget(attack) {
  const from = attack.attacker && fromUuidSync(attack.attacker), to = attack.target && fromUuidSync(attack.target);
  if (!from?.parent || !to?.parent || from.parent !== to.parent || !to.isOwner) return;
  const scene = to.parent, centre = token => ({ x: token.x + token.width * scene.grid.size / 2, y: token.y + token.height * scene.grid.size / 2 });
  const a = centre(from), b = centre(to), length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const pixels = pushMeters(attack) / scene.grid.distance * scene.grid.size;
  let fraction = 1;
  const point = f => ({x:b.x+(b.x-a.x)/length*pixels*f,y:b.y+(b.y-a.y)/length*pixels*f});
  if (attack.schoolShieldStrike && to.object?.checkCollision(point(1), {origin:b,type:"move",mode:"any"})) {
    let low=0,high=1; for(let i=0;i<12;i++){const mid=(low+high)/2;if(to.object.checkCollision(point(mid),{origin:b,type:"move",mode:"any"}))high=mid;else low=mid;} fraction=low;
  }
  await to.update({ x: Math.round(to.x + (b.x - a.x) / length * pixels * fraction), y: Math.round(to.y + (b.y - a.y) / length * pixels * fraction) });
}
const chargeContest = (message, index) => game.messages.contents.map(entry => flagsOf(entry).chargeContest).find(contest => contest?.source === `${message.id}:${index}`) ?? null;

/** HP loss, armor wear and a critical wound on one actor; returns what wore down. */
export async function sufferDamage(actor, result, { wound = null, level = "", location = {}, nonLethal = false, electricity = false, fire = false } = {}) {
  if (nonLethal) { if (!creatureHasInfiniteStamina(actor)) await actor.update({ "system.stamina.value": actor.system.stamina.value - result.total }); }
  else {
    // Full Moon's temporary HP take the blow first; Griffin, Wyvern and Swallow react to it (core pp.247–248).
    const { absorbed } = await onDamaged(actor, result.total);
    const adrenaline = adrenalineAbsorptionPlan(actor, result.total - absorbed);
    result.absorbed = absorbed + adrenaline.absorbed;
    await actor.update({ ...adrenaline.actorUpdate, "system.health.value": actor.system.health.value - adrenaline.remaining });
  }
  const worn = [];
  const wear = result.wear ?? 1;
  for (const id of result.ablate) {
    if (id === "natural") {
      const value = actor.system.creature?.naturalArmor ?? 0;
      if (value > 0) { const to = Math.max(0, value - wear); await actor.update({ "system.creature.naturalArmor": to }); worn.push(`естественная броня ${value} → ${to}`); }
      continue;
    }
    const item = actor.items.get(id), from = item?.system.stoppingPower?.value;
    if (!item || !(from > 0)) continue;
    const to = Math.max(0, from - wear);
    await item.update({ "system.stoppingPower.value": to });
    worn.push(`${item.name} ${from} → ${to}`);
  }
  if (wound && !result.immune) await actor.createEmbeddedDocuments("ActiveEffect", [woundEffectData(wound.id, level, { location: location.id, locationName: location.name, bodyPlan: bodyPlanOf(actor) })]);
  if (!nonLethal && !result.immune && result.total > 0) await onCreatureDamaged(actor, result.total, {electricity, fire});
  return worn;
}

/** A hit by magic without damage: roll and apply its effect once, recorded like an applied blow. */
const pendingSpellEffects = new Set();
export function applySpellEffect(message, index) {
  const attack = flagsOf(message).weaponAttack, target = targetActor(attack), key = `${message.id}:${index}`;
  if (!attack?.spell || attack.damage || !target?.isOwner || !exchangeOutcome(message, index)?.hit || linkedAny(message.id, index, "applied") || pendingSpellEffects.has(key)) return;
  pendingSpellEffects.add(key);
  return inventoryWrite(target, async () => {
    if (linkedAny(message.id, index, "applied")) return;
    const { notes } = await applySpellHit(target, attack);
    return foundry.documents.ChatMessage.implementation.create({ blind: Boolean(message.blind), whisper: [...(message.whisper ?? [])],
      speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }), content: `<p>${esc(target.name)}: ${esc(notes.join("; ") || "без последствий")}</p>`,
      flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index, kind: "applied", total: 0, magicNotes: notes, effects: [] } } } });
  }).finally(() => pendingSpellEffects.delete(key));
}

export function applyExchangeDamage(message, index, options = {}) {
  if (experimentalAmmoReplacesDamage(flagsOf(message).weaponAttack)) return;
  const target = targetActor(flagsOf(message).weaponAttack);
  if (!target?.isOwner) return;
  return inventoryWrite(target, () => applyExchangeDamageNow(message,index,options));
}
async function applyExchangeDamageNow(message, index, { useShield = false, shieldLocked = false } = {}) {
  const preview = damagePreview(message, index);
  if (!preview?.target.isOwner || linkedAny(message.id, index, "applied")) return;
  const { target, data } = preview, health = target.system.health.value, shield = useShield ? preview.shield : null;
  if (shield?.actor.isOwner && !shieldLocked) return inventoryWrite(shield.actor, () => applyExchangeDamageNow(message, index, { useShield, shieldLocked: true }));
  const own = shield ? shield.through : preview.result;
  const attack = flagsOf(message).weaponAttack, nonLethal = Boolean(attack.nonLethal) && !shield;
  const conditions = shield && shield.overflow <= 0 ? {rolls:[],effects:[]} : await rollWeaponConditions(target, data.hitTraits ?? attack.hitTraits, own, {nonLethal, blind: message.blind, ammunition:attack.ammunition, location: data.location.id});
  // Remove only the disorientation that preceded this blow; electricity may cause a new one.
  if (!shield && !own.immune && hasStatus(target, STUNNED)) await setStatus(target, STUNNED, false);
  if (preview.magicShield && !shield) await absorbWithMagicShield(target, preview.magicShield);
  const worn = await sufferDamage(target, own, {electricity:Boolean(data.traits?.electricity), fire:Boolean(data.traits?.types?.includes("elemental")), ...(shield || preview.prosthesis ? {} : { wound: data.critical?.wound, level: data.critical?.level, location: data.location, nonLethal })});
  if (!own.immune && (!shield || shield.overflow > 0) && !preview.prosthesis) await clearExperimentalFreeze(target);
  if ((attack.push || attack.schoolShieldStrike) && !own.immune && own.total >= 0 && !shield) await pushTarget(attack);
  if (attack.schoolShieldStrike && !own.immune && !shield) await setStatus(target, "prone", true);
  if (preview.prosthesis) await knockOffProsthesis(target, preview.prosthesis);
  await applyWeaponConditions(target, conditions.effects);
  const magic = attack.spell && !own.immune ? await applySpellHit(target, attack) : { notes: [] };
  await onCreatureExchangeApplied(message,index,own);
  const exchange = { attack: message.id, index, kind: "applied", total: own.total, steps: own.steps, from: health, nonLethal, immune: Boolean(own.immune), penetrated: Boolean(own.penetrated),
    effects: conditions.effects, magicNotes: magic.notes, schoolCritical: Boolean(data.critical?.wound && !own.immune && !nonLethal && !shield && !preview.prosthesis), critical: Boolean(data.critical && !own.immune && !nonLethal), ablated: worn.join(", "), armorHeld: !own.penetrated && preview.armor.sp > 0 && !shield };
  if (shield) {
    const shieldData = { token: shield.token, name: shield.name, ...shield.result, electricity:Boolean(data.traits?.electricity), hitTraits:data.hitTraits??attack.hitTraits, ammunition:attack.ammunition,
      wound: data.critical?.wound ?? null, level: data.critical?.level ?? "", location: data.location, overflow: shield.overflow,
      ...(data.extras?.some(freezeExtra) ? { freezeDamage: structuredClone(data) } : {}) };
    // The grappler's owner may not own the held creature: the active GM applies that part.
    if (shield.actor.isOwner) {
      const shieldConditions = await rollWeaponConditions(shield.actor,shieldData.hitTraits,shield.result,{blind:message.blind,ammunition:attack.ammunition,location:data.location.id});
      shieldData.ablated = (await sufferDamage(shield.actor, shield.result, shieldData)).join(", ");
      if (!shield.result.immune) await clearExperimentalFreeze(shield.actor);
      await applyWeaponConditions(shield.actor,shieldConditions.effects);
      conditions.rolls.push(...shieldConditions.rolls); shieldData.effects=shieldConditions.effects; shieldData.applied = true;
    }
    exchange.shield = shieldData;
    exchange.schoolCritical = Boolean(shieldData.wound && !shield.result.immune && shieldData.applied);
  }
  return foundry.documents.ChatMessage.implementation.create({ blind: Boolean(message.blind), whisper: [...(message.whisper ?? [])], speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }), content: `<p>${esc(target.name)}: −${own.total - (own.absorbed ?? 0)} ${nonLethal ? "ВЫН" : "ПЗ"}${own.absorbed ? ` (временные ПЗ поглотили ${own.absorbed})` : ""}${shield ? ` · живой щит ${esc(shield.name)}: −${shield.result.total} ПЗ` : ""}${preview.prosthesis ? ` · ${esc(preview.prosthesis.name)} отвалился` : ""}</p>`,
    rolls: conditions.rolls, flavor: weaponConditionReport(conditions.effects),
    flags: { [SYSTEM_ID]: { skipLuck: true, exchange } } });
}

/** Active GM: apply a living shield's share once when its owner could not. */
export async function applyShieldShare(message) {
  const link = exchangeOf(message), share = link?.shield;
  if (link?.kind !== "applied" || !share || share.applied || !game.users.activeGM?.isSelf) return;
  const actor = fromUuidSync(share.token)?.actor;
  if (!actor) return;
  return inventoryWrite(actor, async () => {
    if (exchangeOf(message)?.shield?.applied) return;
    let result = share;
    if (share.freezeDamage) {
      const data = share.freezeDamage, armor = armorAt(actor, data.location.id);
      const multiplier = data.location.multiplier + (data.location.id === "head" ? modifierTotal(actor.system.statistics?.modifiers ?? [], "damage.headMultiplier") : 0);
      result = resolveDamage({ base: data.base, silver: data.silver, traits: data.traits, location: data.location.id, multiplier, armor,
        monsterMaterial: monsterMaterial(actor), vulnerableToFire: fireVulnerable(actor), critical: data.critical,
        extra: damageExtrasFor(actor, data.extras) });
      const wear = ((result.penetrated ? 1 : 0) + (data.ablation ?? 0)) * (data.hitTraits?.wearMultiplier ?? 1);
      Object.assign(result, { wear, ablate: !result.immune && wear > 0 ? armor.ablate : [] });
    }
    const conditions = await rollWeaponConditions(actor,share.hitTraits,result,{blind:message.blind,ammunition:share.ammunition,location:share.location?.id});
    const ablated = await sufferDamage(actor, { ...result, ablate: result.ablate ?? [] }, share);
    if (!result.immune) await clearExperimentalFreeze(actor);
    await applyWeaponConditions(actor,conditions.effects);
    await message.update({ [`flags.${SYSTEM_ID}.exchange.shield`]: { ...share, ...result, applied: true, effects: conditions.effects, ablated: ablated.join(", ") },
      [`flags.${SYSTEM_ID}.exchange.schoolCritical`]: Boolean(share.wound && !result.immune) });
    if(conditions.rolls.length || conditions.effects.length) await post({speaker:foundry.documents.ChatMessage.getSpeaker({actor}),rolls:conditions.rolls,content:weaponConditionReport(conditions.effects),flags:{[SYSTEM_ID]:{skipLuck:true}}},message.blind?"blind":message.whisper?.length?"gm":"public");
  });
}

// ── Fumbles (core p.157, errata v4) ─────────────────────────────────────────

function attackFumbleTable(message, attack) {
  if (attack.unarmed || (attack.special && !attack.special.startsWith("weapon-"))) return "unarmed";
  const item = attackItem(attack, message.speakerActor) ?? attack.weaponSnapshot;
  if (attack.ranged) return "ranged";
  return item?.system.skill === "brawling" ? "unarmed" : "melee";
}
export function attackFumble(message, index) {
  const attack = flagsOf(message).weaponAttack;
  // A spell's own fumble is the magical one, resolved on the casting card.
  if (attack?.spell || attack?.spellSource) return null;
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
export function fumbleSteps(outcome, actor, itemId, attack = null) {
  if (!outcome) return [];
  const apply = outcome.apply, item = itemId ? actor?.items.get(itemId) : null, steps = [];
  if (attack?.thrown && outcome.table === "ranged" && outcome.magnitude >= 6 && outcome.magnitude <= 7)
    steps.push({ id: "break", label: "Брошенное оружие сломалось", hint: "Обнулить надёжность брошенного предмета; руна Чернобог может защитить его" });
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

function fumbleStepAllowed(message, role, actor, step) {
  if (!actor?.isOwner) return false;
  const attack = flagsOf(message).weaponAttack;
  if (role !== "attack" || !attack?.thrownDrop || !["break", "reliability", "jam", "disarm", "stuck"].includes(step.id)) return true;
  // The ground pile belongs to the GM, and a remaining inventory stack is a different physical copy.
  return attack.thrownDrop.state === "complete" && Boolean(attackItem(attack, actor)?.isOwner);
}

/** Runs one consequence for the owner of the fumbling actor. */
export async function runFumbleStep({ message, index, role, actor, itemId, outcome, step }) {
  if (!fumbleStepAllowed(message, role, actor, step) || !outcome || stepDone(message, index, role, step.id)) return;
  const key = `${message.id}:${index}:${role}:${step.id}`;
  if (pendingRolls.has(key)) return;
  pendingRolls.add(key);
  try {
    const attack = flagsOf(message).weaponAttack;
    const notes = [], rolls = [], extra = {}, item = role === "attack" ? attackItem(attack, actor) : itemId ? actor.items.get(itemId) : null;
    const roll = async formula => { const result = await evaluateRoll(formula); rolls.push(result); return result; };
    if (step.id === "status") { await applyStatus(actor, outcome.apply.status); notes.push(`${CONDITION_BY_ID[outcome.apply.status].name}`); }
    if (step.id === "reliability" || step.id === "break") {
      const result = step.id === "break" ? { total: item?.system.reliability?.value ?? 0 } : await roll(step.dice);
      if (item?.system.reliability?.max) {
        const wear = await applyWeaponWear(item, result.total, { messageMode: message.blind ? "blind" : message.whisper?.length ? "gm" : "public" });
        notes.push(`${item.name}: надёжность −${wear.from - wear.to} (${wear.to}${wear.to === 0 ? ", сломано" : ""})${wear.protectedByRune ? " · Чернобог защитил оружие" : ""}`);
      } else notes.push(`урон надёжности ${result.total}`);
    }
    if (step.id === "head") {
      const result = await roll(step.dice);
      await sufferDamage(actor, { total: result.total, ablate: [] }, { nonLethal: Boolean(outcome.apply.nonLethal) });
      notes.push(`${result.total} ${outcome.apply.nonLethal ? "несмертельного" : "смертельного"} урона в голову`);
    }
    if (step.id === "self" || step.id === "ally") {
      const plan = step.id === "self" ? bodyPlanOf(actor) : "humanoid";
      const where = hitLocation((await roll("1d10")).total, plan), damage = await roll(weaponDamageFormula(actor, item, attack, role));
      if (step.id === "self") {
        const armor = armorAt(actor, where.id), traits = role === "attack" && attack?.weaponSnapshot ? weaponDamageTraits(attack.weaponSnapshot.system) : weaponDamageTraits(item ? effectiveItem(item) : {});
        const result = resolveDamage({ base: damage.total, location: where.id, multiplier: where.multiplier, traits, armor, monsterMaterial: monsterMaterial(actor), vulnerableToFire: fireVulnerable(actor) });
        const worn = await sufferDamage(actor, result);
        notes.push(`${where.name}: урон ${damage.total} → −${result.total} ПЗ${worn.length ? `; ПБ −1: ${worn.join(", ")}` : ""}`);
      } else {
        notes.push(`союзнику: ${where.name} (×${where.multiplier}), урон ${damage.total} до брони`);
        extra.ally = { location: { id: where.id, name: where.name, multiplier: where.multiplier }, damage: damage.total, traits: role === "attack" && attack?.weaponSnapshot ? weaponDamageTraits(attack.weaponSnapshot.system) : weaponDamageTraits(item ? effectiveItem(item) : {}) };
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
      if (loadedBolt(item)) await item.update(firedUpdate(item));
      if (item) await blockWeapon(actor, item, "jammed", `Заклинило: ${item.name}`, `${item.name} нельзя использовать до конца вашего следующего хода: тетива слетела или механизм заклинило.`, 1);
      notes.push(item?.system.skill === "crossbow" ? `${item.name}: заклинило, нужна перезарядка` : "1 раунд на исправление");
    }
    if (step.id === "stuck") {
      if (item) await blockWeapon(actor, item, "stuck", `Оружие застряло: ${item.name}`, `${item.name} застряло в ближайшем предмете. Пока его не достанете (это действие), им нельзя атаковать и блокировать.`, null);
      notes.push(`${item?.name ?? "Оружие"} застряло: достать — действие`);
    }
    if (step.id === "stun") { await rollStun(actor, { test: true }); notes.push("испытание Устойчивости брошено"); }
    return await post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), rolls, whisper: [...(message.whisper ?? [])], blind: Boolean(message.blind), content: `<p>Провал: ${esc(notes.join("; "))}</p>`,
      flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index, kind: stepKind(role, step.id), notes, ...extra } } } }, message.blind ? "blind" : message.whisper?.length ? "gm" : "public");
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
    monsterMaterial: monsterMaterial(victim), vulnerableToFire: fireVulnerable(victim) });
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
  for (const step of fumbleSteps(outcome, actor, itemId, role === "attack" ? flagsOf(message).weaponAttack : null)) await runFumbleStep({ ...context, step });
}

const fumbleHTMLSecret = (...args) => fumbleHTML(...args).replace('class="witcher-exchange-fumble"', 'class="witcher-exchange-fumble witcher-gm-only" data-tooltip="Игроки не видят до выбора защиты"');

function fumbleHTML(message, index, role, outcome, owner, actor, itemId) {
  if (!outcome) return "";
  const steps = fumbleSteps(outcome, actor, itemId, role === "attack" ? flagsOf(message).weaponAttack : null);
  const rows = steps.map(step => {
    const done = stepDone(message, index, role, step.id);
    const result = done ? `<span class="is-done"><i class="fa-solid fa-check"></i> ${esc(exchangeOf(done).notes?.join("; ") || "применено")}</span>`
      : owner && fumbleStepAllowed(message, role, actor, step) ? button(`data-fumble-step="${role}:${step.id}" data-index="${index}"`, `<i class="fa-solid ${step.dice ? "fa-dice-d10" : "fa-check"}"></i> ${esc(step.label)}`, true, step.hint)
      : `<span class="is-pending">${esc(step.label)} — ${flagsOf(message).weaponAttack?.thrownDrop && ["break", "reliability", "jam", "stuck"].includes(step.id) ? "применяет мастер после переноса оружия" : "ждём бросок"}</span>`;
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
  const total = attackRoll(message, index)?.total, target = targetActor(attack), outcome = exchangeOutcome(message, index);
  const projectile = Boolean(attack.experimentalParent);
  // Until the defense is chosen (and its dice landed) the defender does not learn the total or a fumble.
  const concealed = attackConcealed(message) && !outcome?.defense;
  // The GM and the attacker's owners see it, marked like pf2e's GM-only info.
  const secret = !concealed && enemyAttackHidden(message) && !outcome?.defense;
  const head = `<header><span>Атака ${attack.count > 1 ? `${index + 1} ` : ""}<b class="${secret ? "witcher-gm-only" : ""}" ${secret ? 'data-tooltip="Игроки не видят до выбора защиты"' : ""}>${concealed ? '<i class="fa-solid fa-eye-slash" data-tooltip="Итог атаки откроется после выбора защиты"></i>' : total}</b></span>`;
  const ownFumble = concealed || projectile ? "" : (secret ? fumbleHTMLSecret : fumbleHTML)(message, index, "attack", attackFumble(message, index), message.speakerActor?.isOwner, message.speakerActor, attack.itemId);
  if (exchangeOf(linkedAny(message.id,index,"applied"))?.copyDestroyed) return `<li class="is-hit">${head}<strong>Копия уничтожена попаданием</strong></header></li>`;
  const hideTargetNumbers = creatureDetailsHidden(target);
  if (!outcome) {
    if (!target?.isOwner) return `<li class="is-waiting">${head}<em>${linkedAny(message.id, index, "defense") ? "защита бросается…" : "ждём защиту"}</em></header>${ownFumble}</li>`;
    if (linkedAny(message.id, index, "defense")) return `<li class="is-waiting">${head}<em><i class="fa-solid fa-dice-d10 fa-spin"></i> защита бросается…</em></header>${ownFumble}</li>`;
    const gang = gangingUp(message), hypnosis = creatureHypnosisPenalty(target,message.speakerActor), invisible = attack.attackingInvisible && !creatureSeesInvisible(target) ? -3 : 0;
    const dualLimit = attack.dual && !canAnswerDual(target, equippedItems(target.items)) ? ["dodge", "reposition"] : null;
    const choices = defenseChoices(target, incomingOf(attack), -gang + hypnosis + invisible, creatureSpecialDefenses(attack) ?? GRAPPLE_ACTIONS[attack.special]?.defenses ?? attack.defenses ?? dualLimit).filter(choice => !(attack.hitTraits?.noParry && choice.mode === "parry")).map(choice => button(`data-exchange-defend="${choice.mode}" data-item-id="${choice.itemId ?? ""}"`,
      `${esc(choice.name)}${choice.weaponName ? ` · ${esc(choice.weaponName)}` : ""}${choice.total != null && !choice.blocked ? ` <b>+${choice.total}</b>` : ""}`, !choice.blocked, choice.blocked || choice.note));
    const free = defenseChoices(target, incomingOf(attack))[0]?.activeDodge;
    const repeatBox = `<button type="button" class="witcher-exchange-repeat" data-exchange-repeat aria-pressed="${!free && repeatDefense(target)}" ${free ? "disabled" : ""} data-tooltip="${free ? "Активное уклонение: повторные защиты бесплатны" : "Вторая и следующие защиты за раунд стоят 1 ВЫН. Нажмите, чтобы переключить."}"><i class="fa-solid fa-rotate"></i> Повторная · ${free ? 0 : 1} ВЫН</button>`;
    const gangNote = gang ? `<p class="witcher-exchange-note" data-tooltip="Errata: −1 к защите за каждого нападающего в ближнем бою сверх первого">Объединение сил: ${gang + 1} нападающих в этом раунде · защита −${gang}</p>` : "";
    return `<li class="is-waiting">${head}<em>защита ${esc(target.name)}</em>${repeatBox}</header>${gangNote}<div class="witcher-exchange-actions">${choices.join("")}${button('data-exchange-defend="none"', "Не защищается", true, `Атака сравнивается со ${unawareDC(attack, target).note}`)}</div>${ownFumble}</li>`;
  }
  const verdict = outcome.hit ? `<strong class="is-hit">Попадание +${outcome.margin}</strong>` : outcome.limbBlock ? `<strong class="is-hit">Заблокировано рукой</strong>`
    : `<strong class="is-miss">${outcome.mode === "parry" ? "Парировано" : outcome.mode === "block" ? "Заблокировано" : "Промах"}</strong>`;
  const gang = exchangeOf(outcome.defense).gang;
  const defenseLine = `${esc(outcome.name)} <b>${outcome.defenseTotal}</b>${gang ? ` <small data-tooltip="Объединение сил: нападающих в этом раунде ${gang + 1}">(объединение сил −${gang})</small>` : ""}`;
  let body = ownFumble + (projectile ? "" : fumbleHTML(message, index, "defense", outcome.none ? null : defenseFumble(outcome.defense), target?.isOwner, target, flagsOf(outcome.defense)?.defense?.itemId));
  if (outcome.critical) body += `<p class="witcher-exchange-crit"><i class="fa-solid fa-burst"></i> Критическое ранение: ${esc(outcome.critical.name.toLocaleLowerCase("ru"))} (+${outcome.critical.bonus} урона)</p>`;
  if (!outcome.hit && outcome.mode === "parry") body += `<p class="witcher-exchange-note"><i class="fa-solid fa-person-falling"></i> ${esc(message.speakerActor?.name ?? "Атакующий")} ошеломлён: −2 к атаке и защите до начала своего хода.</p>`;
  const wear = exchangeOf(outcome.defense).wear;
  if (wear) body += `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield-halved"></i> Удар принял ${esc(wear.name)}${wear.roll ? ` (разрушающий урон ${wear.roll})` : ""}: надёжность ${wear.from} → ${wear.to}${wear.to === 0 ? " · сломано" : ""}</p>`;
  if (attack.special) {
    const done = linkedAny(message.id, index, "special"), name = GRAPPLE_ACTIONS[attack.special]?.name ?? "";
    if (outcome.hit) body += done ? `<p class="witcher-exchange-applied is-special"><i class="fa-solid fa-hand-back-fist"></i> ${esc(exchangeOf(done).notes?.join(" ") ?? "")}</p>`
      : `<p class="witcher-exchange-note"><i class="fa-solid fa-hourglass-half"></i> ${esc(name)}: удалось — мастер применяет результат…</p>`;
    else body += `<p class="witcher-exchange-note">${esc(name)}: не удалось.</p>`;
    return `<li class="${outcome.hit ? "is-hit" : "is-miss"}">${head}<span>${defenseLine}</span><strong class="${outcome.hit ? "is-hit" : "is-miss"}">${outcome.hit ? "Удалось" : "Не удалось"}</strong></header>${body}</li>`;
  }
  if (attack.charge && !outcome.hit && !outcome.limbBlock && outcome.mode === "block") {
    const contest = chargeContest(message, index);
    body += contest ? `<p class="witcher-exchange-note"><i class="fa-solid fa-person-falling"></i> С разбега: ${contest.success ? "противник сбит с ног" : "противник устоял"}.</p>`
      : message.speakerActor?.isOwner ? `<div class="witcher-exchange-actions">${button("data-exchange-charge", '<i class="fa-solid fa-person-falling"></i> Сбить с ног · Сила против Силы', true, "Атака с разбега заблокирована: встречная проверка Силы")}</div>`
      : `<p class="witcher-exchange-note">Атакующий может попытаться сбить с ног: Сила против Силы.</p>`;
  }
  if (outcome.limbBlock) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-hand"></i> Блок телом: урон атаки приходится в подставленную руку, ПБ учитывается. Критического ранения нет.</p>`;
  // Monster Hunter's Journal p.19: a foglet's illusory copy forces a defense, but its hit deals no damage.
  if (attack.illusory && (outcome.hit || outcome.limbBlock)) return `<li class="is-hit">${head}<span>${defenseLine}</span>${verdict}</header>${body}<p class="witcher-exchange-note"><i class="fa-solid fa-ghost"></i> Иллюзия: попадание не наносит урона.</p></li>`;
  if (experimentalAmmoReplacesDamage(attack)) return `<li class="${outcome.hit ? "is-hit" : "is-miss"}">${head}<span>${defenseLine}</span></header>${body}${experimentalAmmoHTML(message, index, outcome)}</li>`;
  // Magic without damage (Aard, Axii, Blinding Dust…): a hit applies the spell's own effect, no location or damage.
  if (outcome.hit && attack.spell && !attack.damage) {
    const applied = linked(message.id, index, "applied");
    if (applied) body += `<p class="witcher-exchange-applied"><i class="fa-solid fa-wand-sparkles"></i> ${esc(exchangeOf(applied).magicNotes?.join("; ") || "Эффект применён.")}</p>`;
    else if (target?.isOwner) body += `<div class="witcher-exchange-actions">${button("data-exchange-spell-effect", '<i class="fa-solid fa-wand-sparkles"></i> Применить эффект магии', true)}</div>`;
    else body += `<p class="witcher-exchange-note">Эффект применяет владелец цели или мастер.</p>`;
    return `<li class="is-hit">${head}<span>${defenseLine}</span>${verdict}</header>${body}</li>`;
  }
  if (outcome.hit || outcome.limbBlock) {
    const damage = linked(message.id, index, "damage"), applied = linked(message.id, index, "applied");
    if (!damage && linkedAny(message.id, index, "damage")) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-dice-d6 fa-spin"></i> Урон бросается…</p>`;
    else if (!damage) {
      const location = exchangeLocation(message, index), locationMessage = linkedAny(message.id, index, "location");
      if (criticalPicksLocation(attack, outcome)) {
        body += `<p class="witcher-exchange-location"><i class="fa-solid fa-burst"></i> ${esc(outcome.critical.name)} критическое ранение: место попадания определит рана (2d6), а не 1d10</p>`;
        body += message.speakerActor?.isOwner ? `<div class="witcher-exchange-actions">${button("data-exchange-damage", `<i class="fa-solid fa-dice-d6"></i> Урон ${esc(attack.damage)} и критическая рана`, true)}</div>` : `<p class="witcher-exchange-note">Ждём бросок урона и критической раны.</p>`;
      } else if (!location) {
        if (locationMessage) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-dice-d10 fa-spin"></i> Бросается место попадания…</p>`;
        else body += message.speakerActor?.isOwner ? `<div class="witcher-exchange-actions">${button("data-exchange-location", '<i class="fa-solid fa-dice-d10"></i> Место попадания · 1d10', true)}</div>` : `<p class="witcher-exchange-note">Ждём бросок места попадания.</p>`;
      } else {
        body += `<p class="witcher-exchange-location">${locationMessage ? `1d10: <b>${exchangeOf(locationMessage).result}</b> → ` : "Место попадания: "}<b>${esc(location.name)}</b> · ×${location.multiplier === 0.5 ? "½" : location.multiplier} после брони</p>`;
        body += message.speakerActor?.isOwner ? `<div class="witcher-exchange-actions">${button("data-exchange-damage", `<i class="fa-solid fa-dice-d6"></i> Урон ${esc(attack.damage)}`, true)}</div>` : `<p class="witcher-exchange-note">Ждём бросок урона.</p>`;
      }
    }
    else {
      const data = exchangeOf(damage), wound = data.critical?.wound;
      body += `<p class="witcher-exchange-damage">Урон <b>${data.base}</b>${(data.extras ?? (data.oil ? [{ label: "масло", value: data.oil.bonus }] : [])).map(entry => ` + ${esc(entry.label.replace(/^Масло:.*/u, "масло").toLocaleLowerCase("ru"))} <b>${entry.value}</b>${freezeExtra(entry) ? " <small>(при действующем льде)</small>" : ""}`).join("")}${data.silver ? ` + серебро <b>${data.silver}</b>` : ""} → ${esc(data.location.name)}${data.location.multiplier !== 1 ? ` (×${data.location.multiplier === 0.5 ? "½" : data.location.multiplier})` : ""}</p>`;
      if (wound) body += `<details class="witcher-exchange-wound"><summary>${esc(wound.name)}</summary><p>${esc(wound.effect)}</p></details>`;
      if (applied) {
        const result = exchangeOf(applied);
        if (result.effects?.length) body += `<p class="witcher-exchange-note">${esc(weaponConditionReport(result.effects))}</p>`;
        if (result.magicNotes?.length) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-wand-sparkles"></i> ${esc(result.magicNotes.join("; "))}</p>`;
        if (result.shield) body += `<p class="witcher-exchange-applied is-shield" data-tooltip="${esc(stepsHTML(result.shield.steps))}" data-tooltip-class="witcher-roll-tooltip"><i class="fa-solid fa-user-shield"></i> Живой щит ${esc(result.shield.name)}: −${result.shield.total} ПЗ${result.shield.applied ? "" : " <small>(применяет мастер)</small>"}</p>${result.shield.ablated ? `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield-halved"></i> ПБ щита −1: ${esc(result.shield.ablated)}</p>` : ""}`;
        const unit = result.nonLethal ? "ВЫН" : "ПЗ";
        if (hideTargetNumbers) body += `<p class="witcher-exchange-applied"><i class="fa-solid fa-heart-crack"></i> −${result.total} ${unit}</p>`;
        else body += `<p class="witcher-exchange-applied" data-tooltip="${esc(stepsHTML(result.steps))}" data-tooltip-class="witcher-roll-tooltip"><i class="fa-solid fa-heart-crack"></i> −${result.total} ${unit}${result.shield ? " сквозь щит" : ""}${result.nonLethal ? " · несмертельный" : ""}</p>${result.ablated ? `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield-halved"></i> Износ брони: ${esc(result.ablated)}</p>` : result.armorHeld ? `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield"></i> Броня выдержала удар — ПБ не снижается</p>` : ""}`;
        // Core p.158: every critical wound also forces a Stun save.
        if (data.critical && !result.immune && target?.isOwner) body += `<div class="witcher-exchange-actions">${button("data-exchange-stun", '<i class="fa-solid fa-dice-d10"></i> Испытание Устойчивости', true, "Критическое ранение требует испытания УСТ")}</div>`;
      } else if (target?.isOwner) {
        const preview = damagePreview(message, index), shield = preview.shield;
        if (shield) body += `<div class="witcher-exchange-shield"><p><i class="fa-solid fa-user-shield"></i> <b>Живой щит:</b> ${esc(shield.name)} в захвате прикрывает туловище. Удар принимает он; в вас проходит только урон сверх его ТЕЛ ${shield.body} + ПБ ${shield.armor.sp} = <b>${shield.overflow}</b>.</p>
          <div class="witcher-exchange-actions">${button("data-exchange-apply-shield", `<i class="fa-solid fa-user-shield"></i> Прикрыться: щит −${shield.result.total}, вам −${shield.through.total}`, true)}${button("data-exchange-apply", `<i class="fa-solid fa-heart-crack"></i> Принять самому −${preview.result.total}`, true)}</div>
          <details><summary>Расчёт для щита</summary>${stepsHTML(shield.result.steps)}</details><details><summary>Расчёт без щита</summary>${stepsHTML(preview.result.steps)}</details></div>`;
        else body += `<div class="witcher-exchange-actions">${button("data-exchange-apply", `<i class="fa-solid fa-heart-crack"></i> Применить −${preview.result.total} ${attack.nonLethal ? "ВЫН" : "ПЗ"}`, true)}</div>${stepsHTML(preview.result.steps)}${attack.push ? `<p class="witcher-exchange-note">Толчок: цель отлетит на ${pushMeters(attack)} м от атакующего.</p>` : ""}`;
      } else body += `<p class="witcher-exchange-note">Урон применяет владелец цели или мастер.</p>`;
    }
  }
  return `<li class="${outcome.hit || outcome.limbBlock ? "is-hit" : "is-miss"}">${head}<span>${defenseLine}</span>${verdict}</header>${body}</li>`;
}

export function renderExchange(message, html) {
  const flags = flagsOf(message);
  if (exchangeOf(message) && game.messages.has(exchangeOf(message).attack)) { html.classList.add("witcher-ambush-folded"); html.hidden = true; return; }
  const attack = flags.weaponAttack;
  if (!attack || !message.isContentVisible || !attackRolls(message).length) return;
  if (!attack.target) return renderUntargetedFumbles(message, html, attack);
  const section = html.querySelector(".witcher-attack-chat, .witcher-magic-chat");
  if (!section) return;
  for (const legacy of section.querySelectorAll("[data-weapon-damage], .witcher-location-buttons")) legacy.remove();
  const target = targetActor(attack);
  const list = document.createElement("div");
  list.className = "witcher-exchange";
  list.innerHTML = `<h4><i class="fa-solid fa-swords"></i> Против: ${esc(target?.name ?? "цель недоступна")}</h4><ol>${attackRolls(message).map((_roll, index) => exchangeRowHTML(message, index, attack)).join("")}</ol>`;
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
    run("[data-exchange-spell-effect]", () => applySpellEffect(message, index));
    run("[data-exchange-apply-shield]", () => applyExchangeDamage(message, index, { useShield: true }));
    run("[data-exchange-stun]", () => rollStun(targetActor(attack)));
    run("[data-exchange-charge]", () => chargeContest(message, index) ? null : rollChargeContest(attackerActor(attack, message), targetActor(attack), `${message.id}:${index}`));
    const fumbleContext = role => {
      if (role === "attack") return { message, index, role, actor: message.speakerActor, itemId: attack.itemId, outcome: attackFumble(message, index), author: message.author?.id };
      const defense = linked(message.id, index, "defense");
      return { message, index, role, actor: targetActor(attack), itemId: flagsOf(defense)?.defense?.itemId, outcome: defense ? defenseFumble(defense) : null, author: defense?.author?.id };
    };
    row.querySelectorAll("[data-fumble-step]").forEach(control => control.addEventListener("click", async event => {
      event.stopPropagation(); control.disabled = true;
      const [role, id] = control.dataset.fumbleStep.split(":"), context = fumbleContext(role);
      const step = fumbleSteps(context.outcome, context.actor, context.itemId, role === "attack" ? attack : null).find(entry => entry.id === id);
      try { if (step) await runFumbleStep({ ...context, step }); } catch (error) { ui.notifications.warn(error.message); }
    }));
    row.querySelectorAll("[data-fumble-ally]").forEach(control => control.addEventListener("click", async event => {
      event.stopPropagation(); control.disabled = true;
      try { await applyFumbleToTarget(fumbleContext(control.dataset.fumbleAlly)); } catch (error) { control.disabled = false; ui.notifications.warn(error.message); }
    }));
    if (!attack.experimentalParent) for (const role of ["attack", "defense"]) autoResolveFumble(fumbleContext(role)).catch(console.error);
  });
}

/** Hide what the defender must not know yet, and a creature's numbers from players who do not own it. */
function concealAttackCard(message, html, attack) {
  const hasDefense = index => Boolean(exchangeOutcome(message, index)?.defense);
  if (attackConcealed(message) && attackRolls(message).some((_roll, index) => !hasDefense(index))) {
    html.querySelectorAll(".dice-roll").forEach((element, index) => {
      if (hasDefense(index)) return;
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
    if (!hasDefense(index)) { element.classList.add("witcher-gm-only"); element.dataset.tooltip ??= "Игроки не видят до выбора защиты"; }
  });
  if (!attackConcealed(message) && enemyAttackHidden(message) && attackRolls(message).some((_roll, index) => !hasDefense(index)))
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
    const step = fumbleSteps(ctx.outcome, ctx.actor, ctx.itemId, attack).find(entry => entry.id === id);
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
  // Spending Luck on a casting check changes the total of every spell strike made from it.
  if (flagsOf(message).magicCast && ui.chat) for (const strike of game.messages.contents.slice(-40))
    if (flagsOf(strike).weaponAttack?.spellSource === message.id) ui.chat.updateMessage(strike, { notify: false });
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
  if (outcome && experimentalAmmoReplacesDamage(flagsOf(attackMessage).weaponAttack)) {
    await resolveExperimentalAmmunition(attackMessage, link.index, outcome);
    return;
  }
  if (outcome?.hit && game.users.activeGM?.isSelf) {
    const attack = flagsOf(attackMessage).weaponAttack, token = targetToken(attack);
    if (attack?.spell && attack.traits?.types?.includes("elemental") && token?.parent)
      await igniteDragonClouds(token.parent, tokenCenter(token));
  }
  if (outcome?.hit && game.users.activeGM?.isSelf) { await onPestaStruck(flagsOf(attackMessage).weaponAttack); await onBotchlingStruck(attackMessage); }
  if (outcome?.hit && game.users.activeGM?.isSelf && !linkedAny(attackMessage.id,link.index,"applied")) {
    const token = targetToken(flagsOf(attackMessage).weaponAttack);
    if (token?.actor?.flags?.[SYSTEM_ID]?.noonCopy && await destroyNoonCopy(token)) {
      await post({content:"<p>Копия уничтожена попаданием.</p>",flags:{[SYSTEM_ID]:{skipLuck:true,exchange:{attack:attackMessage.id,index:link.index,kind:"applied",copyDestroyed:true,total:0}}}},attackMessage.blind?"blind":attackMessage.whisper?.length?"gm":"public");
      return;
    }
  }
  if (outcome?.hit && flagsOf(attackMessage).weaponAttack?.special) {
    if (game.users.activeGM?.isSelf) {
      if (isCreatureSpecial(flagsOf(attackMessage).weaponAttack)) await applyCreatureSpecial(attackMessage,link.index,outcome);
      else { await applyGrappleSuccess(attackMessage); await onBotchlingGrappled(attackMessage, applyCreatureDamage); }
    }
    return;
  }
  // A creature charge that was blocked or dodged has its own consequences (graveir).
  if (outcome && !outcome.hit && game.users.activeGM?.isSelf) await onCreatureChargeMissed(attackMessage, link.index, outcome);
  if (!outcome || outcome.hit || outcome.mode !== "parry") return;
  const attack = flagsOf(attackMessage).weaponAttack;
  const attacker = (attack.attacker && fromUuidSync(attack.attacker)?.actor) ?? attackMessage.speakerActor;
  const writer = game.users.activeGM ? game.users.activeGM.isSelf : attacker?.isOwner;
  if (!attacker || !writer) return;
  await severHagTongue(attacker,attacker.items.get(attack.itemId),targetActor(attack)?.items.get(flagsOf(outcome.defense).defense?.itemId));
  const key = `${attackMessage.id}:${link.index}`;
  if (attacker.effects.some(effect => effect.flags?.[SYSTEM_ID]?.parryKey === key)) return;
  const old = attacker.effects.filter(effect => effect.statuses.has("staggered"));
  if (old.length) await attacker.deleteEmbeddedDocuments("ActiveEffect", old.map(effect => effect.id));
  const source = conditionSource(CONDITION_BY_ID.staggered); delete source._id;
  await attacker.createEmbeddedDocuments("ActiveEffect", [{ ...source, start: fullTurnStart(attacker),
    duration: { value: 1, units: "rounds", expiry: "turnStart", expired: false }, flags: { [SYSTEM_ID]: { ...source.flags[SYSTEM_ID], parryKey: key } } }]);
}

/** Active GM: a hit that dealt damage or killed feeds the attacker's elixirs (Wyvern, Blizzard, Grave Hag). */
async function elixirEvents(message) {
  const link = exchangeOf(message);
  if (link?.kind !== "applied" || link.nonLethal || !game.users.activeGM?.isSelf) return;
  const source = game.messages.get(link.attack), attacker = source?.speakerActor, target = targetActor(flagsOf(source ?? {}).weaponAttack ?? {});
  if (!attacker || !(link.total > 0)) return;
  const attack = flagsOf(source).weaponAttack;
  if (link.critical) await awardAdrenaline(attacker, attackItem(attack, attacker) ?? attack?.weaponSnapshot, { eventId: `${link.attack}:${link.index}` });
  await onHit(attacker);
  if (link.from > 0 && (target?.system.health.value ?? 1) <= 0) await onKill(attacker);
}

const pendingBites = new Set();
/** The victim's player may apply damage without owning the vampire. Its reaction belongs to the GM. */
export async function applyCreatureBite(message) {
  const link = exchangeOf(message);
  if (!game.users.activeGM?.isSelf || link?.kind !== "applied" || link.nonLethal || link.biteApplied || pendingBites.has(message.id)) return;
  const source = game.messages.get(link.attack), attack = flagsOf(source).weaponAttack, attacker = source?.speakerActor;
  const weapon = attacker?.items.get(attack?.itemId), result = link.shield ?? link;
  if (!weapon?.system.natural || weapon.name !== "Укус" || !result.penetrated || !(result.total > 0) || result.immune || link.shield && !link.shield.applied) return;
  const victim = link.shield ? fromUuidSync(link.shield.token)?.actor : targetActor(attack);
  if (!victim || !attacker.isOwner) return;
  pendingBites.add(message.id);
  try {
    await afterCreatureBite(attacker, victim, message.id);
    await message.update({ [`flags.${SYSTEM_ID}.exchange.biteApplied`]: true });
  } finally { pendingBites.delete(message.id); }
}

export function registerAttackExchange() {
  Hooks.on("createChatMessage", message => elixirEvents(message).catch(console.error));
  Hooks.on("renderChatMessageHTML", renderExchange);
  Hooks.on("createChatMessage", message => { try { settleThenRefresh(message); } catch (error) { console.error(error); } });
  Hooks.on("createChatMessage", message => {
    applyShieldShare(message).then(() => applyCreatureBite(message)).catch(console.error);
    applyDeferredShare(message).catch(console.error);
  });
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
