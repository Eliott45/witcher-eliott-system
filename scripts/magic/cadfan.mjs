import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { fullTurnStart } from "../combat/full-turn-rules.mjs";

// Core p.103 «Хватка Кадфана»: no defense, 1d6 rounds. A heated metal item is dropped by its holder, or the holder
// takes 2d6 damage to the limb holding it. A heated weapon deals +2d6 damage with a 50% chance of burning.
// The book does not say whether armor helps against the heat or how a limb multiplies it: the damage goes to the
// holding arm with the usual ×½ for a limb, and armor does not stop heat from the metal in the hand.
export const CADFAN = "spell.cadfan-grasp";
export const isCadfan = system => system?.ruleId === CADFAN;

/** Weapons and shields a creature is holding: the metal things the spell can heat. */
export const heatableItems = actor => Array.from(actor?.items ?? []).filter(item => item.type === "weapon" && item.system.equipped && !item.system.natural);

/** The heated-weapon effect on the wielder: +2d6 and burning 50% for the spell's duration. */
export function heatedWeaponSource(actor, item, spell, rounds) {
  return { name: `Раскалено: ${item.name}`, img: "icons/svg/fire.svg", type: "base", ...(spell?.uuid ? { origin: spell.uuid } : {}),
    description: `<p>Хватка Кадфана раскалила «${esc(item.name)}»: удары им наносят +2d6 урона и с вероятностью 50% поджигают цель. Длительность: ${rounds} раунд.</p>${spell?.uuid ? `<p>Источник: @UUID[${spell.uuid}]{${esc(spell.name)}}</p>` : ""}`,
    start: fullTurnStart(actor), duration: { value: rounds, units: "rounds", expiry: "turnEnd", expired: false },
    flags: { [SYSTEM_ID]: { heatedWeapon: { itemId: item.id } } } };
}

/** Cast-card step: choose the target, its item and whether it is an enemy's grip or an ally's weapon. */
export async function heatItem(caster, spell, message) {
  const tokens = Array.from(game.user.targets ?? []).map(token => token.document ?? token).filter(token => token.actor);
  const pool = tokens.length ? tokens : Array.from(globalThis.canvas?.tokens?.controlled ?? []).map(token => token.document).filter(token => token.actor);
  if (!pool.length) throw new Error("Выберите клавишей T того, чей металлический предмет раскалить.");
  const rows = pool.flatMap(token => heatableItems(token.actor).map(item => ({ token, item })));
  if (!rows.length) throw new Error("У выбранных нет оружия или щита в руках.");
  const content = `<p>Защиты нет. Длительность — 1d6 раундов.</p><label>Предмет<select name="pick">${rows.map(({ token, item }, index) =>
      `<option value="${index}">${esc(token.name)} — ${esc(item.name)}</option>`).join("")}</select></label>`
    + `<fieldset><label><input type="radio" name="mode" value="enemy" checked> Раскалить в руках врага: бросит или получит 2d6 в руку</label>`
    + `<label><input type="radio" name="mode" value="ally"> Раскалить оружие союзника: +2d6 урона, горение 50%</label></fieldset>`;
  const answer = await foundry.applications.api.DialogV2.prompt({ window: { title: spell.name }, content, rejectClose: false,
    ok: { label: "Раскалить", callback: (_event, button) => ({ pick: Number(button.form.elements.pick.value), mode: button.form.elements.mode.value }) } });
  if (!answer) return null;
  const { token, item } = rows[answer.pick], rounds = (await evaluateRoll("1d6")).total;
  if (answer.mode === "ally") {
    if (!token.actor.isOwner) throw new Error(`Нет прав на ${token.name}: пусть эффект наложит ведущий.`);
    await token.actor.createEmbeddedDocuments("ActiveEffect", [heatedWeaponSource(token.actor, item, spell, rounds)]);
    return foundry.documents.ChatMessage.implementation.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
      content: `<section class="witcher-magic-chat"><h3>${esc(spell.name)}</h3><p>«${esc(item.name)}» у ${esc(token.name)} раскалён на ${rounds} раунд.: +2d6 урона, горение 50%.</p></section>` });
  }
  return foundry.documents.ChatMessage.implementation.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: caster }),
    content: `<section class="witcher-magic-chat"><h3>${esc(spell.name)}</h3><p>«${esc(item.name)}» в руках ${esc(token.name)} раскаляется. Бросить его или терпеть 2d6 урона в руку?</p></section>`,
    flags: { [SYSTEM_ID]: { cadfanHeat: { actor: token.actor.uuid, itemId: item.id, itemName: item.name, choice: "" } } } });
}

/** The holder's choice: drop the item, or keep it and take 2d6 to the holding arm (×½ for a limb, no armor). */
const resolving = new Set();
/** Record the choice on the card when allowed (author or GM); the result message is posted either way. */
const settle = (message, choice, result) => message.update({ [`flags.${SYSTEM_ID}.cadfanHeat.choice`]: choice, [`flags.${SYSTEM_ID}.cadfanHeat.result`]: result }).catch(() => null);
export async function resolveHeat(message, choice) {
  const heat = message.flags?.[SYSTEM_ID]?.cadfanHeat, actor = heat && fromUuidSync(heat.actor), item = actor?.items.get(heat.itemId);
  if (!heat || heat.choice || !actor?.isOwner || resolving.has(message.id)) return;
  resolving.add(message.id);
  try { return await resolveHeatNow(message, choice, heat, actor, item); } finally { resolving.delete(message.id); }
}
async function resolveHeatNow(message, choice, heat, actor, item) {
  if (choice === "drop") {
    if (!item) throw new Error("Предмета уже нет в инвентаре.");
    const { dropItemToGround } = await import("../loot/loot.mjs");
    try { await dropItemToGround(actor, item, { quantity: 1, silent: true }); }
    catch { await item.update({ "system.equipped": false }); }
    const result = `${actor.name} бросает «${heat.itemName}».`;
    await foundry.documents.ChatMessage.implementation.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content: `<p><i class="fa-solid fa-fire"></i> ${esc(result)}</p>` });
    return settle(message, "drop", result);
  }
  const roll = await evaluateRoll("2d6"), total = Math.floor(roll.total / 2);
  const { sufferDamage } = await import("../combat/attack-exchange.mjs");
  await sufferDamage(actor, { total, ablate: [], steps: [] });
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<section class="witcher-magic-chat"><h3>Раскалённый металл</h3><p>${esc(actor.name)} держит «${esc(heat.itemName)}»: 2d6 = ${roll.total}, в руку ×½ = <b>${total}</b> урона. Броня от жара в руке не защищает.</p></section>` });
  return settle(message, "hold", `${actor.name} держит «${heat.itemName}» и получает ${total} урона в руку.`);
}

/** Attack step: a weapon heated by Cadfan's Grasp adds 2d6 and a 50% burning chance. */
export const heatedWeapon = (actor, itemId) => Array.from(actor?.effects ?? []).some(effect => !effect.disabled && !effect.duration?.expired
  && effect.flags?.[SYSTEM_ID]?.heatedWeapon?.itemId === itemId);

export function registerCadfan() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const root = html.querySelector(".message-content") ?? html;
    const cast = message.flags?.[SYSTEM_ID]?.magicCast, caster = message.speakerActor, spell = caster?.items.get(cast?.spellId);
    if (spell && isCadfan(spell.system) && !cast.maintenance && !cast.fumble?.failed && caster.isOwner && message.isContentVisible !== false) {
      const box = document.createElement("div");
      box.className = "witcher-spell-target";
      box.innerHTML = `<button type="button"><i class="fa-solid fa-fire"></i> Раскалить предмет (цель — T)</button><small>Враг роняет предмет или получает 2d6 в руку; оружие союзника получает +2d6 и горение 50%.</small>`;
      box.querySelector("button").addEventListener("click", async event => {
        event.currentTarget.disabled = true;
        try { await heatItem(caster, spell, message); } catch (error) { ui.notifications.warn(error.message); }
        finally { event.currentTarget.disabled = false; }
      });
      root.append(box);
    }
    const heat = message.flags?.[SYSTEM_ID]?.cadfanHeat;
    if (!heat) return;
    const box = document.createElement("div");
    box.className = "witcher-spell-target";
    const holder = fromUuidSync(heat.actor);
    if (heat.choice) box.innerHTML = `<p><i class="fa-solid fa-fire"></i> ${esc(heat.result ?? "")}</p>`;
    else if (holder?.isOwner) {
      box.innerHTML = `<button type="button" data-choice="drop"><i class="fa-solid fa-hand"></i> Бросить «${esc(heat.itemName)}»</button><button type="button" data-choice="hold"><i class="fa-solid fa-hand-fist"></i> Держать: 2d6 в руку</button>`;
      for (const button of box.querySelectorAll("[data-choice]")) button.addEventListener("click", async () => {
        for (const other of box.querySelectorAll("button")) other.disabled = true;
        try { await resolveHeat(message, button.dataset.choice); } catch (error) { ui.notifications.warn(error.message); for (const other of box.querySelectorAll("button")) other.disabled = false; }
      });
    } else box.innerHTML = `<small>Решает владелец «${esc(heat.itemName)}» или ведущий.</small>`;
    root.append(box);
  });
}
