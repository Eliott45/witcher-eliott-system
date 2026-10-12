import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { skillValue } from "../data/skills.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { CONDITION_BY_ID, conditionSource } from "../data/condition-definitions.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { conditionRules } from "./condition-rules.mjs";
import { actionQuote, actionUpdate, actionNote } from "./action-economy.mjs";
import { attackerToken, tokenCenter } from "./attack-target.mjs";
import { bandFor, combatModifierParts, signed, ATTACK_LOCATIONS } from "./weapon-rules.mjs";
import { armorAt, resolveDamage, monsterResistant, fireVulnerable, weaponDamageTraits } from "./damage-rules.mjs";
import { burningParts } from "./burning.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { scatterOffset } from "../canvas/scatter-overlay.mjs";
import { spiritSuppressionSource, createSpiritZone } from "./creature-spirits.mjs";
import { experimentalEffect } from "./experimental-effects.mjs";

// Core p.165 «Бомбы и ловушки»: a bomb is thrown with Athletics (range BODY × 4 m) at a point; a failed
// throw lands per the scatter table (1d10 direction, 1d6 m). Everyone in the radius takes a separate
// full damage roll on every body part: minus that part's SP, then the location multiplier; plus the bomb's effect.
export const isBomb = item => item?.type === "equipment" && String(item.system.ruleId ?? "").startsWith("bomb.");
export const isTrap = item => item?.type === "equipment" && String(item.system.ruleId ?? "").startsWith("trap.");

/** What a bomb does, read from its properties line (e.g. «Бомба; Радиус 4 м; Урон 7d6; Горение (25%)»). */
export function bombProfile(item) {
  const text = `${item.system.properties ?? ""}; ${String(item.system.description ?? "").replace(/<[^>]+>/g, " ")}`;
  const number = (pattern, fallback = 0) => { const found = text.match(pattern); return found ? Number(found[1].replace(",", ".").replace("−", "-")) : fallback; };
  const gas = item.system.ruleId === "bomb.dragon-dream";
  return {
    radius: number(/Радиус\s+(\d+(?:[.,]\d+)?)\s*м/u, 4),
    damage: gas ? "" : item.system.properties?.match(/Урон\s+(\d+d\d+(?:\s*[+−-]\s*\d+)?)/u)?.[1]?.replace("−", "-") ?? "",
    burning: gas ? 0 : number(/Горение\s*\((\d+)%\)/u),
    bleeding: number(/Кровотечение\s*\((\d+)%\)/u),
    fury: item.system.ruleId === "trap.fury", marker: item.system.ruleId === "trap.marker", gas,
    poison: number(/Отравление\s*\((\d+)%\)/u),
    doublePoison: /Двойной урон яда/u.test(text),
    blind: number(/Слепота\s*—\s*(\d+)\s*раунд/u),
    stunSave: /Испытание УСТ/u.test(item.system.properties ?? "") ? number(/Испытание УСТ\s*([−-]?\d+)/u) : null,
    freeze: /Замораживание/u.test(item.system.properties ?? "") ? number(/длится\s+(\d+)\s+раунд/u, 8) : 0,
    moonDust: item.system.ruleId === "bomb.moon-dust" ? 20 : 0,
    dimeritium: item.system.ruleId === "bomb.dimeritium" ? 20 : 0,
    traits: weaponDamageTraits(item.system)
  };
}

const grid = scene => scene.grid;
const metres = (scene, a, b) => grid(scene).measurePath?.([a, b])?.distance ?? Math.hypot(b.x - a.x, b.y - a.y) / grid(scene).size * grid(scene).distance;
const halfSize = (scene, token) => Math.max(token.width ?? 1, token.height ?? 1) / 2 * grid(scene).distance;

/** Only creatures take a blast: loot piles, shops and places of power on the map are not hurt. */
export const blastable = actor => ["character", "npc"].includes(actor?.type) && actor.system?.health?.value !== undefined;
/** Tokens whose body is inside the blast circle. */
export function tokensInBlast(scene, point, radius) {
  return Array.from(scene.tokens).filter(token => blastable(token.actor) && metres(scene, point, tokenCenter(token)) - halfSize(scene, token) <= radius);
}
/** Where a scatter result sends the bomb, as the thrower sees it (core «Разброс»). */
export const SCATTER_WORDS = { 1: "перелёт", 2: "перелёт вправо", 3: "перелёт", 4: "перелёт влево", 5: "вправо", 6: "влево",
  7: "недолёт вправо", 8: "недолёт", 9: "недолёт влево", 10: "недолёт" };

/** Waits for one click on the map; resolves to the scene point. */
function pickPoint() {
  return new Promise((resolve, reject) => {
    ui.notifications.info("Кликните точку броска на карте (Esc — отмена).");
    const done = () => { canvas.stage.off("pointerdown", click); document.removeEventListener("keydown", key); };
    const click = event => { done(); resolve(event.getLocalPosition?.(canvas.stage) ?? { ...canvas.mousePosition }); };
    const key = event => { if (event.key === "Escape") { done(); reject(new Error("Бросок отменён.")); } };
    canvas.stage.once("pointerdown", click);
    document.addEventListener("keydown", key);
  });
}

/** Throw quote: Athletics + DEX against the distance DC of the point. */
export function bombThrowQuote(actor, item, distance, extraPenalty = 0) {
  const body = actor.system.statistics.effective.body ?? 0, range = body * 4;
  const band = bandFor(range, distance);
  const skill = skillValue(actor.system, "athletics");
  const parts = [{ label: "Основа навыка", value: skill?.total ?? 0 }, ...(band ? [{ label: band.name, value: band.penalty }] : []),
    { label: "Дополнительное действие", value: extraPenalty }, ...combatModifierParts(actor, "combat.attack")];
  const total = parts.reduce((sum, part) => sum + (part.value ?? 0), 0);
  const blocked = !conditionRules(actor).canAct ? "Персонаж сейчас не может действовать." : !(range > 0) ? "Заполните ТЕЛ: дальность броска — ТЕЛ × 4 м."
    : !band || band.beyond ? `Слишком далеко: дальность броска ${range} м, предел — ${range * 2} м.` : (item.system.quantity ?? 0) < 1 ? "Бомбы закончились." : "";
  return { range, band, parts, total, dc: band?.dc ?? null, blocked };
}

const pendingThrows = new WeakMap();
/** Throws `item` at the targeted token or a clicked point. */
export function throwBomb(actor, item) {
  if (pendingThrows.has(actor)) return pendingThrows.get(actor);
  const work = (async () => {
    if (!actor?.isOwner || !isBomb(item)) return;
    if (!canvas?.ready) throw new Error("Откройте сцену, чтобы бросить бомбу.");
    const thrower = attackerToken(actor), scene = thrower.parent;
    const targets = Array.from(game.user.targets ?? []);
    if (targets.length > 1) throw new Error("Для броска оставьте одну цель или снимите цели и кликните точку.");
    const aim = targets.length ? tokenCenter(targets[0].document ?? targets[0]) : await pickPoint();
    const distance = Math.max(0, Math.round((metres(scene, tokenCenter(thrower), aim) - halfSize(scene, thrower)) * 10) / 10);
    return inventoryWrite(actor, async () => {
      const action = actionQuote(actor), quote = bombThrowQuote(actor, item, distance, action.penalty), profile = bombProfile(item);
      if (quote.blocked) throw new Error(quote.blocked);
      const roll = await evaluateRoll(`1d10wc + ${quote.total}`);
      const hit = roll.total > quote.dc;
      let point = aim, scatter = null;
      if (!hit) {
        const direction = await evaluateRoll("1d10"), far = await evaluateRoll("1d6");
        // The scatter pattern faces along the throw (from the thrower to the aim point), north = 0°.
        const from = tokenCenter(thrower), bearing = Math.atan2(aim.x - from.x, from.y - aim.y) * 180 / Math.PI;
        const offset = scatterOffset(direction.total, (aim.x === from.x && aim.y === from.y) ? thrower.rotation : bearing, 1), length = Math.hypot(offset.x, offset.y) || 1;
        const pixels = far.total / grid(scene).distance * grid(scene).size;
        point = { x: aim.x + offset.x / length * pixels, y: aim.y + offset.y / length * pixels };
        scatter = { direction: direction.total, metres: far.total };
      }
      const victims = await Promise.all(tokensInBlast(scene, point, profile.radius).map(async token => ({
        uuid: token.uuid, name: token.name,
        burning: profile.burning ? (await evaluateRoll("1d100")).total <= profile.burning : false,
        poisoned: profile.poison ? (await evaluateRoll("1d100")).total <= profile.poison : false })));
      canvas.ping?.(point);
      const effects = [profile.burning ? `горение ${profile.burning}%` : "", profile.poison ? `отравление ${profile.poison}%${profile.doublePoison ? " (двойной урон яда)" : ""}` : "",
        profile.blind ? `слепота ${profile.blind} раунд.` : "", profile.stunSave !== null ? `испытание УСТ ${signed(profile.stunSave)}, провал — дезориентация` : "",
        profile.freeze ? `замораживание ${profile.freeze} раунд. (Сила СЛ 18 или удар освобождают)` : "",
        profile.moonDust ? "видимость и осязаемость; регенерация и превращения подавлены на 20 раундов" : "",
        profile.dimeritium ? "зона без магии на 20 раундов" : "", profile.gas ? "горючий газ на 3 хода; пламя вызывает взрыв 5d6 и горение 75%" : ""].filter(Boolean);
      const content = `<section class="witcher-attack-chat witcher-bomb-card"><h3><i class="fa-solid fa-bomb"></i> ${esc(item.name)}</h3>
        <p>Бросок Атлетики <b>${roll.total}</b> против СЛ ${quote.dc} (${esc(quote.band.name)}, дальность ${quote.range} м): <strong>${hit ? "точно в цель" : "мимо"}</strong>.</p>
        ${scatter ? `<p>Разброс: ${scatter.direction} — <b>${SCATTER_WORDS[scatter.direction]}</b>, на ${scatter.metres} м от точки прицеливания.</p>` : ""}
        <p>Радиус ${profile.radius} м${profile.damage ? ` · урон ${esc(profile.damage)} — отдельный бросок на каждую часть тела, минус ПБ части, затем множитель зоны` : ""}${effects.length ? ` · ${esc(effects.join("; "))}` : ""}.</p>
        ${victims.length ? `<ul class="witcher-bomb-victims">${victims.map(v => `<li>${esc(v.name)}${v.burning ? " · загорается" : ""}${v.poisoned ? " · отравлен" : ""}</li>`).join("")}</ul>` : "<p>В радиусе никого нет.</p>"}
        ${actionNote(action)}
        ${victims.length || profile.dimeritium || profile.gas ? `<button type="button" data-bomb-apply><i class="fa-solid fa-burst"></i> ${profile.gas ? "Создать облако" : "Применить взрыв"}</button><small>Урон и эффекты применяет мастер.</small>` : ""}</section>`;
      const message = await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), rolls: [roll], content,
        flags: { [SYSTEM_ID]: { skipLuck: true, bomb: { name: item.name, ruleId: item.system.ruleId ?? "", profile, victims, sceneUuid: scene.uuid, point, aim, thrower: thrower.uuid, applied: false } } } });
      if (!message) return;
      const quantity = (item.system.quantity ?? 1) - 1;
      await actor.update({ ...actionUpdate(actor, action), items: [{ _id: item.id, "system.quantity": Math.max(0, quantity) }] });
      return message;
    });
  })();
  pendingThrows.set(actor, work);
  const clear = () => { if (pendingThrows.get(actor) === work) pendingThrows.delete(actor); };
  work.then(clear, clear);
  return work;
}

/** Scene devices and ignited gas reuse the same per-part damage and condition application. */
export async function postDeviceBlast(actor, scene, point, { name, profile, messageOptions = {} }) {
  const victims = await Promise.all(tokensInBlast(scene, point, profile.radius).map(async token => ({ uuid: token.uuid, name: token.name,
    burning: profile.burning ? (await evaluateRoll("1d100")).total <= profile.burning : false,
    poisoned: profile.poison ? (await evaluateRoll("1d100")).total <= profile.poison : false,
    bleeding: profile.bleeding ? (await evaluateRoll("1d100")).total <= profile.bleeding : false })));
  return foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), whisper:[...(messageOptions.whisper??[])], blind:Boolean(messageOptions.blind),
    content: `<section class="witcher-bomb-card"><h3>${esc(name)}</h3><p>Радиус ${profile.radius} м. ${victims.map(victim=>esc(victim.name)).join(", ") || "В радиусе никого нет."}</p><button type="button" data-bomb-apply>Применить взрыв</button></section>`,
    flags: { [SYSTEM_ID]: { skipLuck: true, bomb: { name, profile, victims, sceneUuid: scene.uuid, point, applied: false } } } });
}

/** A blast at a scene point that the GM applies like a bomb (used by magical fumbles: exploding focuses). */
export async function postBlast(actor, scene, point, { name, radius, damage, intro = "" }) {
  const profile = { radius, damage, burning: 0, poison: 0, doublePoison: false, blind: 0, stunSave: null, freeze: 0,
    traits: { types: [], piercing: "none", silver: false, silverDice: "", nonLethal: false } };
  const victims = tokensInBlast(scene, point, radius).map(token => ({ uuid: token.uuid, name: token.name, burning: false, poisoned: false }));
  canvas?.ping?.(point);
  const content = `<section class="witcher-attack-chat witcher-bomb-card"><h3><i class="fa-solid fa-burst"></i> ${esc(name)}</h3>${intro}
    <p>Радиус ${radius} м · урон ${esc(damage)} — отдельный бросок на каждую часть тела, минус ПБ части, затем множитель зоны.</p>
    ${victims.length ? `<ul class="witcher-bomb-victims">${victims.map(v => `<li>${esc(v.name)}</li>`).join("")}</ul><button type="button" data-bomb-apply><i class="fa-solid fa-burst"></i> Применить взрыв</button><small>Урон применяет мастер.</small>` : "<p>В радиусе никого нет.</p>"}</section>`;
  return foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), content,
    flags: { [SYSTEM_ID]: { skipLuck: true, bomb: { name, profile, victims, applied: false } } } });
}

/** Damage of one blast on one actor: a separate roll per body part, minus its SP, then the location multiplier. */
export function blastDamage(actor, rolls, traits) {
  const monster = monsterResistant(actor), vulnerable = fireVulnerable(actor);
  const parts = burningParts(actor).map(id => {
    const base = rolls[id] ?? 0, location = ATTACK_LOCATIONS.find(entry => entry.id === id);
    const armor = armorAt(actor, id), result = resolveDamage({ base, location: id, multiplier: location?.multiplier ?? 1, traits, armor, monster, vulnerableToFire: vulnerable });
    return { id, name: location?.name ?? id, roll: base, sp: armor.sp, multiplier: location?.multiplier ?? 1, total: result.total, ablate: result.ablate };
  });
  // A piece of armor covering several parts wears once per blast.
  return { total: parts.reduce((sum, part) => sum + part.total, 0), parts, ablate: [...new Set(parts.flatMap(part => part.ablate))] };
}
async function partRolls(actor, formula) {
  if (!formula) return {};
  const out = {};
  for (const id of burningParts(actor)) out[id] = (await evaluateRoll(formula)).total;
  return out;
}

const timedCondition = (actor, id, rounds, extra = {}) => {
  const source = conditionSource(CONDITION_BY_ID[id], text => game.i18n.localize(text)); delete source._id;
  return foundry.utils.mergeObject(source, { ...(rounds ? { start: fullTurnStart(actor), duration: { value: rounds, units: "rounds", expiry: "turnEnd", expired: false } } : {}), ...extra });
};

/** GM: damage and effects on everyone in the blast. */
const pendingBlasts = new WeakMap();
export function applyBlast(message) {
  if (pendingBlasts.has(message)) return pendingBlasts.get(message);
  const work = applyBlastNow(message); pendingBlasts.set(message, work);
  const clear = () => pendingBlasts.delete(message); work.then(clear, clear); return work;
}
async function applyBlastNow(message) {
  const data = structuredClone(message.flags[SYSTEM_ID]?.bomb);
  if (!game.user.isGM || !data || data.applied) return;
  const { sufferDamage } = await import("./attack-exchange.mjs");
  const lines = [];
  if (data.profile.gas) {
    const { createDragonCloud } = await import("./dragon-clouds.mjs");
    await createDragonCloud(fromUuidSync(data.sceneUuid), data.point, message);
    await message.update({ [`flags.${SYSTEM_ID}.bomb.applied`]: true });
    return;
  }
  if (data.profile.dimeritium) {
    const scene = fromUuidSync(data.sceneUuid);
    if (!scene) throw new Error("Сцена взрыва недоступна.");
    await createSpiritZone(scene, data.point, { kind: "dimeritium", radius: data.profile.radius, rounds: data.profile.dimeritium, sourceUuid: message.uuid });
    lines.push("<li>Создана зона двимерита: магия внутри запрещена на 20 раундов.</li>");
  }
  for (const victim of data.victims) {
    if (victim.applied) continue;
    const token = fromUuidSync(victim.uuid), actor = token?.actor;
    // Older cards may list a loot pile caught in the circle: it has nothing to hurt.
    if (!blastable(actor)) { victim.applied = true; continue; }
    if (data.profile.damage) {
      const { destroyNoonCopy } = await import("./creature-actions-dance.mjs");
      if (await destroyNoonCopy(token)) {
        victim.applied = true;victim.copyDestroyed = true;
        await message.update({ [`flags.${SYSTEM_ID}.bomb.victims`]: data.victims });
        lines.push(`<li><b>${esc(actor.name)}</b>: копия полуденницы уничтожена попаданием.</li>`);
        continue;
      }
    }
    const result = victim.result ?? blastDamage(actor, await partRolls(actor, data.profile.damage), data.profile.traits), notes = victim.notes ?? [];
    const before = victim.before ?? actor.system.health.value;
    const effects = victim.effects ?? [];
    if (!victim.result) {
    if (data.profile.moonDust) {
      effects.push(spiritSuppressionSource(actor, { kind: "moon-dust", rounds: data.profile.moonDust }));
      notes.push("Лунная пыль: видимость и осязаемость, без регенерации и превращений — 20 раундов");
    }
    if (victim.burning) { effects.push(timedCondition(actor, "burning", 0)); notes.push("горит"); }
    if (victim.poisoned) { effects.push(timedCondition(actor, "poisoned", 0, data.profile.doublePoison ? { name: `Отравление: ${data.name}`, flags: { [SYSTEM_ID]: { condition: { doubleDamage: true } } } } : {})); notes.push(data.profile.doublePoison ? "отравлен (двойной урон)" : "отравлен"); }
    if (data.profile.blind) { effects.push(timedCondition(actor, "blinded", data.profile.blind)); notes.push(`ослеплён на ${data.profile.blind} раунд.`); }
    if (victim.bleeding && result.total > 0) { effects.push(timedCondition(actor, "bleeding", 0)); notes.push("кровотечение"); }
    if (data.profile.freeze) { effects.push(experimentalEffect(actor, "freeze")); notes.push(`заморожен на ${data.profile.freeze} раунд.; Сила СЛ 18`); }
    if (data.profile.marker) { effects.push(experimentalEffect(actor, "marker")); notes.push("метка на сутки: +5 к обнаружению и выслеживанию"); }
    if (data.profile.fury) {
      const base = skillValue(actor.system, "endurance").total, roll = await evaluateRoll(`1d10wc + ${base}`);
      notes.push(`Стойкость ${roll.total} против СЛ 18`);
      if (roll.total < 18) { effects.push(experimentalEffect(actor, "fury")); notes.push("атакует ближайшее существо"); }
    }
    if (data.profile.stunSave !== null) {
      const stun = actor.system.statistics.stun ?? 0, save = await evaluateRoll("1d10"), target = stun + data.profile.stunSave;
      if (save.total < target) notes.push(`испытание УСТ ${save.total} (нужно меньше ${target}): устоял`);
      else { effects.push(timedCondition(actor, "stunned", 0)); notes.push(`испытание УСТ ${save.total} (нужно меньше ${target}): дезориентирован`); }
    }
    Object.assign(victim,{result,before,notes,effects});
    await message.update({ [`flags.${SYSTEM_ID}.bomb.victims`]: data.victims });
    }
    // Persist the damage phase separately: retrying a failed condition write must not deal the blast again.
    if (!victim.damageApplied) {
      victim.worn = result.total || result.ablate.length ? await sufferDamage(actor, result) : [];
      victim.damageApplied = true;
      await message.update({ [`flags.${SYSTEM_ID}.bomb.victims`]: data.victims });
    }
    const key = `${message.uuid ?? message.id}:${victim.uuid}`;
    const missing = effects.map((effect,index)=>({ ...effect, flags: { ...effect.flags, [SYSTEM_ID]: { ...effect.flags?.[SYSTEM_ID], blastEffect: `${key}:${index}` } } }))
      .filter(effect=>!Array.from(actor.effects).some(existing=>existing.flags?.[SYSTEM_ID]?.blastEffect===effect.flags[SYSTEM_ID].blastEffect));
    if (data.profile.moonDust && missing.length) {
      const previous = Array.from(actor.effects).filter(effect => effect.flags?.[SYSTEM_ID]?.creatureSuppression?.kind === "moon-dust" && !effect.flags?.[SYSTEM_ID]?.blastEffect?.startsWith(`${key}:`));
      if (previous.length) await actor.deleteEmbeddedDocuments("ActiveEffect", previous.map(effect=>effect.id));
    }
    if (missing.length) await actor.createEmbeddedDocuments("ActiveEffect", missing);
    const worn = victim.worn ?? [];
    victim.applied = true;
    await message.update({ [`flags.${SYSTEM_ID}.bomb.victims`]: data.victims });
    lines.push(`<li><b>${esc(actor.name)}</b>${result.total ? `: −${result.total} ПЗ (${before} → ${before - result.total}) — ${result.parts.map(part => `${esc(part.name)} ${part.total} (бросок ${part.roll}${part.sp ? `, ПБ ${part.sp}` : ""}${part.multiplier !== 1 ? `, ×${part.multiplier === 0.5 ? "½" : part.multiplier}` : ""})`).join(", ")}` : data.profile.damage ? ": броня поглотила урон" : ""}${notes.length ? `; ${esc(notes.join("; "))}` : ""}${worn.length ? `<br><small>Износ брони: ${esc(worn.join("; "))}</small>` : ""}</li>`);
  }
  await message.update({ [`flags.${SYSTEM_ID}.bomb.applied`]: true });
  if (data.profile.traits.types.includes("elemental") && data.profile.damage && data.sceneUuid) {
    const { igniteDragonClouds } = await import("./dragon-clouds.mjs");
    await igniteDragonClouds(fromUuidSync(data.sceneUuid), data.point, { radius: data.profile.radius });
  }
  return foundry.documents.ChatMessage.create({ speaker: message.speaker, whisper:[...(message.whisper??[])], blind:Boolean(message.blind), flags: { [SYSTEM_ID]: { skipLuck: true } },
    content: `<section class="witcher-attack-chat"><h3><i class="fa-solid fa-burst"></i> ${esc(data.name)} · взрыв</h3><ul class="witcher-bomb-victims">${lines.join("")}</ul></section>` });
}

let outline = null;
function hideBlast() { if (outline && !outline.destroyed) outline.destroy(); outline = null; }
/** The blast circle on the map (and, on request, the camera taken there with a ping). */
function showBlast(data, { pan = false } = {}) {
  hideBlast();
  if (!canvas?.ready || (data.sceneUuid && data.sceneUuid !== canvas.scene?.uuid)) {
    if (pan) ui.notifications.info("Взрыв был на другой сцене.");
    return;
  }
  const px = (data.profile?.radius ?? 4) / canvas.dimensions.distance * canvas.grid.size, g = new PIXI.Graphics();
  g.lineStyle(4, 0xff7a2a, 0.9).beginFill(0xff7a2a, 0.12).drawCircle(data.point.x, data.point.y, px).endFill();
  if (data.aim && Math.hypot(data.aim.x - data.point.x, data.aim.y - data.point.y) > 4) {
    // A miss: from the aim point (a cross) to where it landed.
    const { x, y } = data.aim, k = canvas.grid.size * 0.2;
    g.lineStyle(3, 0xffffff, 0.8).moveTo(x - k, y - k).lineTo(x + k, y + k).moveTo(x + k, y - k).lineTo(x - k, y + k);
    g.lineStyle(2, 0xffffff, 0.6).moveTo(x, y).lineTo(data.point.x, data.point.y);
  }
  g.eventMode = "none";
  canvas.interface.addChild(g);
  outline = g;
  if (pan) {
    canvas.animatePan({ x: data.point.x, y: data.point.y, duration: 450 });
    canvas.ping?.(data.point);
    setTimeout(() => { if (outline === g) hideBlast(); }, 3500);
  }
}

export function registerBombs() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const data = message.flags[SYSTEM_ID]?.bomb;
    if (data?.point && !html.querySelector("[data-bomb-locate]")) {
      // Everyone can find where it fell: the camera goes there and pings; hovering the card outlines the blast.
      const locate = document.createElement("button");
      locate.type = "button";
      locate.dataset.bombLocate = "";
      locate.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Показать место';
      locate.addEventListener("click", () => showBlast(data, { pan: true }));
      (html.querySelector(".witcher-bomb-card") ?? html.querySelector(".message-content"))?.append(locate);
      html.addEventListener("mouseenter", () => showBlast(data));
      html.addEventListener("mouseleave", hideBlast);
    }
    for (const button of html.querySelectorAll("[data-bomb-apply]")) {
      const data = message.flags[SYSTEM_ID]?.bomb;
      button.disabled = !game.user.isGM || Boolean(data?.applied);
      if (data?.applied) button.innerHTML = '<i class="fa-solid fa-check"></i> Взрыв применён';
      button.addEventListener("click", async () => { button.disabled = true; try { await applyBlast(message); } catch (error) { ui.notifications.error(error.message); button.disabled = false; } });
    }
  });
}
