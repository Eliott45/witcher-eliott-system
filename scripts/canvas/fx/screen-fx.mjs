import { SYSTEM_ID } from "../../config.mjs";
import { fxEnabled, diceLanded } from "./fx-core.mjs";

// Effects on the screen rather than the map: a spinning die on the sheet, a sheet that flares on a critical or cracks
// on a fumble, the red edges of a wounded hero, banners and the trembling medallion.

const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const flagsOf = message => message?.flags?.[SYSTEM_ID] ?? {};

/* -------------------------------------------- */
/*  Dice on the sheets                          */
/* -------------------------------------------- */

/** Any d10 button on a character or creature sheet spins when pressed. */
function spinDice(event) {
  if (!fxEnabled() || still()) return;
  const button = event.target.closest?.(".witcher-character-layout button, .witcher-npc-layout button");
  const icon = button?.querySelector(".fa-dice-d10");
  if (!icon || button.disabled) return;
  icon.classList.remove("witcher-dice-spin");
  void icon.offsetWidth;
  icon.classList.add("witcher-dice-spin");
  icon.addEventListener("animationend", () => icon.classList.remove("witcher-dice-spin"), { once: true });
}

/**
 * The first d10 of a check decides it: 10 explodes into a critical, 1 into a fumble (core p.51). Only checks count,
 * the dice that carry the critical chain (`1d10wc`); a hit location or a Stun save rolled on a d10 means nothing here.
 */
export function naturalOf(message) {
  for (const roll of message?.rolls ?? []) {
    const die = roll.dice?.find(term => term.faces === 10 && (term.modifiers ?? []).some(modifier => String(modifier).startsWith("wc")));
    const result = die?.results?.find(entry => entry.active !== false)?.result;
    if (result === 10) return "crit";
    if (result === 1) return "fumble";
    if (die) return null;
  }
  return null;
}

/** The sheet of the roller flares gold or cracks red once the dice land. */
async function flareSheet(message) {
  if (!fxEnabled() || message.isContentVisible === false || !message.rolls?.length) return;
  const kind = naturalOf(message), sheet = message.speakerActor?.sheet;
  if (!kind || !sheet?.rendered) return;
  await diceLanded(message);
  flashSheet(sheet, kind);
}

/** Flood a sheet with gold (`crit`) or crack it red (`fumble`) for a moment. */
export function flashSheet(sheet, kind) {
  const content = sheet?.element?.querySelector(".window-content");
  if (!content) return;
  const flash = document.createElement("div");
  flash.className = `witcher-roll-flash is-${kind}`;
  flash.setAttribute("aria-hidden", "true");
  flash.innerHTML = kind === "crit" ? "<span>Критический успех!</span>"
    : `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 0 46 14 52 22 44 36 49 44 40 58 47 66 38 82 42 100M46 14 34 20 28 31M44 36 58 41 66 52M40 58 27 62 18 74M47 66 61 71 70 86M52 22 63 18 72 8"/></svg><span>Провал</span>`;
  content.append(flash);
  setTimeout(() => flash.remove(), 1900);
}

/* -------------------------------------------- */
/*  Wounds on the screen                        */
/* -------------------------------------------- */

let vignette = null, lastHealth = null, lastActorId = null;
const heroOf = () => game.user.isGM ? null : game.user.character;

function vignetteElement() {
  if (vignette?.isConnected) return vignette;
  vignette = document.createElement("div");
  vignette.id = "witcher-wound-vignette";
  vignette.setAttribute("aria-hidden", "true");
  document.body.append(vignette);
  return vignette;
}

/** Red edges for the player's own character: faint while wounded, a heartbeat while dying, grey when dead. */
export function syncVignette({ hit = false } = {}) {
  const actor = heroOf(), element = vignetteElement();
  const statistics = actor?.system?.statistics ?? {};
  const state = !fxEnabled() || !actor ? "" : statistics.dead ? "dead" : statistics.dying ? "dying" : statistics.wounded ? "wounded" : "";
  element.className = state ? `is-${state}` : "";
  if (hit && fxEnabled() && !still()) {
    element.classList.add("is-hit");
    setTimeout(() => element.classList.remove("is-hit"), 700);
  }
}

function onActorUpdate(actor) {
  const hero = heroOf();
  if (!hero || actor.id !== hero.id) return;
  const health = actor.system.health?.value ?? null;
  const hit = lastActorId === actor.id && lastHealth !== null && health !== null && health < lastHealth;
  lastHealth = health; lastActorId = actor.id;
  syncVignette({ hit });
}

/* -------------------------------------------- */
/*  Banners and the medallion                   */
/* -------------------------------------------- */

/** A gold banner sweeping across the top of the screen. */
export function banner(text, { tone = "gold", duration = 2400 } = {}) {
  if (!fxEnabled()) return;
  const element = document.createElement("div");
  element.className = `witcher-banner is-${tone}`;
  element.setAttribute("role", "status");
  element.innerHTML = `<span>${foundry.utils.escapeHTML(text)}</span>`;
  document.body.append(element);
  setTimeout(() => element.remove(), duration);
}

/** The wolf medallion appears over the screen and shakes, with the reason under it. */
export function medallionAlarm(reason) {
  if (!fxEnabled()) return;
  document.querySelector(".witcher-medallion-alarm")?.remove();
  const element = document.createElement("div");
  element.className = "witcher-medallion-alarm";
  element.setAttribute("role", "status");
  element.innerHTML = `<i aria-hidden="true"></i><span>Медальон дрожит${reason ? `: ${foundry.utils.escapeHTML(reason)}` : ""}</span>`;
  document.body.append(element);
  setTimeout(() => element.remove(), 3200);
}

/** A natural 10 or 1 marks its chat card: gold or red. Fresh cards get the full burst, older ones only the glow. */
function markNatural(message, html) {
  const kind = message.isContentVisible === false ? null : naturalOf(message), card = html instanceof HTMLElement ? html : html?.[0];
  if (!kind || !card) return;
  card.classList.add(`witcher-natural-${kind}`);
  if (fxEnabled() && Date.now() - (message.timestamp ?? 0) < 15000) card.classList.add("is-fresh");
}

export function registerScreenFx() {
  document.addEventListener("click", spinDice, true);
  Hooks.on("renderChatMessageHTML", markNatural);
  Hooks.on("createChatMessage", message => {
    flareSheet(message).catch(error => console.error(`${SYSTEM_ID} | FX`, error));
    const medallion = flagsOf(message).medallion;
    if (medallion && message.visible) medallionAlarm(medallion.reason);
  });
  Hooks.on("updateActor", onActorUpdate);
  for (const hook of ["createActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, effect => { if (effect.parent?.documentName === "Actor") onActorUpdate(effect.parent); });
  Hooks.once("ready", () => { const hero = heroOf(); lastHealth = hero?.system.health?.value ?? null; lastActorId = hero?.id ?? null; syncVignette(); });
  Hooks.on("updateUser", user => { if (user.isSelf) syncVignette(); });
  Hooks.on("updateSetting", setting => { if (setting.key === `${SYSTEM_ID}.combatEffects`) syncVignette(); });
}
