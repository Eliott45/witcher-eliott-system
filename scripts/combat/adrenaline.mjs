import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { installedRune } from "../data/rune-glyphs.mjs";
import { hasDose } from "../data/consumables.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { creatureHasInfiniteStamina } from "../data/creature-modes.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

// Optional core p.175. Kept separate from Full Moon and switched off in a new world.
export const ADRENALINE_COST = 10;
const path = `flags.${SYSTEM_ID}.adrenaline`;
const blank = () => ({ dice: 0, temporaryHP: 0, emergencyHP: 0, damageDice: 0, combatId: "", events: [] });
const enabled = () => globalThis.game?.settings?.get(SYSTEM_ID, "adrenalineRules") === true;
const fight = () => globalThis.game?.combat?.started ? game.combat.id : "";
export function adrenalineState(actor) {
  const state = actor.flags?.[SYSTEM_ID]?.adrenaline;
  return state?.combatId === fight() && fight() ? { ...blank(), ...state } : blank();
}
export function adrenalineContext(actor) {
  const state = adrenalineState(actor), max = Math.max(0, Math.trunc(actor.system.statistics?.effective?.body ?? actor.system.attributes?.body ?? 0));
  return { ...state, enabled: enabled(), visible: enabled(), max, canUse: enabled() && Boolean(fight()) && actor.isOwner && !actor.system.statistics?.dead && state.dice > 0,
    staminaPerDie: ADRENALINE_COST };
}
const save = (actor, state) => actor.update({ [path]: state });

/** Call on the attacker once a real critical wound is applied. Repeated application of its card is idempotent. */
export async function awardAdrenaline(actor, weapon = null, { eventId = "" } = {}) {
  if (!actor?.isOwner || !enabled() || !fight()) return 0;
  return inventoryWrite(actor, async () => {
    const state = adrenalineState(actor), max = adrenalineContext(actor).max;
    if (eventId && state.events.includes(eventId)) return 0;
    const gain = Math.min(Math.max(0, max - state.dice), 1 + Number(installedRune(weapon, "perun")) + Number(hasDose(actor, "potion.maribor")));
    await save(actor, { ...state, combatId: fight(), dice: state.dice + gain, events: eventId ? [...state.events, eventId] : state.events });
    return gain;
  });
}

/** Pending dice were paid/declared before the attack. Snapshot this number into the first strike only. */
export const adrenalineDamage = actor => enabled() ? adrenalineState(actor).damageDice : 0;
/** Caller already serializes its action; do not open a nested inventory queue. */
export async function consumeAdrenalineDamage(actor) {
  const state = adrenalineState(actor), dice = adrenalineDamage(actor);
  if (dice) await save(actor, { ...state, damageDice: 0 });
  return dice;
}

export function adrenalineSpendQuote(actor, count, mode) {
  const state = adrenalineState(actor);
  if (!enabled() || !fight()) throw new Error("Правило адреналина отключено или бой не начат.");
  if (!actor.isOwner) throw new Error("Нет доступа к персонажу.");
  if (actor.system.statistics?.dead) throw new Error("Адреналин не воскрешает погибшего персонажа.");
  if (!["damage", "health"].includes(mode) || !Number.isInteger(count) || count < 1 || count > state.dice) throw new Error("Укажите доступное число костей адреналина.");
  if (mode === "damage" && state.damageDice) throw new Error("Кости для следующей атаки уже объявлены.");
  const stamina = creatureHasInfiniteStamina(actor) ? 0 : count * ADRENALINE_COST;
  if (actor.system.stamina.value < stamina) throw new Error(`Недостаточно Выносливости: нужно ${stamina}.`);
  return { state, count, mode, stamina };
}

/** Declare before an action; health may also be used immediately after going below zero. */
export function spendAdrenaline(actor, count, mode) {
  return inventoryWrite(actor, async () => {
    const quote = adrenalineSpendQuote(actor, count, mode), state = { ...quote.state, combatId: fight(), dice: quote.state.dice - count };
    let roll = null, recovered = 0;
    if (mode === "health") {
      roll = await evaluateRoll(`${count}d6`,{ allowInteractive: game.settings.get("core", "messageMode") !== "blind" });
      // A separate pool handles ordinary temporary HP. At <=0 it must also lift the actor out of Death State.
      recovered = Math.min(roll.total, Math.max(0, 1 - actor.system.health.value));
      state.emergencyHP += recovered;
      state.temporaryHP += roll.total - recovered;
    } else state.damageDice = count;
    const data = { speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: `<p>Адреналин · ${esc(actor.name)}: ${count}d6 ${mode === "health" ? "временных ПЗ до конца боя" : "к урону следующего удара"}; ${quote.stamina} ВЫН.</p>`, flags: { [SYSTEM_ID]: { skipLuck: true } } };
    const messageMode = game.settings.get("core", "messageMode");
    const message = roll ? await roll.toMessage(data, { messageMode })
      : await foundry.documents.ChatMessage.create(foundry.documents.ChatMessage.applyMode(data, messageMode));
    if (!message) throw new Error("Сообщение не создано; адреналин не потрачен.");
    await actor.update({ [path]: state, ...(quote.stamina ? { "system.stamina.value": actor.system.stamina.value - quote.stamina } : {}),
      ...(recovered ? { "system.health.value": actor.system.health.value + recovered } : {}) });
    return { ...quote, roll, recovered, message };
  });
}

/** Pure plan lets damage, its receipt and temporary HP settle in one Actor write. */
export function adrenalineAbsorptionPlan(actor, amount) {
  const state = adrenalineState(actor), damage = Math.max(0, amount), absorbed = Math.min(state.temporaryHP, damage);
  const emergencySpent = Math.min(state.emergencyHP, damage - absorbed);
  return { absorbed, remaining: damage - absorbed, actorUpdate: absorbed || emergencySpent ? { [path]: { ...state,
    temporaryHP: state.temporaryHP - absorbed, emergencyHP: state.emergencyHP - emergencySpent } } : {} };
}
/** Run after Full Moon, before applying remaining lethal HP damage. Damage still reaches emergency HP normally. */
export async function absorbAdrenalineDamage(actor, amount) {
  const plan=adrenalineAbsorptionPlan(actor,amount);
  if(Object.keys(plan.actorUpdate).length)await actor.update(plan.actorUpdate);
  return {absorbed:plan.absorbed,remaining:plan.remaining};
}

export async function endAdrenaline(actor, combatId) {
  const state = actor.flags?.[SYSTEM_ID]?.adrenaline;
  if (!state || state.combatId !== combatId || !actor.isOwner) return;
  await actor.update({ [path]: blank(), ...(state.emergencyHP > 0 ? { "system.health.value": actor.system.health.value - state.emergencyHP } : {}) });
}

export async function adrenalineDialog(actor) {
  const state = adrenalineContext(actor);
  if (!state.canUse) throw new Error("Нет доступных костей адреналина в текущем бою.");
  const result = await foundry.applications.api.DialogV2.prompt({ window: { title: "Адреналин" }, rejectClose: false,
    content: `<p>Кости: ${state.dice} / ${state.max}. Временные ПЗ: ${state.temporaryHP + state.emergencyHP}.</p><p>Каждая кость стоит 10 ВЫН. Бонус урона объявляется до атаки и действует на один удар. Временные ПЗ и оставшиеся кости исчезнут в конце боя.</p><label>Кости<input name="count" type="number" min="1" max="${state.dice}" step="1" value="1"></label><label>Применение<select name="mode"><option value="health">Временные ПЗ</option><option value="damage" ${state.damageDice ? "disabled" : ""}>Урон следующего удара</option></select></label>`,
    ok: { label: "Потратить", callback: (_event, button) => ({ count: Number(button.form.elements.count.value), mode: button.form.elements.mode.value }) } });
  if (result) return spendAdrenaline(actor, result.count, result.mode);
}

export function registerAdrenaline() {
  game.settings.register(SYSTEM_ID, "adrenalineRules", { name: "WITCHER.Settings.Adrenaline", hint: "WITCHER.Settings.AdrenalineHint", scope: "world", config: true, type: Boolean, default: false });
  const end = async combat => {
    if (!game.user.isActiveGM) return;
    const actors = new Map(Array.from(combat.combatants ?? []).filter(row => row.actor).map(row => [row.actor.uuid, row.actor]));
    for (const actor of game.actors ?? []) if (actor.flags?.[SYSTEM_ID]?.adrenaline?.combatId === combat.id) actors.set(actor.uuid, actor);
    for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? [])
      if (token.actor?.flags?.[SYSTEM_ID]?.adrenaline?.combatId === combat.id) actors.set(token.actor.uuid, token.actor);
    for (const actor of actors.values()) await endAdrenaline(actor, combat.id);
  };
  Hooks.on("deleteCombat", combat => end(combat).catch(console.error));
  Hooks.on("updateCombat", (combat, change) => { if (Object.hasOwn(change, "round") && !combat.started) end(combat).catch(console.error); });
}
