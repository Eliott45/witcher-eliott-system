import { SYSTEM_ID } from "../config.mjs";
import { equippedItems } from "../data/physical-items.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { rollStun } from "./stun-roll.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { defenseQuote, rollDefense } from "./defense-rolls.mjs";
import { hitLocation, ATTACK_LOCATIONS } from "./weapon-rules.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { weaponDamageTraits, armorAt, monsterResistant, fireVulnerable, criticalLevel, resolveDamage, CRITICAL_LEVELS } from "./damage-rules.mjs";
import { criticalWoundByRoll, aimedCriticalRoll, ORGAN_WOUNDS, ANATOMY_FREE_BONUS } from "../data/critical-wounds.mjs";

// One weapon attack card hosts the whole exchange: each attack roll gets its own defense, damage and
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
const rolling = message => Boolean(message?._dice3danimating) && !message._witcherSettled && Date.now() - (message.timestamp ?? 0) < 12000;
const linked = (attackId, index, kind) => { const message = linkedAny(attackId, index, kind); return rolling(message) ? null : message; };
const targetToken = attack => attack?.target ? globalThis.canvas?.scene?.tokens.find(token => token.uuid === attack.target) ?? fromUuidSync(attack.target) : null;
const targetActor = attack => targetToken(attack)?.actor ?? null;
const bodyPlan = actor => actor?.type === "npc" && actor.system.creature?.category !== "humanoid" ? "monster" : "humanoid";
const anatomyFree = actor => ["specter", "elemental"].includes(actor?.system.creature?.category);
const DC_UNAWARE = 10;

async function post(data, mode = game.settings.get("core", "messageMode")) {
  const Message = foundry.documents.ChatMessage.implementation;
  return Message.create(Message.applyMode(data, mode));
}

/** Core p.153 «Объединение сил»: −1 to melee defense for each adjacent hostile beyond the first. */
export function gangingUp(target) {
  const scene = target?.parent;
  if (!scene || !globalThis.canvas?.grid) return 0;
  const from = tokenCenter(target), reach = Math.max(2, (target.width ?? 1) * canvas.grid.distance);
  const hostile = Array.from(scene.tokens).filter(token => token.id !== target.id && !token.hidden && token.actor
    && token.disposition !== target.disposition && token.disposition !== CONST.TOKEN_DISPOSITIONS.NEUTRAL
    && canvas.grid.measurePath([from, tokenCenter(token)]).distance <= reach + 0.01);
  return Math.max(0, hostile.length - 1);
}

/** Defenses the target can choose for one incoming attack, best armed option per mode. */
export function defenseChoices(actor, incoming) {
  const options = [{ mode: "dodge" }, { mode: "reposition" }];
  for (const mode of ["block", "parry"]) {
    const quotes = equippedItems(actor.items).filter(item => item.type === "weapon" && ["melee", "shield"].includes(item.system.category))
      .map(item => defenseQuote(actor, { mode, itemId: item.id, incoming })).filter(quote => !quote.blocked);
    options.push(quotes.sort((a, b) => b.total - a.total)[0] ?? { mode, blocked: true, name: mode === "block" ? "Блок" : "Парирование" });
  }
  return options.map(option => option.total !== undefined ? option : { ...defenseQuote(actor, { ...option, incoming }), mode: option.mode });
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
  const gang = incomingOf(attack) === "melee" ? gangingUp(targetToken(attack)) : 0;
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
  return { defense, none, attackTotal, defenseTotal, hit, margin, critical: hit ? criticalLevel(margin) : null,
    mode: flagsOf(defense).defense?.mode ?? "", name: none ? "Без защиты" : flagsOf(defense).defense?.name ?? "Защита" };
}

export async function rollExchangeDamage(message, index) {
  const attack = flagsOf(message).weaponAttack, outcome = exchangeOutcome(message, index), actor = message.speakerActor;
  if (!actor?.isOwner || !outcome?.hit || linkedAny(message.id, index, "damage")) return;
  const target = targetActor(attack), item = actor.items.get(attack.itemId), weapon = item ? effectiveItem(item) : {};
  const traits = weaponDamageTraits(weapon), monster = target ? monsterResistant(target) : false;
  const rolls = [await new foundry.dice.Roll(attack.damage).evaluate()];
  const silver = traits.silverDice && monster ? await new foundry.dice.Roll(traits.silverDice).evaluate() : null;
  if (silver) rolls.push(silver);
  let location = ATTACK_LOCATIONS.find(entry => entry.id === attack.location), locationRoll = null;
  if (attack.location === "random") {
    locationRoll = await new foundry.dice.Roll("1d10").evaluate(); rolls.push(locationRoll);
    location = hitLocation(locationRoll.total, bodyPlan(target));
  }
  let critical = null;
  if (outcome.critical) {
    const aimed = attack.location !== "random";
    const critRoll = await new foundry.dice.Roll(aimed && ["head", "torso"].includes(location.id) ? "1d6" : aimed ? "0" : "2d6").evaluate();
    if (critRoll.dice.length) rolls.push(critRoll);
    const tableRoll = aimed ? aimedCriticalRoll(location.id, critRoll.total) : critRoll.total;
    let wound = criticalWoundByRoll(outcome.critical.id, tableRoll), bonus = outcome.critical.bonus;
    if (wound && anatomyFree(target) && ORGAN_WOUNDS.has(wound.id)) { bonus += ANATOMY_FREE_BONUS[outcome.critical.id]; wound = null; }
    critical = { level: outcome.critical.id, name: outcome.critical.name, bonus, roll: tableRoll, aimed, wound };
  }
  const display = trackRollDisplay();
  try {
    const created = await post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), rolls,
      flavor: `<h3>${esc(attack.name)} · урон</h3>`,
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true, exchange: { attack: message.id, index, kind: "damage",
        base: rolls[0].total, silver: silver?.total ?? 0, location: { id: location.id, name: location.name, multiplier: location.multiplier },
        traits, critical } } } });
    await display.wait(created);
    return created;
  } finally { display.close(); }
}

/** Live preview of the damage against the target's current armor; the same function applies it. */
export function damagePreview(message, index) {
  const attack = flagsOf(message).weaponAttack, damage = linked(message.id, index, "damage"), target = targetActor(attack);
  if (!damage || !target) return null;
  const data = exchangeOf(damage), armor = armorAt(target, data.location.id);
  const critical = data.critical ? { name: data.critical.name, bonus: data.critical.bonus } : null;
  return { data, target, armor, result: resolveDamage({ base: data.base, silver: data.silver, location: data.location.id, multiplier: data.location.multiplier,
    traits: data.traits, armor, monster: monsterResistant(target), vulnerableToFire: fireVulnerable(target), critical }) };
}

export async function applyExchangeDamage(message, index) {
  const preview = damagePreview(message, index);
  if (!preview?.target.isOwner || linkedAny(message.id, index, "applied")) return;
  const { target, result, data } = preview, health = target.system.health.value;
  await target.update({ "system.health.value": health - result.total });
  if (result.ablate) {
    const item = target.items.get(result.ablate);
    if (item) await item.update({ "system.stoppingPower.value": Math.max(0, item.system.stoppingPower.value - 1) });
  }
  if (data.critical?.wound) {
    const wound = data.critical.wound;
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: `Крит: ${wound.name}`, img: "icons/svg/blood.svg",
      description: `<p><b>${esc(data.critical.name)} ранение · ${esc(data.location.name)}</b></p><p>${esc(wound.effect)}</p><p><i>После стабилизации:</i> ${esc(wound.stabilized)}</p><p><i>После лечения:</i> ${esc(wound.treated)}</p><p>Стабилизация: Первая помощь СЛ ${CRITICAL_LEVELS.find(level => level.id === data.critical.level).stabilize}.</p>`,
      flags: { [SYSTEM_ID]: { criticalWound: { id: wound.id, level: data.critical.level, location: data.location.id, state: "fresh" } } } }]);
  }
  return post({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: target }), content: `<p>${esc(target.name)}: −${result.total} ПЗ</p>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, exchange: { attack: message.id, index, kind: "applied", total: result.total, steps: result.steps, from: health,
      ablated: result.ablate ? target.items.get(result.ablate)?.name ?? "" : "" } } } }, "public");
}

// ── Rendering ────────────────────────────────────────────────────────────────

const stepsHTML = steps => `<ul class="witcher-roll-breakdown">${steps.map(step => `<li><span>${esc(step.label)}${step.detail ? ` <small>${esc(step.detail)}</small>` : ""}</span><b>${esc(step.value)}</b></li>`).join("")}</ul>`;
const button = (attrs, label, enabled, hint = "") => `<button type="button" ${attrs} ${enabled ? "" : "disabled"} ${hint ? `data-tooltip="${esc(hint)}"` : ""}>${label}</button>`;

function rowHTML(message, index, attack) {
  const total = message.rolls[index]?.total, target = targetActor(attack), outcome = exchangeOutcome(message, index);
  const head = `<header><span>Атака ${attack.count > 1 ? `${index + 1} ` : ""}<b>${total}</b></span>`;
  if (!outcome) {
    if (!target?.isOwner) return `<li class="is-waiting">${head}<em>${linkedAny(message.id, index, "defense") ? "защита бросается…" : "ждём защиту"}</em></header></li>`;
    if (linkedAny(message.id, index, "defense")) return `<li class="is-waiting">${head}<em><i class="fa-solid fa-dice-d10 fa-spin"></i> защита бросается…</em></header></li>`;
    const choices = defenseChoices(target, incomingOf(attack)).map(choice => button(`data-exchange-defend="${choice.mode}" data-item-id="${choice.itemId ?? ""}"`,
      `${esc(choice.name)}${choice.total != null && !choice.blocked ? ` <b>+${choice.total}</b>` : ""}`, !choice.blocked, choice.blocked || choice.note));
    const free = defenseChoices(target, incomingOf(attack))[0]?.activeDodge;
    const repeatBox = `<label class="witcher-exchange-repeat" data-tooltip="${free ? "Активное уклонение: повторные защиты бесплатны" : "Вторая и следующие защиты за раунд стоят 1 ВЫН"}"><input type="checkbox" data-exchange-repeat ${repeatDefense(target) ? "checked" : ""} ${free ? "disabled" : ""}> Повторная · ${free ? 0 : 1} ВЫН</label>`;
    return `<li class="is-waiting">${head}<em>защита ${esc(target.name)}</em>${repeatBox}</header><div class="witcher-exchange-actions">${choices.join("")}${button('data-exchange-defend="none"', "Не защищается", true, `Атака сравнивается со СЛ ${DC_UNAWARE}`)}</div></li>`;
  }
  const verdict = outcome.hit ? `<strong class="is-hit">Попадание +${outcome.margin}</strong>` : `<strong class="is-miss">${outcome.mode === "parry" ? "Парировано" : "Промах"}</strong>`;
  const gang = exchangeOf(outcome.defense).gang;
  const defenseLine = `${esc(outcome.name)} <b>${outcome.defenseTotal}</b>${gang ? ` <small>(окружение −${gang})</small>` : ""}`;
  let body = "";
  if (outcome.critical) body += `<p class="witcher-exchange-crit"><i class="fa-solid fa-burst"></i> Критическое ранение: ${esc(outcome.critical.name.toLocaleLowerCase("ru"))} (+${outcome.critical.bonus} урона)</p>`;
  if (!outcome.hit && outcome.mode === "parry") body += `<p class="witcher-exchange-note"><i class="fa-solid fa-person-falling"></i> ${esc(message.speakerActor?.name ?? "Атакующий")} ошеломлён: −2 к атаке и защите до начала своего хода.</p>`;
  const wear = exchangeOf(outcome.defense).wear;
  if (wear) body += `<p class="witcher-exchange-wear"><i class="fa-solid fa-shield-halved"></i> Удар принял ${esc(wear.name)}: надёжность ${wear.from} → ${wear.to}${wear.to === 0 ? " · сломано" : ""}</p>`;
  if (outcome.hit) {
    const damage = linked(message.id, index, "damage"), applied = linked(message.id, index, "applied");
    if (!damage && linkedAny(message.id, index, "damage")) body += `<p class="witcher-exchange-note"><i class="fa-solid fa-dice-d6 fa-spin"></i> Урон бросается…</p>`;
    else if (!damage) body += message.speakerActor?.isOwner ? `<div class="witcher-exchange-actions">${button("data-exchange-damage", `<i class="fa-solid fa-dice-d6"></i> Урон ${esc(attack.damage)}`, true)}</div>` : `<p class="witcher-exchange-note">Ждём бросок урона.</p>`;
    else {
      const data = exchangeOf(damage), wound = data.critical?.wound;
      body += `<p class="witcher-exchange-damage">Урон <b>${data.base}</b>${data.silver ? ` + серебро <b>${data.silver}</b>` : ""} → ${esc(data.location.name)}${data.location.multiplier !== 1 ? ` (×${data.location.multiplier === 0.5 ? "½" : data.location.multiplier})` : ""}</p>`;
      if (wound) body += `<details class="witcher-exchange-wound"><summary>${esc(wound.name)}</summary><p>${esc(wound.effect)}</p></details>`;
      if (applied) {
        const result = exchangeOf(applied);
        body += `<p class="witcher-exchange-applied" data-tooltip="${esc(stepsHTML(result.steps))}" data-tooltip-class="witcher-roll-tooltip"><i class="fa-solid fa-heart-crack"></i> −${result.total} ПЗ${result.ablated ? ` <small>· ${esc(result.ablated)}: ПБ −1</small>` : ""}</p>`;
        // Core p.158: every critical wound also forces a Stun save.
        if (data.critical && target?.isOwner) body += `<div class="witcher-exchange-actions">${button("data-exchange-stun", '<i class="fa-solid fa-dice-d10"></i> Испытание Устойчивости', true, "Критическое ранение требует испытания УСТ")}</div>`;
      } else if (target?.isOwner) {
        const preview = damagePreview(message, index);
        body += `<div class="witcher-exchange-actions">${button("data-exchange-apply", `<i class="fa-solid fa-heart-crack"></i> Применить −${preview.result.total} ПЗ`, true)}</div>${stepsHTML(preview.result.steps)}`;
      } else body += `<p class="witcher-exchange-note">Урон применяет владелец цели или мастер.</p>`;
    }
  }
  return `<li class="${outcome.hit ? "is-hit" : "is-miss"}">${head}<span>${defenseLine}</span>${verdict}</header>${body}</li>`;
}

export function renderExchange(message, html) {
  const flags = flagsOf(message);
  if (exchangeOf(message) && game.messages.has(exchangeOf(message).attack)) { html.classList.add("witcher-ambush-folded"); html.hidden = true; return; }
  const attack = flags.weaponAttack;
  if (!attack?.target || !message.isContentVisible || !message.rolls?.length) return;
  const section = html.querySelector(".witcher-attack-chat");
  if (!section) return;
  for (const legacy of section.querySelectorAll("[data-weapon-damage], .witcher-location-buttons")) legacy.remove();
  const target = targetActor(attack);
  const list = document.createElement("div");
  list.className = "witcher-exchange";
  list.innerHTML = `<h4><i class="fa-solid fa-swords"></i> Против: ${esc(target?.name ?? "цель недоступна")}</h4><ol>${message.rolls.map((_roll, index) => rowHTML(message, index, attack)).join("")}</ol>`;
  (html.querySelector(".message-content") ?? section).append(list);
  list.querySelectorAll(":scope > ol > li").forEach((row, index) => {
    const run = (selector, work) => row.querySelector(selector)?.addEventListener("click", async event => {
      event.stopPropagation(); event.currentTarget.disabled = true;
      try { await work(event.currentTarget); } catch (error) { ui.notifications.warn(error.message); }
    });
    row.querySelector("[data-exchange-repeat]")?.addEventListener("click", event => event.stopPropagation());
    row.querySelectorAll("[data-exchange-defend]").forEach(choice => choice.addEventListener("click", async event => {
      event.stopPropagation(); for (const other of row.querySelectorAll("[data-exchange-defend]")) other.disabled = true;
      const repeatBox = row.querySelector("[data-exchange-repeat]");
      try { await defendAttack(message, index, choice.dataset.exchangeDefend, choice.dataset.itemId, repeatBox && !repeatBox.disabled ? repeatBox.checked : null); } catch (error) { ui.notifications.warn(error.message); }
    }));
    run("[data-exchange-damage]", () => rollExchangeDamage(message, index));
    run("[data-exchange-apply]", () => applyExchangeDamage(message, index));
    run("[data-exchange-stun]", () => rollStun(targetActor(attack)));
  });
}

function refreshAttack(message) {
  const link = exchangeOf(message), attack = link && game.messages.get(link.attack);
  if (attack && ui.chat) ui.chat.updateMessage(attack, { notify: false });
}

/** Re-render once the linked dice have landed (or at once without Dice So Nice). */
function settleThenRefresh(message) {
  if (!exchangeOf(message)) return;
  if (!game.dice3d || !message.rolls?.length) { refreshAttack(message); return void afterSettled(message).catch(console.error); }
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
  Hooks.on("updateChatMessage", refreshAttack);
  Hooks.on("deleteChatMessage", refreshAttack);
  // Armor, health and equipment changes alter the live damage preview on open cards.
  const refreshAll = () => { if (!ui.chat) return; for (const message of game.messages.contents.slice(-30)) if (flagsOf(message).weaponAttack?.target) ui.chat.updateMessage(message, { notify: false }); };
  Hooks.on("updateItem", item => { if (item.type === "armor") refreshAll(); });
}
