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

// Core p.165 «Бомбы и ловушки»: a bomb is thrown with Athletics (range BODY × 4 m) at a point; a failed
// throw lands per the scatter table (1d10 direction, 1d6 m). Everyone in the radius takes the damage
// on every body part (armor of each part absorbs it, no location multipliers) plus the bomb's effect.
export const isBomb = item => item?.type === "equipment" && String(item.system.ruleId ?? "").startsWith("bomb.");

/** What a bomb does, read from its properties line (e.g. «Бомба; Радиус 4 м; Урон 7d6; Горение (25%)»). */
export function bombProfile(item) {
  const text = `${item.system.properties ?? ""}; ${String(item.system.description ?? "").replace(/<[^>]+>/g, " ")}`;
  const number = (pattern, fallback = 0) => { const found = text.match(pattern); return found ? Number(found[1].replace(",", ".").replace("−", "-")) : fallback; };
  return {
    radius: number(/Радиус\s+(\d+(?:[.,]\d+)?)\s*м/u, 4),
    damage: item.system.properties?.match(/Урон\s+(\d+d\d+(?:\s*[+−-]\s*\d+)?)/u)?.[1]?.replace("−", "-") ?? "",
    burning: number(/Горение\s*\((\d+)%\)/u),
    poison: number(/Отравление\s*\((\d+)%\)/u),
    doublePoison: /Двойной урон яда/u.test(text),
    blind: number(/Слепота\s*—\s*(\d+)\s*раунд/u),
    stunSave: /Испытание УСТ/u.test(item.system.properties ?? "") ? number(/Испытание УСТ\s*([−-]?\d+)/u) : null,
    freeze: /Замораживание/u.test(item.system.properties ?? "") ? number(/длится\s+(\d+)\s+раунд/u, 8) : 0,
    traits: weaponDamageTraits(item.system)
  };
}

const grid = scene => scene.grid;
const metres = (scene, a, b) => grid(scene).measurePath?.([a, b])?.distance ?? Math.hypot(b.x - a.x, b.y - a.y) / grid(scene).size * grid(scene).distance;
const halfSize = (scene, token) => Math.max(token.width ?? 1, token.height ?? 1) / 2 * grid(scene).distance;

/** Tokens whose body is inside the blast circle. */
export function tokensInBlast(scene, point, radius) {
  return Array.from(scene.tokens).filter(token => token.actor && metres(scene, point, tokenCenter(token)) - halfSize(scene, token) <= radius);
}

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
      const roll = await new foundry.dice.Roll(`1d10wc + ${quote.total}`).evaluate();
      const hit = roll.total > quote.dc;
      let point = aim, scatter = null;
      if (!hit) {
        const direction = await new foundry.dice.Roll("1d10").evaluate(), far = await new foundry.dice.Roll("1d6").evaluate();
        // The scatter pattern faces along the throw (from the thrower to the aim point), north = 0°.
        const from = tokenCenter(thrower), bearing = Math.atan2(aim.x - from.x, from.y - aim.y) * 180 / Math.PI;
        const offset = scatterOffset(direction.total, (aim.x === from.x && aim.y === from.y) ? thrower.rotation : bearing, 1), length = Math.hypot(offset.x, offset.y) || 1;
        const pixels = far.total / grid(scene).distance * grid(scene).size;
        point = { x: aim.x + offset.x / length * pixels, y: aim.y + offset.y / length * pixels };
        scatter = { direction: direction.total, metres: far.total };
      }
      const damage = profile.damage ? await new foundry.dice.Roll(profile.damage).evaluate() : null;
      const victims = await Promise.all(tokensInBlast(scene, point, profile.radius).map(async token => ({
        uuid: token.uuid, name: token.name,
        burning: profile.burning ? (await new foundry.dice.Roll("1d100").evaluate()).total <= profile.burning : false,
        poisoned: profile.poison ? (await new foundry.dice.Roll("1d100").evaluate()).total <= profile.poison : false })));
      canvas.ping?.(point);
      const effects = [profile.burning ? `горение ${profile.burning}%` : "", profile.poison ? `отравление ${profile.poison}%${profile.doublePoison ? " (двойной урон яда)" : ""}` : "",
        profile.blind ? `слепота ${profile.blind} раунд.` : "", profile.stunSave !== null ? `испытание УСТ ${signed(profile.stunSave)}, провал — дезориентация` : "",
        profile.freeze ? `замораживание ${profile.freeze} раунд. (Сила СЛ 18 или удар освобождают)` : ""].filter(Boolean);
      const content = `<section class="witcher-attack-chat witcher-bomb-card"><h3><i class="fa-solid fa-bomb"></i> ${esc(item.name)}</h3>
        <p>Бросок Атлетики <b>${roll.total}</b> против СЛ ${quote.dc} (${esc(quote.band.name)}, дальность ${quote.range} м): <strong>${hit ? "точно в цель" : "мимо"}</strong>.</p>
        ${scatter ? `<p>Разброс: направление ${scatter.direction} по таблице, ${scatter.metres} м от точки прицеливания.</p>` : ""}
        <p>Радиус ${profile.radius} м${damage ? ` · урон <b>${damage.total}</b> (${esc(profile.damage)}) по каждой части тела, минус ПБ этой части` : ""}${effects.length ? ` · ${esc(effects.join("; "))}` : ""}.</p>
        ${victims.length ? `<ul class="witcher-bomb-victims">${victims.map(v => `<li>${esc(v.name)}${v.burning ? " · загорается" : ""}${v.poisoned ? " · отравлен" : ""}</li>`).join("")}</ul>` : "<p>В радиусе никого нет.</p>"}
        ${actionNote(action)}
        ${victims.length ? `<button type="button" data-bomb-apply><i class="fa-solid fa-burst"></i> Применить взрыв</button><small>Урон и эффекты применяет мастер.</small>` : ""}</section>`;
      const message = await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), rolls: [roll, ...(damage ? [damage] : [])], content,
        flags: { [SYSTEM_ID]: { skipLuck: true, bomb: { name: item.name, profile: { ...profile, traits: profile.traits }, damage: damage?.total ?? 0, victims, applied: false } } } });
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

/** Damage of one blast on one actor: every body part takes the roll minus its own armor. */
export function blastDamage(actor, damage, traits) {
  if (!damage) return { total: 0, parts: [], ablate: [] };
  const monster = monsterResistant(actor), vulnerable = fireVulnerable(actor);
  const parts = burningParts(actor).map(id => {
    const armor = armorAt(actor, id), result = resolveDamage({ base: damage, location: id, multiplier: 1, traits, armor, monster, vulnerableToFire: vulnerable });
    return { id, name: ATTACK_LOCATIONS.find(entry => entry.id === id)?.name ?? id, sp: armor.sp, total: result.total, ablate: result.ablate };
  });
  // A piece of armor covering several parts wears once per blast.
  return { total: parts.reduce((sum, part) => sum + part.total, 0), parts, ablate: [...new Set(parts.flatMap(part => part.ablate))] };
}

const timedCondition = (actor, id, rounds, extra = {}) => {
  const source = conditionSource(CONDITION_BY_ID[id], text => game.i18n.localize(text)); delete source._id;
  return foundry.utils.mergeObject(source, { ...(rounds ? { start: fullTurnStart(actor), duration: { value: rounds, units: "rounds", expiry: "turnEnd", expired: false } } : {}), ...extra });
};

/** GM: damage and effects on everyone in the blast. */
export async function applyBlast(message) {
  const data = message.flags[SYSTEM_ID]?.bomb;
  if (!game.user.isGM || !data || data.applied) return;
  await message.update({ [`flags.${SYSTEM_ID}.bomb.applied`]: true });
  const { sufferDamage } = await import("./attack-exchange.mjs");
  const lines = [];
  for (const victim of data.victims) {
    const actor = fromUuidSync(victim.uuid)?.actor;
    if (!actor) continue;
    const result = blastDamage(actor, data.damage, data.profile.traits), notes = [];
    const before = actor.system.health.value;
    const worn = result.total || result.ablate.length ? await sufferDamage(actor, result) : [];
    const effects = [];
    if (victim.burning) { effects.push(timedCondition(actor, "burning", 0)); notes.push("горит"); }
    if (victim.poisoned) { effects.push(timedCondition(actor, "poisoned", 0, data.profile.doublePoison ? { name: `Отравление: ${data.name}`, flags: { [SYSTEM_ID]: { condition: { doubleDamage: true } } } } : {})); notes.push(data.profile.doublePoison ? "отравлен (двойной урон)" : "отравлен"); }
    if (data.profile.blind) { effects.push(timedCondition(actor, "blinded", data.profile.blind)); notes.push(`ослеплён на ${data.profile.blind} раунд.`); }
    if (data.profile.freeze) { effects.push(timedCondition(actor, "frozen", data.profile.freeze)); notes.push(`заморожен на ${data.profile.freeze} раунд.`); }
    if (data.profile.stunSave !== null) {
      const stun = actor.system.statistics.stun ?? 0, save = await new foundry.dice.Roll("1d10").evaluate(), target = stun + data.profile.stunSave;
      if (save.total < target) notes.push(`испытание УСТ ${save.total} (нужно меньше ${target}): устоял`);
      else { effects.push(timedCondition(actor, "stunned", 0)); notes.push(`испытание УСТ ${save.total} (нужно меньше ${target}): дезориентирован`); }
    }
    if (effects.length) await actor.createEmbeddedDocuments("ActiveEffect", effects);
    lines.push(`<li><b>${esc(actor.name)}</b>${result.total ? `: −${result.total} ПЗ (${before} → ${before - result.total}) — ${result.parts.map(part => `${esc(part.name)} ${part.total}${part.sp ? ` (ПБ ${part.sp})` : ""}`).join(", ")}` : data.damage ? ": броня поглотила урон" : ""}${notes.length ? `; ${esc(notes.join("; "))}` : ""}${worn.length ? `<br><small>Износ брони: ${esc(worn.join("; "))}</small>` : ""}</li>`);
  }
  return foundry.documents.ChatMessage.create({ speaker: message.speaker, flags: { [SYSTEM_ID]: { skipLuck: true } },
    content: `<section class="witcher-attack-chat"><h3><i class="fa-solid fa-burst"></i> ${esc(data.name)} · взрыв</h3><ul class="witcher-bomb-victims">${lines.join("")}</ul></section>` });
}

export function registerBombs() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll("[data-bomb-apply]")) {
      const data = message.flags[SYSTEM_ID]?.bomb;
      button.disabled = !game.user.isGM || Boolean(data?.applied);
      if (data?.applied) button.innerHTML = '<i class="fa-solid fa-check"></i> Взрыв применён';
      button.addEventListener("click", async () => { button.disabled = true; try { await applyBlast(message); } catch (error) { ui.notifications.error(error.message); button.disabled = false; } });
    }
  });
}
