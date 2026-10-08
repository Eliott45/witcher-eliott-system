import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { creatureHasTrait } from "../data/creature-modes.mjs";

// Core pp.176–177 «Словесная дуэль». A duel is a Combat flagged `verbalDuel`: every participant's Resolve
// ((WILL + INT) / 2 × 5) replaces HP. An attack card asks the target to defend; the higher result deals its
// damage to the other side's Resolve. Accumulating bonuses, levers and torture live in the duel's state per
// attacker → target pair. The active GM applies every change, so either side can resolve a card.
const STAT = { empathy: "ЭМП", intelligence: "ИНТ", will: "ВОЛЯ" };
export const VERBAL_ATTACKS = [
  { id: "seduce", name: "Соблазнить", skill: "seduction", damage: "1d6", stat: "empathy", type: "empathic", stack: { key: "seduce", value: 2 },
    effect: "Защищающийся немного смущён: каждое следующее Соблазнение по нему наносит +2 урона (накапливается)." },
  { id: "persuade", name: "Убедить", skill: "persuasion", damage: "floor(1d6 / 2)", label: "1d6/2", stat: "empathy", type: "empathic",
    effect: "Если дуэль завершена Убеждением — противник убеждён в вашей правоте.", finish: "убеждён в правоте победителя" },
  { id: "reason", name: "Привести довод", skill: "leadership", damage: "1d10", stat: "empathy", type: "empathic", stack: { key: "reason", value: 1, empathic: true },
    effect: "Противник думает, что вы, возможно, правы: +1 к урону всех эмпатических атак по нему за каждый успешный довод." },
  { id: "befriend", name: "Сдружиться", skill: "charisma", damage: "1d6", stat: "empathy", type: "empathic",
    effect: "Если дуэль завершена этим действием — противник становится другом (знакомым из жизненного пути).", finish: "становится другом победителя" },
  { id: "deceive", name: "Обмануть", skill: "deceit", damage: "1d6", stat: "intelligence", type: "antagonistic",
    effect: "Если дуэль завершена Обманом — противник поверил в вашу ложь.", finish: "поверил в ложь победителя" },
  { id: "ridicule", name: "Насмехаться", skill: "socialEtiquette", damage: "1d6", stat: "will", type: "antagonistic",
    effect: "Публичная насмешка: репутация противника у окружающих −2 на 1 день за каждую успешную насмешку." },
  { id: "intimidate", name: "Запугать", skill: "intimidation", damage: "1d10", stat: "will", type: "antagonistic", stack: { key: "intimidate", value: 4 },
    effect: "Противник боится вас: +4 к урону каждого следующего Запугивания по нему (накапливается)." }
];
export const VERBAL_LEVERS = [
  { id: "love", name: "Любовь", skill: "charisma", type: "empathic", effect: "Противник влюбляется: −3 к его проверкам против вас в этой дуэли, пока вы хорошо с ним обращаетесь." },
  { id: "study", name: "Изучение", skill: "humanPerception", type: "empathic", fixed: "intelligence", effect: "Понимание людей против ИНТ × 3 противника: +2 к вашим проверкам против него на 1 раунд." },
  { id: "hint", name: "Намёк", skill: "persuasion", alt: "deceit", type: "antagonistic", once: true, effect: "Противник получает −4 к защите от вас. Один раз за дуэль." },
  { id: "bribe", name: "Подкуп", skill: "gambling", type: "antagonistic", effect: "+1 к вашим эмпатическим проверкам против противника за каждые 50 предложенных крон до конца дуэли." }
];
export const VERBAL_DEFENSES = [
  { id: "ignore", name: "Игнорировать", skill: "resistCoercion", damage: "1d10", stat: "empathy" },
  { id: "topic", name: "Смена темы", skill: "persuasion", damage: "1d6", stat: "intelligence" },
  { id: "stop", name: "Прекращение", skill: "resistCoercion", damage: null, effect: "Завершение спора: при успехе защищающийся выходит из дуэли." },
  { id: "counter", name: "Контраргумент", skill: null, effect: "Вместо защиты — своя атака. Если ваш результат выше, атака противника отменяется, а ваша наносит урон." }
];
export const actionById = id => VERBAL_ATTACKS.find(entry => entry.id === id) ?? VERBAL_LEVERS.find(entry => entry.id === id);
export const TORTURE = [{ id: 0, name: "Нет" }, { id: 1, name: "Наносил урон беззащитному (−3 эмп. / +3 Запугивание)" }, { id: 2, name: "До порога ранения (−10 эмп. / +10 Запугивание)" }];

const flags = document => document?.flags?.[SYSTEM_ID] ?? {};
export const isDuel = combat => Boolean(flags(combat).verbalDuel);
export const creatureCannotNegotiate = actor => ["fearless", "construct"].some(trait => creatureHasTrait(actor,trait));
/** The verbal duel this actor takes part in (the active one first). */
export function duelOf(actor) {
  if (!actor) return null;
  const has = combat => isDuel(combat) && Array.from(combat.combatants).some(entry => entry.actor === actor || entry.actor?.uuid === actor.uuid);
  return (globalThis.game?.combat && has(game.combat) ? game.combat : null) ?? Array.from(globalThis.game?.combats ?? []).find(has) ?? null;
}
const pairKey = (attacker, target) => `${attacker.replaceAll(".", "_")}__${target.replaceAll(".", "_")}`;
export const pairState = (combat, attacker, target) => flags(combat).verbalDuel?.pairs?.[pairKey(attacker, target)] ?? {};

/** Modifiers to a check by `actor` against `other` for an action of `type` (empathic / antagonistic / defense). */
export function duelModifiers(combat, actor, other, action, { torture = 0, situational = 0 } = {}) {
  const parts = [], own = pairState(combat, actor.uuid, other.uuid), theirs = pairState(combat, other.uuid, actor.uuid);
  const empathic = action?.type === "empathic";
  if (situational) parts.push({ label: "Ситуация", value: situational });
  if (own.study && own.study >= (combat?.round ?? 0)) parts.push({ label: "Изучение", value: 2 });
  if (empathic && own.bribe) parts.push({ label: "Подкуп", value: own.bribe });
  if (theirs.love) parts.push({ label: "Влюблён", value: -3 });
  if (action?.defense && theirs.hint) parts.push({ label: "Намёк", value: -4 });
  if (torture && empathic) parts.push({ label: "Пытки", value: torture === 2 ? -10 : -3 });
  if (torture && action?.id === "intimidate") parts.push({ label: "Пытки", value: torture === 2 ? 10 : 3 });
  return parts;
}
/** Extra damage from the accumulating effects of earlier successes against this target. */
export function stackDamage(combat, attacker, target, action) {
  const pair = pairState(combat, attacker.uuid, target.uuid), parts = [];
  if (action.id === "seduce" && pair.seduce) parts.push({ label: "Соблазнение (накоплено)", value: pair.seduce });
  if (action.type === "empathic" && pair.reason) parts.push({ label: "Доводы (накоплено)", value: pair.reason });
  if (action.id === "intimidate" && pair.intimidate) parts.push({ label: "Запугивание (накоплено)", value: pair.intimidate });
  return parts;
}
const statValue = (actor, stat) => actor.system.statistics.effective?.[stat] ?? 0;
const skillTotal = (actor, key) => skillValue(actor.system, key)?.total ?? 0;
const signed = value => value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
const mods = parts => parts.reduce((sum, part) => sum + part.value, 0);
const partsHTML = parts => parts.length ? `<ul class="witcher-attack-modifiers">${parts.map(part => `<li class="${part.value > 0 ? "is-bonus" : "is-penalty"}"><span>${esc(part.label)}</span><b>${signed(part.value)}</b></li>`).join("")}</ul>` : "";
const actorOf = uuid => { const found = fromUuidSync(uuid); return found?.actor ?? found; };

/** Roll a verbal attack or lever against the targeted token. */
export async function verbalAttack(actor, actionId, { skill = null, situational = 0, torture = 0, crowns = 0 } = {}) {
  const combat = duelOf(actor), action = actionById(actionId);
  if (!combat) throw new Error("Персонаж не участвует в словесной дуэли.");
  if (!action) throw new Error("Неизвестное действие.");
  const targets = Array.from(game.user.targets ?? []);
  if (targets.length !== 1) throw new Error("Выберите одного противника (T).");
  const target = targets[0].actor;
  if (!target || !Array.from(combat.combatants).some(entry => entry.actor?.uuid === target.uuid)) throw new Error("Цель не участвует в этой дуэли.");
  if (creatureCannotNegotiate(target)) throw new Error("Это существо нельзя запугать или убедить: словесная дуэль на него не действует.");
  if (action.once && pairState(combat, actor.uuid, target.uuid)[action.id]) throw new Error(`${action.name}: только один раз за дуэль.`);
  const key = skill && [action.skill, action.alt].includes(skill) ? skill : action.skill;
  const parts = duelModifiers(combat, actor, target, action, { torture, situational });
  const roll = await new foundry.dice.Roll(`1d10wc + ${skillTotal(actor, key) + mods(parts)}`).evaluate();
  const lever = VERBAL_LEVERS.includes(action);
  // Study is checked against INT × 3 at once; every other action waits for the target's defense.
  const fixed = action.fixed ? statValue(target, action.fixed) * 3 : null;
  const content = `<section class="witcher-attack-chat witcher-verbal-card"><h3><i class="fa-solid fa-comments"></i> ${esc(action.name)} → ${esc(target.name)}</h3>`
    + `<p>${lever ? "Рычаг давления (полный ход)" : action.type === "empathic" ? "Эмпатическая атака" : "Антагонистическая атака"} · ${esc(game.i18n.localize(`WITCHER.Skills.Entries.${key}.Label`))}${action.damage ? ` · урон ${esc(action.label ?? action.damage)} + ${STAT[action.stat]}` : ""}</p>`
    + partsHTML(parts) + `<small>${esc(action.effect)}</small>` + (crowns ? `<small>Предложено: ${crowns} крон.</small>` : "") + `</section>`;
  const message = await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flavor: content,
    flags: { [SYSTEM_ID]: { verbal: { kind: "attack", duel: combat.id, action: action.id, skill: key, attacker: actor.uuid, target: target.uuid, torture, crowns, fixed, round: combat.round } } } });
  if (fixed !== null) await resolveVerbal(message, null);
  return message;
}

/** Defense (or, for Study, the fixed DC): roll, compare, and post the outcome for the GM to apply. */
export async function resolveVerbal(message, defenseId, { counterId = null, situational = 0 } = {}) {
  const data = flags(message).verbal, combat = game.combats.get(data?.duel);
  if (!data || data.kind !== "attack" || !combat) throw new Error("Дуэль уже закончилась.");
  if (game.messages.contents.some(entry => flags(entry).verbal?.kind === "outcome" && flags(entry).verbal.attack === message.id)) return;
  const attacker = actorOf(data.attacker), target = actorOf(data.target), action = actionById(data.action);
  if (creatureCannotNegotiate(target) || creatureCannotNegotiate(attacker)) throw new Error("С существом нельзя договориться или запугать его: словесная дуэль недоступна.");
  const attackTotal = message.rolls[0]?.total ?? 0, rolls = [], lines = [], damage = [], state = [];
  let defenseTotal = data.fixed, winner = "attacker", defense = null, counter = null;
  if (data.fixed === null) {
    defense = VERBAL_DEFENSES.find(entry => entry.id === defenseId);
    if (!defense) throw new Error("Выберите защиту.");
    counter = defense.id === "counter" ? VERBAL_ATTACKS.find(entry => entry.id === counterId) : null;
    if (defense.id === "counter" && !counter) throw new Error("Выберите атаку для контраргумента.");
    const parts = duelModifiers(combat, target, attacker, counter ?? { ...defense, defense: true }, { situational });
    const roll = await new foundry.dice.Roll(`1d10wc + ${skillTotal(target, counter?.skill ?? defense.skill) + mods(parts)}`).evaluate();
    rolls.push(roll); defenseTotal = roll.total;
    lines.push(`${esc(target.name)}: ${esc(counter ? `контраргумент «${counter.name}»` : defense.name)} <b>${roll.total}</b> против <b>${attackTotal}</b>.`);
    if (parts.length) lines.push(partsHTML(parts));
  } else lines.push(`${esc(action.name)} <b>${attackTotal}</b> против ИНТ × 3 = <b>${defenseTotal}</b>.`);
  // As in combat, the attack must be strictly higher than the defense.
  if (!(attackTotal > defenseTotal)) winner = "defender";
  const hitWith = async (who, whom, act) => {
    const extra = stackDamage(combat, who, whom, act), roll = await new foundry.dice.Roll(`${act.damage} + ${statValue(who, act.stat) + mods(extra)}`).evaluate();
    rolls.push(roll); damage.push({ uuid: whom.uuid, amount: Math.max(0, roll.total), action: act.id, by: who.uuid });
    lines.push(`<b>${esc(who.name)}</b> → ${esc(whom.name)}: <b>${roll.total}</b> урона Решительности (${esc(act.label ?? act.damage)} + ${STAT[act.stat]} ${statValue(who, act.stat)}${extra.map(part => ` + ${esc(part.label)} ${part.value}`).join("")}).`);
    if (act.stack) state.push({ attacker: who.uuid, target: whom.uuid, key: act.stack.key, add: act.stack.value });
    state.push({ attacker: who.uuid, target: whom.uuid, key: "last", set: act.id });
    if (act.id === "ridicule") state.push({ ridicule: whom.uuid });
  };
  if (winner === "attacker") {
    lines.push(`<strong>${esc(attacker.name)} берёт верх.</strong>`);
    if (action.damage) await hitWith(attacker, target, action);
    else if (action.id === "study") state.push({ attacker: attacker.uuid, target: target.uuid, key: "study", set: combat.round + 1 });
    else if (action.id === "bribe") state.push({ attacker: attacker.uuid, target: target.uuid, key: "bribe", add: Math.max(1, Math.floor((data.crowns || 50) / 50)) });
    else state.push({ attacker: attacker.uuid, target: target.uuid, key: action.id, set: true });
  } else {
    lines.push(`<strong>${esc(target.name)} ${defense?.id === "stop" ? "прекращает спор" : "держит удар"}.</strong>`);
    if (counter) await hitWith(target, attacker, counter);
    else if (defense?.damage) await hitWith(target, attacker, defense);
    if (defense?.id === "stop") state.push({ leaves: target.uuid });
  }
  if (action.once) state.push({ attacker: attacker.uuid, target: target.uuid, key: action.id, set: true });
  return foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: data.fixed === null ? target : attacker }), rolls,
    content: `<section class="witcher-attack-chat witcher-verbal-card"><h3><i class="fa-solid fa-comments"></i> ${esc(action.name)} · итог</h3>${lines.map(line => line.startsWith("<ul") ? line : `<p>${line}</p>`).join("")}</section>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, verbal: { kind: "outcome", attack: message.id, duel: combat.id, damage, state, applied: false } } } });
}

/** Active GM: Resolve damage, duel state, defeats and ridicule. */
async function applyOutcome(message) {
  const data = flags(message).verbal;
  if (data?.kind !== "outcome" || data.applied || !game.users.activeGM?.isSelf) return;
  const combat = game.combats.get(data.duel);
  await message.update({ [`flags.${SYSTEM_ID}.verbal.applied`]: true });
  const pairs = foundry.utils.deepClone(flags(combat).verbalDuel?.pairs ?? {});
  for (const change of data.state) {
    if (change.ridicule) {
      const victim = actorOf(change.ridicule);
      await victim?.createEmbeddedDocuments("ActiveEffect", [{ name: "Осмеян", img: "icons/svg/sound-off.svg", type: "base", system: {},
        description: "<p>Публичная насмешка в словесной дуэли: −2 к репутации у окружающих на 1 день.</p>", duration: { value: 86400, units: "seconds", expiry: null, expired: false },
        flags: { [SYSTEM_ID]: { condition: { key: "ridiculed", modifiers: [{ target: "reputation", value: -2 }] } } } }]);
      continue;
    }
    if (change.leaves) { const entry = Array.from(combat?.combatants ?? []).find(c => c.actor?.uuid === change.leaves); if (entry) await entry.update({ defeated: true }); continue; }
    const key = pairKey(change.attacker, change.target), pair = pairs[key] ??= {};
    if ("set" in change) pair[change.key] = change.set; else pair[change.key] = (pair[change.key] ?? 0) + change.add;
  }
  if (combat) await combat.update({ [`flags.${SYSTEM_ID}.verbalDuel.pairs`]: pairs });
  for (const hit of data.damage) {
    const actor = actorOf(hit.uuid);
    if (!actor) continue;
    const before = actor.system.resolve.value, after = Math.max(0, before - hit.amount);
    await actor.update({ "system.resolve.value": after });
    if (before > 0 && after <= 0) {
      const winner = actorOf(hit.by), action = actionById(hit.action);
      const entry = Array.from(combat?.combatants ?? []).find(c => c.actor?.uuid === actor.uuid);
      if (entry) await entry.update({ defeated: true });
      await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
        content: `<section class="witcher-attack-chat witcher-verbal-card"><h3><i class="fa-solid fa-flag"></i> ${esc(actor.name)} проигрывает словесную дуэль</h3><p>Решительность исчерпана: ${esc(actor.name)} ${esc(action?.finish ?? "делает то, чего хотел")} ${esc(winner?.name ?? "противник")}${action?.finish ? "" : "."}</p></section>` });
    }
  }
}

/** GM: a verbal duel with the selected tokens; Resolve is set to its maximum. */
export async function startVerbalDuel() {
  if (!game.user.isGM) return;
  const tokens = canvas?.tokens?.controlled ?? [];
  if (tokens.length < 2) throw new Error("Выделите на сцене участников словесной дуэли (не меньше двух).");
  const blocked=tokens.filter(token=>creatureCannotNegotiate(token.actor));
  if(blocked.length)throw new Error(`Нельзя договориться или запугать: ${blocked.map(token=>token.name).join(", ")}.`);
  const combat = await foundry.documents.Combat.create({ scene: canvas.scene.id, active: true, flags: { [SYSTEM_ID]: { verbalDuel: { pairs: {} } } } });
  await combat.createEmbeddedDocuments("Combatant", tokens.map(token => ({ tokenId: token.id, sceneId: canvas.scene.id, actorId: token.actor?.id })));
  for (const token of tokens) if (token.actor) await token.actor.update({ "system.resolve.value": token.actor.system.resolve.max });
  await foundry.documents.ChatMessage.create({ content: `<section class="witcher-attack-chat witcher-verbal-card"><h3><i class="fa-solid fa-comments"></i> Словесная дуэль</h3><p>Участники: ${esc(tokens.map(token => token.name).join(", "))}. Решительность восстановлена. Каждая сторона объявляет свою цель спора.</p></section>`, flags: { [SYSTEM_ID]: { skipLuck: true } } });
  return combat;
}

function renderVerbalCard(message, html) {
  const data = flags(message).verbal;
  if (data?.kind !== "attack" || data.fixed !== null) return;
  const outcome = game.messages.contents.find(entry => flags(entry).verbal?.kind === "outcome" && flags(entry).verbal.attack === message.id);
  const box = document.createElement("div");
  box.className = "witcher-exchange witcher-verbal-defense";
  const target = actorOf(data.target);
  if (outcome) { box.innerHTML = `<p class="is-done"><i class="fa-solid fa-check"></i> Ответ получен — итог ниже.</p>`; html.querySelector(".message-content")?.append(box); return; }
  const owner = target?.isOwner;
  const own = VERBAL_ATTACKS.map(entry => `<option value="${entry.id}">${entry.name}</option>`).join("");
  box.innerHTML = `<h4><i class="fa-solid fa-shield-halved"></i> Защита: ${esc(target?.name ?? "?")}</h4><div class="witcher-exchange-actions">`
    + VERBAL_DEFENSES.filter(entry => entry.id !== "counter").map(entry => `<button type="button" data-verbal-defense="${entry.id}" ${owner ? "" : "disabled"} data-tooltip="${esc(entry.effect ?? `Урон атакующему при успехе: ${entry.damage} + ${STAT[entry.stat]}`)}">${entry.name} <b>${target ? signed(skillTotal(target, entry.skill)) : ""}</b></button>`).join("")
    + `<span class="witcher-verbal-counter"><select data-verbal-counter ${owner ? "" : "disabled"}>${own}</select><button type="button" data-verbal-defense="counter" ${owner ? "" : "disabled"} data-tooltip="${esc(VERBAL_DEFENSES.at(-1).effect)}">Контраргумент</button></span></div>`;
  box.querySelectorAll("[data-verbal-defense]").forEach(button => button.addEventListener("click", async event => {
    event.stopPropagation(); button.disabled = true;
    try { await resolveVerbal(message, button.dataset.verbalDefense, { counterId: box.querySelector("[data-verbal-counter]")?.value }); }
    catch (error) { ui.notifications.warn(error.message); button.disabled = false; }
  }));
  (html.querySelector(".message-content") ?? html).append(box);
}

export function registerVerbalDuel() {
  Hooks.on("renderChatMessageHTML", renderVerbalCard);
  Hooks.on("createChatMessage", message => {
    applyOutcome(message).catch(console.error);
    const link = flags(message).verbal;
    if (link?.kind === "outcome") { const source = game.messages.get(link.attack); if (source && ui.chat) ui.chat.updateMessage(source, { notify: false }); }
  });
  Hooks.on("renderCombatTracker", (app, html) => {
    html.querySelector(".witcher-verbal-duel-button")?.remove();
    html.querySelector(".witcher-verbal-duel-label")?.remove();
    if (isDuel(app.viewed)) {
      const label = document.createElement("div");
      label.className = "witcher-verbal-duel-label";
      label.innerHTML = '<i class="fa-solid fa-comments"></i> Словесная дуэль — урон наносится Решительности';
      html.querySelector(".combat-tracker-header, header")?.append(label);
    }
    if (!game.user.isGM) return;
    const anchor = html.querySelector('[data-action="createCombat"]');
    if (!anchor) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${anchor.className} witcher-verbal-duel-button`.replace(/\bfa-\S+/g, "").trim() + " fa-solid fa-comments";
    button.dataset.tooltip = "Словесная дуэль: с выделенными токенами";
    button.setAttribute("aria-label", button.dataset.tooltip);
    button.addEventListener("click", async event => { event.preventDefault(); event.stopPropagation(); try { await startVerbalDuel(); } catch (error) { ui.notifications.warn(error.message); } });
    anchor.after(button);
  });
}
