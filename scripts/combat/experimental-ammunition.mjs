import { SYSTEM_ID } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction } from "../workshop/transaction.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { actionQuote, actionUpdate, rollActionCheck } from "./action-economy.mjs";
import { skillValue } from "../data/skills.mjs";
import { postDeviceBlast } from "./bombs.mjs";
import { destroyNoonCopy, noonCopyState } from "./creature-actions-dance.mjs";
import { activeCreatureGM, creaturePost, pickCreaturePoint, esc } from "./creature-actions-common.mjs";

const flags = document => document?.flags?.[SYSTEM_ID] ?? {};
const attackOf = message => flags(message).weaponAttack;
const token = uuid => globalThis.fromUuidSync?.(uuid) ?? globalThis.canvas?.scene?.tokens?.find(entry => entry.uuid === uuid);
const pending = new Map();
function once(key, work) {
  if (pending.has(key)) return pending.get(key);
  const result = Promise.resolve().then(work); pending.set(key, result);
  const clear = () => { if (pending.get(key) === result) pending.delete(key); }; result.then(clear, clear); return result;
}
export const splitProjectileCount = margin => Number.isFinite(margin) ? Math.min(3, Math.max(0, Math.floor(margin))) : 0;
export const experimentalAmmoReplacesDamage = attack => !attack?.experimentalParent && ["ammunition.split", "ammunition.explosive"].includes(attack?.ammunition?.ruleId);

/** A split projectile reuses the actual shot and defense; no second attack roll or defense expenditure. */
export function experimentalAttackRolls(message) {
  const parent = attackOf(message)?.experimentalParent;
  return parent ? game.messages.get(parent.attack)?.rolls?.slice(parent.index, parent.index + 1) ?? [] : null;
}
export function experimentalExchangeOutcome(message) {
  const state = attackOf(message)?.experimentalOutcome;
  if (!state) return null;
  const { defenseId, ...outcome } = state;
  return { ...outcome, defense: game.messages.get(defenseId) ?? { flags: { [SYSTEM_ID]: { exchange: {} } } } };
}
const childrenOf = (message, index) => Array.from(game.messages).filter(child => {
  const parent = attackOf(child)?.experimentalParent;
  return parent?.attack === message.id && parent.index === index;
}).sort((a, b) => attackOf(a).experimentalParent.projectile - attackOf(b).experimentalParent.projectile);
const blastOf = (message, index) => Array.from(game.messages).find(child => {
  const parent = flags(child).bomb?.profile?.experimentalAmmo;
  return parent?.attack === message.id && parent.index === index;
});

/** Active GM creates ordinary damage exchanges for the separate full-strength hits. */
export function resolveExperimentalAmmunition(message, index, outcome, { point = null } = {}) {
  return once(`ammo:${message.id}:${index}`, async () => {
    const attack = attackOf(message);
    if (!activeCreatureGM() || !message.isContentVisible || !experimentalAmmoReplacesDamage(attack)
      || !Number.isInteger(index) || index < 0 || index >= (attack.count ?? 1) || !outcome) return null;
    // Deleting a resolved card is not permission to create its damage a second time.
    if (flags(message).experimentalAmmo?.[index]?.done)
      return attack.ammunition.ruleId === "ammunition.split" ? childrenOf(message, index) : blastOf(message, index) ?? null;
    const target = token(attack.target), attacker = token(attack.attacker), actor = attacker?.actor ?? message.speakerActor;
    if (!actor?.isOwner) throw new Error("Атакующий недоступен ведущему.");
    if (attack.ammunition.ruleId === "ammunition.split") {
      if (outcome.hit && (noonCopyState(target) || flags(message).experimentalAmmo?.[index]?.copyDestroyed)) {
        // Record the intent before deleting the token so a failed follow-up write can be resumed safely.
        await message.update({ [`flags.${SYSTEM_ID}.experimentalAmmo.${index}`]: { kind: "split", count: 0, copyDestroyed: true, done: false } });
        if (noonCopyState(target)) await destroyNoonCopy(target);
        await message.update({ [`flags.${SYSTEM_ID}.experimentalAmmo.${index}`]: { kind: "split", count: 0, copyDestroyed: true, done: true } });
        return [];
      }
      const count = outcome.hit ? splitProjectileCount(outcome.margin) : 0;
      const { defense, ...result } = outcome;
      const children = childrenOf(message, index);
      for (let projectile = 0; projectile < count; projectile++) {
        if (children.some(child => attackOf(child).experimentalParent.projectile === projectile)) continue;
        const childAttack = { ...structuredClone(attack), count: 1, location: "random", multiplier: 1,
          adrenalineDice: index === 0 && projectile === 0 ? attack.adrenalineDice ?? 0 : 0,
          experimentalParent: { attack: message.id, index, projectile }, experimentalOutcome: { ...result, defenseId: defense?.id },
          name: `${attack.name} · разделяющийся снаряд ${projectile + 1}/${count}` };
        delete childAttack.locationRoll;
        const child = await foundry.documents.ChatMessage.implementation.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
          blind: Boolean(message.blind), whisper: [...(message.whisper ?? [])], rolls: [],
          content: `<section class="witcher-attack-chat"><h3>${esc(childAttack.name)}</h3><p>Исходная атака превышает защиту на ${outcome.margin}. Отдельное полное попадание в случайную часть тела; повторной защиты и расхода боеприпасов нет.</p></section>`,
          flags: { [SYSTEM_ID]: { skipLuck: true, weaponAttack: childAttack } } });
        if (!child) throw new Error("Не удалось создать карточку разделяющегося снаряда.");
        children.push(child);
      }
      await message.update({ [`flags.${SYSTEM_ID}.experimentalAmmo.${index}`]: { kind: "split", count, children: children.map(child => child.id), done: true } });
      return children;
    }
    const existing = blastOf(message, index);
    if (existing) return existing;
    if (!outcome.hit && !point) return null;
    const scene = target?.parent ?? attacker?.parent;
    const impact = point ?? (target && tokenCenter(target));
    if (!scene || !impact || !Number.isFinite(impact.x) || !Number.isFinite(impact.y)) throw new Error("Выберите точку попадания на сцене.");
    const blast = await postDeviceBlast(actor, scene, impact, { name: "Взрывной боеприпас", messageOptions: {
      blind: Boolean(message.blind), whisper: [...(message.whisper ?? [])]
    }, profile: {
      radius: 2, damage: "4d6", burning: 0, bleeding: 0, poison: 0, doublePoison: false, blind: 0, stunSave: null, freeze: 0,
      traits: { types: [], piercing: "none", silver: false, silverDice: "", nonLethal: false }, experimentalAmmo: { attack: message.id, index }
    } });
    if (!blast) throw new Error("Не удалось создать взрыв боеприпаса.");
    await message.update({ [`flags.${SYSTEM_ID}.experimentalAmmo.${index}`]: { kind: "explosive", blast: blast.id, done: true } });
    return blast;
  });
}

/** The original card never exposes an extra, fourth damage application or a normal explosive-arrow hit. */
export function experimentalAmmoHTML(message, index, outcome) {
  const attack = attackOf(message);
  if (!experimentalAmmoReplacesDamage(attack) || !outcome) return "";
  const state = flags(message).experimentalAmmo?.[index];
  if (state?.copyDestroyed) return `<p class="witcher-exchange-note">${state.done ? "Копия полуденницы уничтожена попаданием." : "Ведущий завершает уничтожение копии полуденницы."}</p>`;
  if (attack.ammunition.ruleId === "ammunition.split") {
    const count = outcome.hit ? splitProjectileCount(outcome.margin) : 0;
    return `<p class="witcher-exchange-note">Разделяющийся боеприпас: ${count ? `${count} полных попадания в случайные зоны.` : "защита не превышена, попаданий нет."}${count && !state?.done ? " Ведущий создаёт отдельные карточки урона…" : ""}</p>`;
  }
  if (state?.done || blastOf(message, index)) return '<p class="witcher-exchange-note">Создана карточка взрыва: 4d6 по каждой части тела в радиусе 2 м.</p>';
  return `<p class="witcher-exchange-note">${outcome.hit ? "Ведущий создаёт взрыв в точке попадания." : "Взрывной снаряд не попал в цель. Ведущий может указать место столкновения с преградой."}</p>${!outcome.hit ? `<button type="button" data-ammunition-impact="${index}" ${activeCreatureGM() ? "" : "disabled"}>Указать место взрыва</button>` : ""}`;
}

const trackingEffects = actor => Array.from(actor?.effects ?? []).filter(effect => activeEffect(effect) && flags(effect).trackingAmmunition);
export function trackingAmmunitionState(actor, trailHours = 0) {
  const effects = trackingEffects(actor), hours = Number(trailHours);
  if (!Number.isFinite(hours) || hours < 0) throw new Error("Возраст следа должен быть неотрицательным числом часов.");
  return { tracked: effects.length > 0, automatic: effects.length > 0 && hours < 12, trailHours: hours, effectIds: effects.map(effect => effect.id) };
}

/** The receipt survives arrow removal: replaying the old applied-damage event must not lodge it again. */
export async function applyTrackingAmmunition(message) {
  const link = flags(message).exchange;
  if (!activeCreatureGM() || link?.kind !== "applied" || link.nonLethal || link.copyDestroyed) return false;
  const source = game.messages.get(link.attack), attack = attackOf(source);
  if (attack?.ammunition?.ruleId !== "ammunition.tracking" || !Number.isInteger(link.index)
    || link.index < 0 || link.index >= (attack.count ?? 1)) return false;
  const result = link.shield ?? link;
  if (result.immune || !result.penetrated || !(result.total > 0) || link.shield && !link.shield.applied) return false;
  const target = token(link.shield?.token ?? attack.target)?.actor;
  if (!target?.isOwner) return false;
  const key = `${source.id}:${link.index}`;
  return inventoryWrite(target, async () => {
    if (flags(target).trackingAmmoReceipts?.includes(key)) return false;
    const effect = { name: "Выслеживающий боеприпас в теле", type: "base", img: "icons/svg/target.svg", statuses: ["tracking-ammunition"],
      description: "<p>Пока боеприпас остаётся в теле, след моложе 12 часов можно выслеживать по запаху без проверки. Возраст следа отсчитывается от его появления, а не от момента ранения. Извлечение боеприпаса прекращает этот эффект.</p>",
      flags: { [SYSTEM_ID]: { trackingAmmunition: { key, source: attack.attacker, appliedAt: game.time?.worldTime ?? 0 } } } };
    await inventoryTransaction(target, { effectCreates: [effect], actorUpdate: {
      [`flags.${SYSTEM_ID}.trackingAmmoReceipts`]: [...(flags(target).trackingAmmoReceipts ?? []), key]
    } });
    return true;
  });
}
export function removeTrackingProjectile(actor, effectId = null) {
  if (!actor?.isOwner) throw new Error("Нет права изменять состояние цели.");
  return inventoryWrite(actor, async () => {
    const effects = trackingEffects(actor).filter(effect => !effectId || effect.id === effectId);
    if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    return effects.length;
  });
}
export async function trackByAmmunition(target, { observer = null, trailHours = 0 } = {}) {
  observer ??= Array.from(game.user.targets ?? [])[0]?.actor;
  if (!observer?.isOwner) throw new Error("Выберите персонажа, который выслеживает по запаху (T).");
  const state = trackingAmmunitionState(target, trailHours);
  if (!state.tracked) throw new Error("В цели больше нет выслеживающего боеприпаса.");
  if (state.automatic) return inventoryWrite(observer, async () => {
    const quote = actionQuote(observer);
    const message = await creaturePost(observer, { title: "Выслеживание по запаху", text: `${esc(target.name)}: следу ${state.trailHours} ч., меньше 12. Выслеживающий боеприпас остаётся в теле: проверка не требуется.` });
    if (message) await observer.update(actionUpdate(observer, quote));
    return message;
  });
  const skill = skillValue(observer.system, "wildernessSurvival");
  return rollActionCheck(observer, { formula: `1d10wc + ${skill.total}`, flavor: `<p>Выслеживание по запаху: ${esc(target.name)}. Следу ${state.trailHours} ч.: автоматический успех не действует.</p>`,
    flags: { [SYSTEM_ID]: { skillCheck: { key: "wildernessSurvival", base: skill.total, level: skill.level, attribute: skill.attributeValue, bonus: skill.bonus } } } });
}

export function registerExperimentalAmmunition() {
  for (const event of ["createChatMessage", "updateChatMessage"]) Hooks.on(event, message => applyTrackingAmmunition(message).catch(error => ui.notifications.error(error.message)));
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll("[data-ammunition-impact]")) button.addEventListener("click", async () => {
      if (!activeCreatureGM()) return;
      try {
        const attack = attackOf(message), source = token(attack.attacker) ?? token(attack.target);
        if (!source) throw new Error("Токен выстрела больше недоступен.");
        const point = await pickCreaturePoint(source, { title: "Место взрыва промахнувшегося снаряда", throughWalls: true });
        if (point) await resolveExperimentalAmmunition(message, Number(button.dataset.ammunitionImpact), { hit: false }, { point });
      } catch (error) { ui.notifications.error(error.message); }
    });
  });
}
