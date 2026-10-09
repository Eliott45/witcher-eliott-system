import { SYSTEM_ID } from "../config.mjs";
import { activeDoses, consumedDose } from "../data/consumables.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { creatureRegeneration } from "../data/creature-regeneration.mjs";
import { creatureProfile } from "../data/creature-modes.mjs";

// Core pp.247–248: witcher potions and decoctions whose effects depend on combat events. Hits, kills and
// turn starts come from the attack exchange and the turn-start tick; this module keeps the counters on the
// dose effect itself, so they end with the dose (or at the end of the fight, where the book says so).
export const dose = (actor, ruleId) => activeDoses(actor ?? { effects: [] }).find(effect => consumedDose(effect).ruleId === ruleId) ?? null;
const state = effect => effect?.flags?.[SYSTEM_ID]?.elixirState ?? {};
const setState = (effect, changes) => effect.update({ [`flags.${SYSTEM_ID}.elixirState`]: { ...state(effect), ...changes } });

/** Full Moon: +30 temporary HP for the duration; they absorb damage first. */
export const FULL_MOON_HP = 30;
export function temporaryHealth(actor) {
  const effect = dose(actor, "potion.full-moon");
  return effect ? Math.max(0, state(effect).temporary ?? FULL_MOON_HP) : 0;
}
/** Temporary HP also absorb periodic/backlash damage without turning those events into weapon hits. */
export function temporaryHealthAbsorptionPlan(actor,total) {
  const moon=dose(actor,"potion.full-moon"),absorbed=moon?Math.min(temporaryHealth(actor),Math.max(0,total)):0;
  return {absorbed,effectUpdates:absorbed?[{_id:moon.id,[`flags.${SYSTEM_ID}.elixirState`]:{...state(moon),temporary:temporaryHealth(actor)-absorbed}}]:[]};
}
export async function absorbTemporaryHealth(actor,total) {
  const {absorbed}=temporaryHealthAbsorptionPlan(actor,total);
  if(absorbed)await setState(dose(actor,"potion.full-moon"),{temporary:temporaryHealth(actor)-absorbed});
  return {absorbed};
}

/** Bonus SP on every location (Griffin: +2 per hit over 5 damage; Arachas: +2 per 10 free carry). */
export function elixirArmor(actor) {
  const layers = [];
  const griffin = dose(actor, "decoction.griffin");
  if (griffin && state(griffin).armor) layers.push({ name: "Отвар из грифона", sp: state(griffin).armor });
  if (dose(actor, "decoction.arachas")) {
    const max = actor.system?.statistics?.carryMax ?? 0, carried = actor.system?.carriedWeight ?? 0;
    const sp = Math.max(0, Math.floor((max - carried) / 10)) * 2;
    if (sp) layers.push({ name: "Отвар из главоглаза", sp });
  }
  return layers;
}

/** Extra damage on a hit: Wyvern grows by 1 with every successful hit. */
export function elixirDamage(actor) {
  const wyvern = dose(actor, "decoction.wyvern");
  return wyvern && state(wyvern).bonus ? [{ label: "Отвар из виверны", value: state(wyvern).bonus }] : [];
}
/** Katakan: +3 to the critical location roll. */
export const criticalLocationBonus = actor => dose(actor, "decoction.katakan") ? 3 : 0;

/** HP regained at the start of the actor's turn, with the reasons. */
export function regenerationAtStart(actor) {
  const parts = [];
  if (actor.effects.some(effect => activeEffect(effect) && effect.statuses.has("dead"))) return {total:0,parts,swallow:null};
  const swallow = dose(actor, "potion.swallow");
  // Swallow: no healing in a round in which the drinker was hit.
  if (swallow) parts.push(state(swallow).hitSince ? { label: "Ласточка: по вам попали — без восстановления", value: 0 } : { label: "Ласточка", value: 3 });
  if (dose(actor, "decoction.troll")) parts.push({ label: "Отвар из тролля", value: 5 });
  // Creatures with Regeneration (werewolf, fiend, katakan: core bestiary) heal at the start of their turn.
  const creature = creatureRegeneration(actor);
  if (creature.available) parts.push({ label: creature.label, value: creature.total });
  const hag = dose(actor, "decoction.grave-hag");
  if (hag && state(hag).kills) parts.push({ label: `Отвар из кладбищенской бабы (${state(hag).kills} убит.)`, value: 2 * state(hag).kills });
  // Magical Healing / Blessing of Healing: 3 HP at the start of each turn while the magic lasts (core p.103).
  for (const effect of actor.effects) if (activeEffect(effect) && effect.flags?.[SYSTEM_ID]?.magicHealing > 0)
    parts.push({ label: effect.name, value: effect.flags[SYSTEM_ID].magicHealing });
  return { total: parts.reduce((sum, part) => sum + part.value, 0), parts, swallow };
}
export async function settleRegeneration(actor) {
  const swallow = dose(actor, "potion.swallow");
  if (swallow && state(swallow).hitSince) await setState(swallow, { hitSince: false });
}

/** Damage taken (before HP): temporary HP absorb it; Griffin hardens, Wyvern resets, Swallow pauses. */
export async function onDamaged(actor, total) {
  const {absorbed}=await absorbTemporaryHealth(actor,total);
  if (total <= 0) return { absorbed };
  const swallow = dose(actor, "potion.swallow");
  if (swallow) await setState(swallow, { hitSince: true });
  const griffin = dose(actor, "decoction.griffin");
  if (griffin && total > 5) await setState(griffin, { armor: (state(griffin).armor ?? 0) + 2 });
  const wyvern = dose(actor, "decoction.wyvern");
  if (wyvern && state(wyvern).bonus) await setState(wyvern, { bonus: 0 });
  return { absorbed };
}

/** A hit that dealt damage: Wyvern +1 to the next strike. */
export async function onHit(attacker) {
  const wyvern = dose(attacker, "decoction.wyvern");
  if (wyvern) await setState(wyvern, { bonus: (state(wyvern).bonus ?? 0) + 1 });
}

/** A kill: Blizzard +4 REF (once), Grave Hag +2 regeneration per kill. */
export async function onKill(attacker) {
  const blizzard = dose(attacker, "potion.blizzard");
  if (blizzard && !state(blizzard).triggered) {
    const condition = blizzard.flags[SYSTEM_ID].condition ?? {};
    await blizzard.update({ [`flags.${SYSTEM_ID}.condition.modifiers`]: [...(condition.modifiers ?? []), { target: "attributes.reflex", value: 4 }],
      [`flags.${SYSTEM_ID}.elixirState`]: { ...state(blizzard), triggered: true } });
  }
  const hag = dose(attacker, "decoction.grave-hag");
  if (hag) await setState(hag, { kills: (state(hag).kills ?? 0) + 1 });
}


// ── Witcher medallion (p.247): it trembles within 20 m of a monster, a curse or a spell being cast. ──
const MEDALLION = "gear.witcher-medallion", RANGE = 20;
const NOT_MONSTERS = new Set(["humanoid", "beast"]);
const sensed = new Map();
const wearsMedallion = actor => Array.from(actor?.items ?? []).some(item => item.system?.ruleId === MEDALLION && item.system.carried !== false && (item.system.quantity ?? 1) > 0);

async function tremble(token, reason) {
  const actor = token.actor, owners = game.users.filter(user => actor.testUserPermission(user, "OWNER")).map(user => user.id);
  await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ token }), whisper: owners,
    content: `<p><i class="fa-solid fa-circle-dot"></i> <b>Медальон дрожит</b> у ${foundry.utils.escapeHTML(token.name)}: ${foundry.utils.escapeHTML(reason)} в пределах 20 м.</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, medallion: { token: token.uuid, reason } } } });
}

/** Active GM: check every medallion on the scene after tokens move. */
export async function checkMedallions(scene) {
  if (!game.users.activeGM?.isSelf || !scene) return;
  const { tokenGap } = await import("../combat/attack-target.mjs");
  for (const token of scene.tokens) {
    if (!wearsMedallion(token.actor)) continue;
    const near = new Set(scene.tokens.filter(other => other !== token && other.actor?.type === "npc" && !NOT_MONSTERS.has(other.actor.system.creature?.category)
      && creatureProfile(other.actor)?.id !== "katakan"
      && (tokenGap(token, other) ?? Infinity) <= RANGE).map(other => other.id));
    const before = sensed.get(token.uuid) ?? new Set();
    sensed.set(token.uuid, near);
    if ([...near].some(id => !before.has(id))) await tremble(token, "чудовище");
  }
}
export async function medallionOnCast(message) {
  if (!game.users.activeGM?.isSelf || !message.flags?.[SYSTEM_ID]?.magicCast) return;
  const caster = message.speakerActor, scene = game.scenes.get(message.speaker.scene) ?? canvas?.scene;
  const from = scene?.tokens.get(message.speaker.token) ?? scene?.tokens.find(token => token.actor === caster);
  if (!from) return;
  const { tokenGap } = await import("../combat/attack-target.mjs");
  for (const token of scene.tokens) if (token !== from && wearsMedallion(token.actor) && (tokenGap(token, from) ?? Infinity) <= RANGE) await tremble(token, "сотворено заклинание");
}

export function registerWitcherElixirs() {
  Hooks.on("updateToken", (token, changes) => { if ("x" in changes || "y" in changes) checkMedallions(token.parent).catch(console.error); });
  Hooks.on("createToken", token => checkMedallions(token.parent).catch(console.error));
  Hooks.on("createChatMessage", message => medallionOnCast(message).catch(console.error));
}
