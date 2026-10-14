import { SYSTEM_ID } from "../config.mjs";
import { creatureProfile } from "../data/creature-modes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { skillValue } from "../data/skills.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { actionQuote, actionUpdate } from "./action-economy.mjs";
import { armorAt, resolveDamage, monsterMaterial, fireVulnerable } from "./damage-rules.mjs";
import { applyWeaponWear } from "./weapon-wear.mjs";
import { activeCreatureGM, requireCreatureGM, creatureFlags, creatureTargets, creatureRoll, creaturePost, creatureEffect, addCreatureEffect,
  pickCreaturePoint, centerDistance, esc } from "./creature-actions-common.mjs";

// Monster Hunter's Journal pp.36–49: the bear's overhead strike, the archespore's pods and the botchling's forms.
export const ARCHESPORES = ["archespore", "green-archespore", "purple-archespore"];
export const POD = { radius: 2, dc: 14, damage: "1d6", burrow: 18 };
const profileId = actor => creatureProfile(actor)?.id;
export const isBotchling = actor => profileId(actor) === "botchling";
const dead = actor => Array.from(actor?.effects ?? []).some(effect => activeEffect(effect) && effect.statuses?.has("dead"));
const resolve = uuid => globalThis.fromUuidSync?.(uuid) ?? globalThis.canvas?.scene?.tokens?.find(token => token.uuid === uuid) ?? null;
const tokenOf = actor => actor?.isToken ? actor.token : actor?.getActiveTokens?.(false, true)?.[0]?.document
  ?? Array.from(globalThis.canvas?.scene?.tokens ?? []).find(token => token.actor === actor) ?? null;

/** Prone and pinned under the bear (p.37); the GM ends the pin when the victim breaks free. */
export function bearPinEffects(target) {
  const pinned = creatureEffect(target, "pinned", { name: "Прижат медведем" });
  pinned.description = "<p>Медведь прижал цель к земле: она обездвижена и не может действовать, пока не вырвется. Атаки по ней получают +4.</p>";
  return [creatureEffect(target, "prone"), pinned];
}

/** A successful overhead strike: 6d6 into the torso, then prone and pinned. */
export async function bearMaulHit(target) {
  const roll = await creatureRoll("6d6");
  const damage = resolveDamage({ base: roll.total, location: "torso", multiplier: 1, traits: { types: ["slashing"], piercing: "none", silver: false },
    armor: armorAt(target, "torso"), monsterMaterial: monsterMaterial(target), vulnerableToFire: fireVulnerable(target) });
  return { roll, damage };
}

/** A blocked overhead strike: opposed Physique, the defender must beat the bear or still fall pinned. */
export async function bearMaulBlocked(message, index, applyEffects) {
  const attack = creatureFlags(message).weaponAttack, bear = resolve(attack.attacker)?.actor, target = resolve(attack.target)?.actor;
  if (!bear || !target) return false;
  const [own, theirs] = await Promise.all([creatureRoll(`1d10wc + ${skillValue(target.system, "physique").total ?? 0}`), creatureRoll(`1d10wc + ${skillValue(bear.system, "physique").total ?? 0}`)]);
  const freed = own.total > theirs.total;
  if (!freed) await applyEffects(target, bearPinEffects(target), `maulBlock:${message.id}:${index}`);
  await creaturePost(target, { title: "Удар сверху заблокирован: Сила против Силы", rolls: [own, theirs],
    text: `${own.total} против ${theirs.total}: ${freed ? `${esc(target.name)} отталкивает медведя` : `${esc(target.name)} без урона, но сбит с ног и прижат`}.` });
  return true;
}

// ── Archespore ────────────────────────────────────────────────────────────────

export const podState = region => region?.flags?.[SYSTEM_ID]?.archesporePod ?? null;

/** Full turn: burrow up to 18 m away and leave a pod where it stood; the pod bursts at the end of the round. */
export async function plantPod(actor, options = {}) {
  requireCreatureGM(actor);
  const { source } = creatureTargets(actor, { ...options, targets: [] }), scene = source.parent, origin = tokenCenter(source);
  const point = options.destination ?? await pickCreaturePoint(source, { max: POD.burrow, throughWalls: true, title: "Куда зарыться (до 18 м)" });
  if (!point) return null;
  if (centerDistance(origin, point, scene) > POD.burrow + 0.001) throw new Error(`Зарыться можно не дальше чем на ${POD.burrow} м.`);
  const pixels = POD.radius / scene.grid.distance * scene.grid.size, combat = game.combat;
  const [pod] = await scene.createEmbeddedDocuments("Region", [{ name: "Стручок археспоры", color: "#7d9a3a", visibility: 2,
    shapes: [{ type: "ellipse", x: origin.x, y: origin.y, radiusX: pixels, radiusY: pixels, rotation: 0, gridBased: false, hole: false }],
    flags: { [SYSTEM_ID]: { archesporePod: { source: actor.uuid, ...(combat?.started ? { combatId: combat.id, round: combat.round } : {}) } } } }]);
  const size = source.getSize();
  await source.update({ x: Math.round(point.x - size.width / 2), y: Math.round(point.y - size.height / 2) });
  const message = await creaturePost(actor, { title: "Взрыв стручка", text: `Археспора зарывается и оставляет стручок. ${combat?.started ? "В конце раунда" : "Сейчас"} он взорвётся: все в пределах 2 м проходят Атлетику СЛ 14.` });
  if (!combat?.started) await burstPod(pod);
  return message;
}

/** Everyone whose token reaches within 2 m of the pod gets an Athletics DC 14 card. */
export async function burstPod(region) {
  const state = podState(region);
  if (!activeCreatureGM() || !state || state.burst) return null;
  await region.update({ [`flags.${SYSTEM_ID}.archesporePod.burst`]: true });
  const scene = region.parent, shape = region.shapes[0], point = { x: shape.x, y: shape.y };
  const victims = Array.from(scene.tokens ?? []).filter(token => token.actor && !dead(token.actor)
    && centerDistance(point, tokenCenter(token), scene) - Math.max(token.width ?? 1, token.height ?? 1) * scene.grid.distance / 2 <= POD.radius + 0.001);
  const source = resolve(state.source), speaker = source?.actor ?? source ?? victims[0]?.actor;
  await region.delete();
  if (!speaker) return null;
  return creaturePost(speaker, { title: "Стручок взрывается", text: victims.length ? "Шипы и яд: Атлетика СЛ 14, иначе 1d6 урона по каждой части тела и отравление." : "Рядом никого нет.",
    flags: victims.length ? { creatureArea: { id: "pod", dc: POD.dc, targets: victims.map(token => ({ uuid: token.uuid, name: token.name, done: false })) } } : {} });
}

/** End of a round: pods planted before it burst. */
export async function burstDuePods(combat) {
  if (!activeCreatureGM() || !combat?.started) return;
  for (const region of Array.from(combat.scene?.regions ?? globalThis.canvas?.scene?.regions ?? [])) {
    const state = podState(region);
    if (state && !state.burst && state.combatId === combat.id && state.round < combat.round) await burstPod(region);
  }
}

// ── Botchling ─────────────────────────────────────────────────────────────────

/** Life drain at night (p.49): the sleeper does not recover STA and loses 5 maximum STA, never below 5. */
export function lifeDrainEffect(victim) {
  const current = victim.system.statistics?.staminaMax ?? victim.system.stamina?.max ?? 0, reduced = Math.max(5, current - 5);
  return { name: "Вытягивание жизненной силы", img: "icons/svg/degen.svg", type: "base", system: {}, statuses: [],
    description: `<p>Игоша тянул силы спящего: за ночь он не восстановил ВЫН, максимум ВЫН снижен с ${current} до ${Math.min(current, reduced)}. Снимите эффект после ночи, проведённой вдали от игоши.</p>`,
    flags: { [SYSTEM_ID]: { condition: { modifiers: [{ target: "staminaMax", value: Math.min(0, reduced - current) }] }, botchlingDrain: true } } };
}

/** The caller pays the action; transforming takes the full turn. */
export async function useBotchlingAction(actor, id, options = {}) {
  const state = actor.system.creature ?? {};
  if (id === "botchling-form") {
    if (state.chur) throw new Error("Чур не принимает боевую форму.");
    if (state.battleForm) throw new Error("Игоша уже в боевой форме.");
    await actor.update({ "system.creature.battleForm": true });
    return creaturePost(actor, { title: "Боевая форма", text: "Игоша превращается: +2 к РЕА, ЛВК и СКОР, +3 к ТЕЛ; доступен удар когтями." });
  }
  if (id === "botchling-spikes") {
    if (!state.battleForm) throw new Error("Шипы игоша выращивает только в боевой форме.");
    if (state.spikes) throw new Error("Шипы уже выпущены.");
    await actor.update({ "system.creature.spikes": true });
    return creaturePost(actor, { title: "Шипы", text: "Захвативший игошу получает 2d6 урона в туловище; оружие, попавшее по нему, получает 1 разрушающий урон. Дезориентированный игоша втягивает шипы." });
  }
  if (id === "botchling-drain") {
    if (state.chur) throw new Error("Чур не вытягивает жизненную силу.");
    const { source, targets } = creatureTargets(actor, options);
    if (targets.length !== 1) throw new Error("Выберите спящую цель клавишей T.");
    const gap = centerDistance(tokenCenter(source), tokenCenter(targets[0]), source.parent) - (Math.max(source.width ?? 1, source.height ?? 1) + Math.max(targets[0].width ?? 1, targets[0].height ?? 1)) * source.parent.grid.distance / 2;
    if (gap > 2 + 0.001) throw new Error("Спящая цель должна быть в пределах 2 м.");
    await targets[0].actor.createEmbeddedDocuments("ActiveEffect", [lifeDrainEffect(targets[0].actor)]);
    return creaturePost(actor, { title: "Вытягивание жизненной силы", text: `${esc(targets[0].name)}: за ночь не восстанавливает ВЫН, максимум ВЫН −5 (не ниже 5).` });
  }
  throw new Error("Неизвестное действие игоши.");
}

/** Axii or «Управление чувствами» (Spell Casting DC 18, or 25 once it was attacked after calming) returns the normal form. */
export function calmBotchling(botchling, options = {}) {
  requireCreatureGM(botchling);
  if (!botchling.system.creature?.battleForm) throw new Error("Игоша не в боевой форме.");
  const { targets } = creatureTargets(botchling, options);
  if (targets.length !== 1) throw new Error("Выберите токен того, кто творит Аксий или «Управление чувствами».");
  const caster = targets[0].actor, dc = creatureFlags(botchling).botchlingHardened ? 25 : 18;
  return inventoryWrite(caster, async () => {
    const quote = actionQuote(caster), roll = await creatureRoll(`1d10wc + ${(skillValue(caster.system, "spellCasting").total ?? 0) + quote.penalty}`), success = roll.total >= dc;
    const message = await creaturePost(caster, { title: "Успокоить игошу", rolls: [roll], text: `Сотворение заклинаний ${roll.total} против СЛ ${dc}: ${success ? "игоша возвращается в обычную форму" : "не вышло"}.` });
    if (!message) return null;
    const update = actionUpdate(caster, quote);
    if (Object.keys(update).length) await caster.update(update);
    if (success) await botchling.update({ "system.creature.battleForm": false, "system.creature.spikes": false, [`flags.${SYSTEM_ID}.botchlingCalmed`]: true });
    return message;
  });
}

/** Attacked after being calmed: it transforms again, and calming it now takes DC 25. */
export async function provokeBotchling(message) {
  const attack = message?.flags?.[SYSTEM_ID]?.weaponAttack, target = attack?.target ? resolve(attack.target)?.actor : null;
  if (!activeCreatureGM() || !isBotchling(target) || !creatureFlags(target).botchlingCalmed || target.system.creature.chur) return false;
  await target.update({ "system.creature.battleForm": true, [`flags.${SYSTEM_ID}.botchlingCalmed`]: false, [`flags.${SYSTEM_ID}.botchlingHardened`]: true });
  await creaturePost(target, { title: "Боевая форма", text: "Атакованный игоша снова превращается; успокоить его теперь можно только со СЛ 25." });
  return true;
}

/** A weapon that hits a spiked botchling takes 1 ablation. */
export async function onBotchlingStruck(attackMessage) {
  const attack = creatureFlags(attackMessage).weaponAttack, target = attack?.target ? resolve(attack.target)?.actor : null;
  if (!activeCreatureGM() || !isBotchling(target) || !target.system.creature?.spikes) return false;
  const attacker = resolve(attack.attacker)?.actor ?? attackMessage.speakerActor, item = attacker?.items?.get?.(attack.itemId);
  if (!item || item.system.natural || !item.system.reliability?.max) return false;
  const wear = await applyWeaponWear(item, 1);
  await creaturePost(attacker, { title: "Шипы игоши", text: `${esc(item.name)}: надёжность ${wear.from} → ${wear.to}.` });
  return true;
}

/** Grappling a spiked botchling costs the grappler 2d6 into the torso. */
export async function onBotchlingGrappled(attackMessage, applyDamage) {
  const attack = creatureFlags(attackMessage).weaponAttack;
  if (!activeCreatureGM() || attack?.special !== "grapple") return false;
  const held = resolve(attack.target)?.actor, grappler = resolve(attack.attacker)?.actor;
  if (!isBotchling(held) || !held.system.creature?.spikes || !grappler) return false;
  const roll = await creatureRoll("2d6"), damage = resolveDamage({ base: roll.total, location: "torso", multiplier: 1, traits: { types: ["piercing"], piercing: "none", silver: false },
    armor: armorAt(grappler, "torso"), monsterMaterial: monsterMaterial(grappler), vulnerableToFire: fireVulnerable(grappler) });
  await applyDamage(grappler, damage, `spikes:${attackMessage.id}`);
  await creaturePost(grappler, { title: "Шипы игоши", rolls: [roll], text: `${esc(grappler.name)} хватает шипастого игошу: ${damage.total} урона в туловище после брони.` });
  return true;
}

/** Blood sucking (p.49): a damaging bite deals 4 more and heals 4; Black Blood in the victim poisons the botchling. */
export async function botchlingBite(attacker, victim, applyDamage, key) {
  if (!isBotchling(attacker) || attacker.system.creature?.chur || !victim) return false;
  await applyDamage(victim, { total: 4, ablate: [], steps: [] }, `bite:${key}`);
  await attacker.update({ "system.health.value": Math.min(attacker.system.health.max, attacker.system.health.value + 4) });
  const black = Array.from(victim.effects ?? []).some(effect => activeEffect(effect) && effect.flags?.[SYSTEM_ID]?.consumable?.ruleId === "potion.black-blood");
  if (black && !immuneToCondition(attacker, ["poisoned"])) await addCreatureEffect(attacker, creatureEffect(attacker, "poisoned", { name: "Чёрная кровь: отравление" }), `blackBlood:${key}`);
  await creaturePost(attacker, { title: "Высасывание крови", text: `${esc(victim.name)} теряет ещё 4 ПЗ, игоша восстанавливает 4 ПЗ.${black ? " Кровь с «Чёрной кровью»: игоша отравлен." : ""}` });
  return true;
}

export const botchlingClawsBlocked = (actor, item) => isBotchling(actor) && item?.name === "Удар когтями" && !actor.system.creature?.battleForm
  ? "Когти игоши доступны только в боевой форме" : "";

export function registerJournalBeasts() {
  const fail = error => ui.notifications.error(error.message);
  Hooks.on("createChatMessage", message => { provokeBotchling(message).catch(fail); });
  Hooks.on("createActiveEffect", effect => {
    const actor = effect.parent;
    if (activeCreatureGM() && isBotchling(actor) && actor.system.creature?.spikes && activeEffect(effect) && effect.statuses?.has("stunned"))
      actor.update({ "system.creature.spikes": false }).catch(fail);
  });
  Hooks.on("updateCombat", (combat, changes) => { if ("round" in changes) burstDuePods(combat).catch(fail); });
}
