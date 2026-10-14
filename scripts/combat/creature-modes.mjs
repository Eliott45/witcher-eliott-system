import { SYSTEM_ID } from "../config.mjs";
import { creatureProfile, creatureModeContext, creatureCanFly, creatureCanSwim, creatureInvisible, creatureHasInfiniteStamina, creatureSuppressionFlags } from "../data/creature-modes.mjs";
import { skillValue } from "../data/skills.mjs";
import { conditionSource, CONDITION_BY_ID } from "../data/condition-definitions.mjs";
import { activeDoses } from "../data/consumables.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { creatureRoll, creaturePost, esc } from "./creature-actions-common.mjs";
import { setStatus } from "./status-effects.mjs";
import { armorAt, weaponDamageTraits, resolveDamage } from "./damage-rules.mjs";
import { tokenGap } from "./attack-target.mjs";
import { isCarried } from "../data/containers.mjs";
import { focusRating } from "../magic/rules.mjs";
import { isRotfiend, startRotfiendDecay } from "./rotfiend.mjs";
import { fogVanishBlocked } from "./creature-fog.mjs";

const actorToken = actor => actor?.isToken ? actor.token : actor?.getActiveTokens?.(false, true)?.[0]?.document;
const pending = new WeakMap();
const once = (actor, fn) => {
  if (pending.has(actor)) return pending.get(actor);
  const work = Promise.resolve().then(fn); pending.set(actor, work);
  const clear = () => { if (pending.get(actor) === work) pending.delete(actor); }; work.then(clear, clear); return work;
};
const owner = actor => { if (!actor?.isOwner) throw new Error("Нет права управлять существом."); };

export async function setCreatureMode(actor, key, raw) {
  owner(actor);
  const field = creatureModeContext(actor).fields.find(field => field.key === key);
  if (!field) throw new Error("Этот режим недоступен существу.");
  const value = field.checkbox ? Boolean(raw) : field.number ? Number(raw) : String(raw).trim();
  if (field.select && !field.choices.some(choice => choice.id === value) || field.number && (!Number.isFinite(value) || value < 0 || value > 10000)) throw new Error("Неверное значение режима.");
  if (key === "movementMode" && value === "flying" && !creatureCanFly(actor) || key === "movementMode" && value === "swimming" && !creatureCanSwim(actor)) throw new Error("Этот способ передвижения недоступен.");
  if (key === "movementMode" && value === "flying" && actor.system.creature.fallRemaining > 0) throw new Error("Сначала завершите падение.");
  const suppression = creatureSuppressionFlags(actor);
  if (key === "invisible" && value && creatureProfile(actor)?.id === "foglet") { const reason = fogVanishBlocked(actor); if (reason) throw new Error(reason); }
  if (key === "invisible" && value && suppression.suppressed || key === "transformed" && value && (suppression.moonDust || suppression.manual)) throw new Error("Способность подавлена Ирденом или Лунной пылью.");
  // Monster Hunter's Journal p.49: spikes grow only in the battle form; a chur never takes it.
  if (key === "spikes" && value && !actor.system.creature.battleForm) throw new Error("Шипы — только в боевой форме.");
  if (key === "battleForm" && value && actor.system.creature.chur) throw new Error("Чур не принимает боевую форму.");
  const patch = { [`system.creature.${key}`]: value };
  if (key === "battleForm" && !value) patch["system.creature.spikes"] = false;
  if (key === "chur" && value) Object.assign(patch, { "system.creature.battleForm": false, "system.creature.spikes": false });
  if (key === "invisible" && value) patch["system.creature.invisibilityEpoch"] = globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto.randomUUID();
  if (key === "movementMode" && value !== "flying") patch["system.creature.flightHeight"] = 0;
  await actor.update(patch);
  if (key === "flightHeight") { const token = actorToken(actor); if (token && token.elevation !== value) await token.update({ elevation: value }); }
}

/** A successful declaration reveals the katakan after its attack bonus has already been captured. */
export async function afterCreatureAttack(actor) {
  // Monster Hunter's Journal p.19: an attacking foglet stays visible until its next turn.
  const combat = globalThis.game?.combat, reveal = creatureProfile(actor)?.id === "foglet" && combat?.started
    ? { [`flags.${SYSTEM_ID}.fogReveal`]: { combatId: combat.id, round: combat.round, turn: combat.turn ?? 0 } } : {};
  if (actor?.system?.creature?.invisible || Object.keys(reveal).length) await actor.update({ ...(actor.system.creature.invisible ? { "system.creature.invisible": false } : {}), ...reveal });
}
export const creatureFlightThreshold = actor => ({ siren: 5, griffin: 10, wyvern: 10, bird: 0 })[creatureProfile(actor)?.id] ?? 0;
export const fallingDice = height => Math.floor(Math.max(0, Number(height) || 0) / 2);

async function land(actor, height) {
  const dice = fallingDice(height), roll = dice ? await creatureRoll(`${dice}d6`) : null;
  const armor = armorAt(actor, "torso"), result = resolveDamage({ base: roll?.total ?? 0, location: "torso", multiplier: 1, traits: weaponDamageTraits({ damageType: "Д" }), armor });
  if (result.total) { const { sufferDamage } = await import("./attack-exchange.mjs"); await sufferDamage(actor, result); }
  await setStatus(actor, "prone", true);
  await creaturePost(actor, { title: "Падение", rolls: roll ? [roll] : [], text: `${height} м: ${dice}d6, ПБ корпуса ${armor.sp}, получено ${result.total} урона.` });
  return result.total;
}
export async function continueCreatureFall(actor) {
  owner(actor);
  const remaining = actor.system.creature.fallRemaining ?? 0;
  if (!(remaining > 0)) return false;
  const round = globalThis.game?.combat?.started ? `${game.combat.id}:${game.combat.round}` : "";
  if (round && actor.system.creature.fallRound === round) return false;
  const next = Math.max(0, remaining - 30), token = actorToken(actor), height = actor.system.creature.fallDistance ?? remaining;
  await actor.update({ "system.creature.fallRemaining": next, "system.creature.flightHeight": next, "system.creature.fallRound": round, ...(next === 0 ? { "system.creature.movementMode": "ground", "system.creature.fallDistance": 0 } : {}) });
  if (token) await token.update({ elevation: next });
  if (next === 0) await land(actor, height);
  else await creaturePost(actor, { title: "Падение продолжается", text: `Пройдено 30 м за раунд; до земли ${next} м.` });
  return true;
}
export async function groundCreature(actor, { disoriented = false } = {}) {
  if (actor.system.creature?.movementMode !== "flying") return false;
  const token = actorToken(actor), height = Math.max(0, Number(token?.elevation ?? actor.system.creature.flightHeight) || 0);
  const roll = await creatureRoll(`1d10wc + ${skillValue(actor.system, "athletics").total}`), saved = roll.total >= 16;
  await creaturePost(actor, { title: "Сбит с полёта", rolls: [roll], text: `${disoriented ? "Дезориентация. " : ""}Атлетика СЛ 16: ${saved ? "безопасное приземление" : "падение"}; высота ${height} м.` });
  await actor.update({ "system.creature.movementMode": "ground", "system.creature.flightHeight": 0,
    "system.creature.fallRemaining": saved ? 0 : height, "system.creature.fallDistance": saved ? 0 : height, "system.creature.fallRound": "" });
  if (saved) { if (token) await token.update({ elevation: 0 }); }
  else if (height > 0) await continueCreatureFall(actor);
  else await setStatus(actor, "prone", true);
  return true;
}

/** Invoked once for applied damage, after armor. Other damage pipelines can call the same hook. */
export function onCreatureDamaged(actor, total, { electricity = false, fire = false } = {}) {
  if (isRotfiend(actor)) return startRotfiendDecay(actor, { fire });
  if (actor?.system?.creature?.movementMode !== "flying" && !(electricity && total > 10 && creatureProfile(actor)?.id === "golem")) return Promise.resolve();
  return once(actor, async () => {
    if (actor?.system?.creature?.movementMode === "flying" && total > creatureFlightThreshold(actor)) await groundCreature(actor);
    if (electricity && total > 10 && creatureProfile(actor)?.id === "golem") {
      const roll = await creatureRoll("1d10"), success = roll.total < 7;
      await creaturePost(actor, { title: "Электричество: испытание УСТ 7", rolls: [roll], text: success ? "Голем устоял." : "Голем дезориентирован." });
      if (!success) await setStatus(actor, "stunned", true);
    }
  });
}

export async function rollLycanthropy(actor) {
  owner(actor);
  if (creatureProfile(actor)?.id !== "werewolf") return;
  const roll = await creatureRoll("1d100"), changed = roll.total <= 30;
  const suppression = creatureSuppressionFlags(actor), blocked = suppression.moonDust || suppression.manual;
  await creaturePost(actor, { title: "Восход луны: ликантропия", rolls: [roll], text: changed ? blocked ? "Превращение подавлено Лунной пылью." : "Превращается в волколака до рассвета." : "Сегодня превращения нет." });
  if (changed && !blocked) await actor.update({ "system.creature.transformed": true });
  return changed && !blocked;
}

/** Awareness locates the invisible body; Magic Training is separately opposed by Resist Magic. */
export async function detectCreature(actor, { magic = false, observer = null } = {}) {
  owner(actor);
  observer ??= Array.from(game.user.targets ?? [])[0]?.actor;
  if (!observer?.isOwner) throw new Error("Выберите наблюдателя на сцене.");
  let base;
  if (magic) {
    const training = Array.from(observer.items ?? []).find(item => item.system?.ruleId === "profession.mage.magic-training");
    if (!training) throw new Error("Нужна способность мага «Магические познания».");
    base = (observer.system.statistics.effective.intelligence ?? 0) + (training.system.level ?? 0);
  } else base = skillValue(observer.system, "awareness").total;
  const hym = creatureProfile(actor)?.id === "hym";
  if (hym && !magic) throw new Error("Хима нельзя обнаружить Вниманием: только маг Магическими познаниями.");
  // Monster Hunter's Journal p.29: Magic Training is opposed by the hym's Stealth, not its Resist Magic.
  const defense = skillValue(actor.system, magic && !hym ? "resistMagic" : "stealth").total;
  const [check, resist] = await Promise.all([creatureRoll(`1d10wc + ${base}`), creatureRoll(`1d10wc + ${defense}`)]);
  const success = check.total > resist.total;
  if (success) {
    const records = { ...(observer.flags?.[SYSTEM_ID]?.detectedCreatures ?? {}) }, key = encodeURIComponent(actor.uuid).replaceAll(".", "%2E");
    records[key] = { sourceActor: actor.uuid, sourceToken: actorToken(actor)?.uuid ?? "", epoch: actor.system.creature.invisibilityEpoch ?? "" };
    await observer.setFlag(SYSTEM_ID, "detectedCreatures", records);
    if (hym) await actor.update({ [`flags.${SYSTEM_ID}.hymLocated`]: actor.system.creature.invisibilityEpoch ?? "" });
    globalThis.canvas?.perception?.update?.({ refreshVision: true });
  }
  await creaturePost(actor, { title: magic ? "Обнаружить магией" : "Заметить невидимого", rolls: [check, resist], text: `${esc(observer.name)}: ${success ? `обнаруживает: ${esc(actor.name)}; штраф −3 к атаке и защите против него остаётся` : `не обнаруживает: ${esc(actor.name)}`}.` });
  return success;
}

/** Explicit rules only: mundane alchemy, silver and ordinary injuries are not magical auras. */
export function creatureMagicSources(actor) {
  const items = Array.from(actor?.items ?? []), reasons = [];
  if (actor?.flags?.[SYSTEM_ID]?.magical) reasons.push("магический источник");
  if ((actor?.system?.vigor ?? 0) > 0 || items.some(item => item.type === "spell")) reasons.push("адепт магии");
  if (creatureInvisible(actor)) reasons.push("невидимость");
  for (const item of items) {
    if (!["equipment", "weapon", "armor"].includes(item.type) || !isCarried(item, items)) continue;
    const system = item.system;
    if (item.flags?.[SYSTEM_ID]?.magical || /^(?:rune|glyph)\./u.test(system.ruleId ?? "")
      || ["rune", "glyph"].includes(system.upgrade?.category) || system.installations?.some(entry => ["rune", "glyph"].includes(entry.category))
      || system.ruleId === "gear.witcher-medallion" || focusRating(item) > 0 || /Улучшенное фокусирующее/iu.test(system.properties ?? "")) reasons.push(item.name);
  }
  for (const effect of actor?.effects ?? []) {
    if (!activeEffect(effect)) continue;
    const flags = effect.flags?.[SYSTEM_ID] ?? {};
    if (flags.magical || flags.powerPlace || flags.creatureHypnosis || effect.statuses?.has("creature-slip")
      || effect.origin && globalThis.fromUuidSync?.(effect.origin)?.type === "spell") reasons.push(effect.name);
  }
  return [...new Set(reasons)];
}

export async function senseCreatureMagic(actor) {
  owner(actor);
  if (creatureProfile(actor)?.id !== "cat") return;
  const source = actorToken(actor);
  if (!source) throw new Error("Поставьте кошку на сцену.");
  const found = Array.from(source.parent.tokens ?? []).filter(token => token.actor && token.uuid !== source.uuid && tokenGap(source, token) <= 20 && creatureMagicSources(token.actor).length);
  const text = found.length ? found.map(token => `${esc(token.name ?? token.actor.name)} (${creatureMagicSources(token.actor).map(esc).join(", ")})`).join("; ") : "Рядом нет отмеченных магических источников.";
  await creaturePost(actor, { title: "Магическая настройка · 20 м", text: `${text} Сюжетную магию без предмета или эффекта учитывает ведущий.` });
  return found;
}

/** Katakan's blood transfer: the victim's active substances also affect the drinking vampire. */
export async function afterCreatureBite(attacker, victim, key = "") {
  if (creatureProfile(attacker)?.id === "botchling") {
    const [{ botchlingBite }, { applyCreatureDamage }] = await Promise.all([import("./journal-beasts.mjs"), import("./creature-actions-damage.mjs")]);
    return botchlingBite(attacker, victim, applyCreatureDamage, key);
  }
  if (creatureProfile(attacker)?.id !== "katakan" || !victim) return false;
  const doses = activeDoses(victim), black = doses.some(effect => effect.flags[SYSTEM_ID].consumable.ruleId === "potion.black-blood");
  const substances = Array.from(victim.effects ?? []).filter(effect => activeEffect(effect)
    && (doses.includes(effect) || ["intoxicated", "hallucinating", "fisstech", "pantagran"].some(id => effect.statuses?.has(id))));
  for (const effect of substances) {
    if (effect.flags?.[SYSTEM_ID]?.consumable?.ruleId === "potion.black-blood") continue;
    const source = effect.toObject ? effect.toObject() : structuredClone(effect); delete source._id;
    source.name = `Выпитая кровь: ${effect.name}`;
    source.flags ??= {}; source.flags[SYSTEM_ID] = { ...source.flags[SYSTEM_ID], bloodTransfer: { victim: victim.uuid, source: effect.uuid } };
    if (!Array.from(attacker.effects ?? []).some(existing => activeEffect(existing) && existing.flags?.[SYSTEM_ID]?.bloodTransfer?.source === effect.uuid))
      await attacker.createEmbeddedDocuments("ActiveEffect", [source]);
  }
  if (black) {
    const poison = conditionSource(CONDITION_BY_ID.poisoned); delete poison._id;
    poison.name = "Чёрная кровь: отравление";
    poison.flags[SYSTEM_ID].condition.save = { kind: "skill", skill: "endurance", dc: 20, action: "Одно действие", ends: true };
    const existing = Array.from(attacker.effects ?? []).find(effect => activeEffect(effect) && effect.statuses?.has("poisoned"));
    if (existing) await existing.update({ [`flags.${SYSTEM_ID}.condition.save`]: poison.flags[SYSTEM_ID].condition.save });
    else await attacker.createEmbeddedDocuments("ActiveEffect", [poison]);
    const from = actorToken(victim), target = actorToken(attacker);
    if (from && target && from.parent === target.parent) {
      const dx = target.x - from.x, dy = target.y - from.y, distance = Math.hypot(dx, dy) || 1, pixels = 2 * from.parent.grid.size / from.parent.grid.distance;
      const destination = { x: target.x + (dx || distance) / distance * pixels, y: target.y + dy / distance * pixels };
      if (!target.object?.checkCollision(destination, { type: "move", mode: "any" })) await target.update(destination);
    }
  }
  if (substances.length) await creaturePost(attacker, { title: "Переливание крови", text: black ? "Чёрная кровь: отравление 3 ПЗ за ход, Стойкость СЛ 20; отталкивание на 2 м, если путь свободен." : "Субстанции в выпитой крови перенесены на катакана." });
  return substances.length > 0;
}

export function registerCreatureModes() {
  Hooks.on("updateToken", (token, changes) => {
    // The arachas must stay still to blend in; an archespore among plants stays hidden wherever it burrows.
    if (game.user !== game.users.activeGM || !token.actor?.system.creature?.camouflage || !("x" in changes || "y" in changes) || /archespore$/.test(creatureProfile(token.actor)?.id ?? "")) return;
    return token.actor.update({ "system.creature.camouflage": false });
  });
  const onStun = effect => {
    const actor = effect.parent;
    if (game.user !== game.users.activeGM || !actor?.isOwner || !activeEffect(effect) || !effect.statuses?.has("stunned")) return;
    return once(actor, () => groundCreature(actor, { disoriented: true })).catch(error => ui.notifications.error(error.message));
  };
  Hooks.on("createActiveEffect", onStun); Hooks.on("updateActiveEffect", onStun);
  Hooks.on("updateCombat", (combat, changes) => {
    if (game.user !== game.users.activeGM || !combat.started || !("round" in changes || "turn" in changes)) return;
    const actor = combat.combatant?.actor;
    if (actor?.system.creature?.fallRemaining > 0) return once(actor, () => continueCreatureFall(actor)).catch(error => ui.notifications.error(error.message));
  });
}
