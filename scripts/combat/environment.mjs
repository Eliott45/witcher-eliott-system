import { SYSTEM_ID } from "../config.mjs";

// Core p.165 «Влияние среды». The GM sets light, terrain and heat for a scene; a token can carry an
// exception as a condition (against the sun, lit by a torch, in or under water, on dry ground).
const mod = (target, value) => ({ target, value });
export const LIGHT_LEVELS = [
  { id: "auto", name: "Авто: по темноте сцены", hint: "Темнота сцены до 25% — дневной свет, до 65% — слабый свет, дальше — темнота." },
  { id: "bright", name: "Яркий свет", hint: "Солнце в пустыне или блики от снега. Тем, кто смотрит против солнца, повесьте «Против солнца»: −3 к Вниманию, атаке и защите." },
  { id: "day", name: "Дневной свет", hint: "Нет штрафов." },
  { id: "dim", name: "Слабый свет", hint: "Лунный свет: −2 к Вниманию.", modifiers: [mod("skills.awareness", -2)] },
  { id: "dark", name: "Темнота", hint: "Ночь в новолуние или глубокая пещера: −4 к Вниманию, −2 к атаке и защите.",
    modifiers: [mod("skills.awareness", -4), mod("combat.attack", -2), mod("combat.defense", -2)] }
];
const WATER = [mod("combat.attack", -2), mod("combat.blockParry", -2), mod("skills.awareness", -3)];
export const TERRAINS = [
  { id: "normal", name: "Обычная местность", hint: "Нет штрафов." },
  { id: "snow", name: "Лёд и снег", hint: "После бега или атаки — Атлетика СЛ 14, иначе падение ничком. Выслеживание по свежим следам +3, по старым −3. Без укрытия и тёплой одежды персонаж выдерживает столько часов, сколько у него ТЕЛ, затем оказывается при смерти." },
  { id: "swamp", name: "Болото и заросли", hint: "−2 к Уклонению/Изворотливости и Атлетике.", modifiers: [mod("skills.dodgeEscape", -2), mod("skills.athletics", -2)] },
  { id: "water", name: "В воде", hint: "−2 к атаке, блоку и парированию, −3 к Вниманию. Смена позиции — по трём осям, на половину расстояния.", modifiers: WATER },
  { id: "underwater", name: "Под водой", hint: "Как в воде, а также: оружием ближнего боя — одна атака за ход; уклонение и смена позиции — Атлетикой; метательное оружие (кроме копья) не работает; луки и арбалеты — дальность ×¼, урон ×½.", modifiers: WATER }
];
export const DEFAULT_ENVIRONMENT = { light: "auto", terrain: "normal", heat: false };
const HEAT_HINT = "Экстремальная жара: Выносливость снижается на треть, в средней или тяжёлой броне — вдвое.";

/** Token exceptions that override the scene (statuses on the actor). */
export const ENVIRONMENT_STATUSES = { lit: "env-lit", sun: "env-against-sun", dry: "env-dry-ground", water: "env-in-water", underwater: "env-underwater" };

export const sceneEnvironment = scene => ({ ...DEFAULT_ENVIRONMENT, ...(scene?.flags?.[SYSTEM_ID]?.environment ?? {}) });

export function actorToken(actor) {
  if (actor?.isToken) return actor.token ?? null;
  const tokens = globalThis.canvas?.ready ? actor?.getActiveTokens?.(false, true) ?? [] : [];
  return tokens[0] ?? null;
}

/** Scene settings overridden by «Среда Ведьмака» region behaviors the token stands in (empty field = as the scene). */
export function regionEnvironment(environment, token) {
  const merged = { ...environment };
  for (const region of token?.regions ?? []) for (const behavior of region.behaviors ?? []) {
    if (behavior.type !== "environment" || behavior.disabled) continue;
    const { light, terrain, heat } = behavior.system ?? {};
    if (light) merged.light = light;
    if (terrain) merged.terrain = terrain;
    if (heat) merged.heat = heat === "on";
  }
  return merged;
}

/** Light level after «auto» and the «lit» exception. */
export function lightLevel(environment, scene, statuses = new Set()) {
  let light = environment.light;
  if (light === "auto") {
    const darkness = scene?.environment?.darknessLevel ?? scene?.darkness ?? 0;
    light = darkness <= 0.25 ? "day" : darkness <= 0.65 ? "dim" : "dark";
  }
  if (statuses.has(ENVIRONMENT_STATUSES.lit) && ["dim", "dark"].includes(light)) light = "day";
  return light;
}
export function terrainOf(environment, statuses = new Set()) {
  if (statuses.has(ENVIRONMENT_STATUSES.underwater)) return "underwater";
  if (statuses.has(ENVIRONMENT_STATUSES.water)) return "water";
  if (statuses.has(ENVIRONMENT_STATUSES.dry)) return "normal";
  return environment.terrain;
}

/** What the environment does to one actor right now; `scene` may be passed explicitly (tests, previews). */
export function actorEnvironment(actor, scene = undefined, token = actorToken(actor)) {
  scene ??= token?.parent ?? null;
  if (!scene) return null;
  const environment = regionEnvironment(sceneEnvironment(scene), token), statuses = actor?.statuses ?? new Set();
  const light = LIGHT_LEVELS.find(entry => entry.id === lightLevel(environment, scene, statuses));
  const terrain = TERRAINS.find(entry => entry.id === terrainOf(environment, statuses)) ?? TERRAINS[0];
  return { light, terrain, heat: Boolean(environment.heat), underwater: terrain.id === "underwater" };
}

const heavyArmor = items => Array.from(items ?? []).some(item => item.type === "armor" && item.system.equipped && ["medium", "heavy"].includes(item.system.armorClass));
const catPotion = effects => Array.from(effects ?? []).some(effect => !effect.disabled && effect.statuses?.has?.("potion.cat"));

/**
 * Modifiers for deriveStatistics. Witchers' enhanced senses ignore dim light; the Cat potion ignores dim light and darkness.
 * `senses` is true when the actor has working enhanced senses.
 */
export function environmentModifiers(state, { items = [], effects = [], senses = false } = {}) {
  if (!state) return [];
  const label = text => ({ source: "environment", category: "environment", label: text });
  const out = [];
  const ignoresLight = state.light.id === "dark" ? catPotion(effects) : state.light.id === "dim" ? senses || catPotion(effects) : false;
  if (!ignoresLight) for (const modifier of state.light.modifiers ?? []) out.push({ ...modifier, ...label(state.light.name) });
  // Killer Whale (core p.247) cancels the sight penalty under water.
  const clearSight = ["water", "underwater"].includes(state.terrain.id) && Array.from(effects ?? []).some(effect => !effect.disabled && effect.flags?.[SYSTEM_ID]?.consumable?.ruleId === "potion.killer-whale");
  for (const modifier of state.terrain.modifiers ?? []) if (!(clearSight && modifier.target === "skills.awareness")) out.push({ ...modifier, ...label(state.terrain.name) });
  if (state.heat) out.push({ target: "staminaMax", factor: heavyArmor(items) ? 1 / 2 : 2 / 3, ...label("Экстремальная жара") });
  return out;
}

/** One line for the sheet: what applies here and why. */
export function environmentSummary(state) {
  if (!state) return null;
  const parts = [state.light.id !== "day" ? state.light : null, state.terrain.id !== "normal" ? state.terrain : null].filter(Boolean);
  if (state.heat) parts.push({ name: "Экстремальная жара", hint: HEAT_HINT });
  return parts.length ? { label: parts.map(part => part.name).join(" · "), hint: parts.map(part => `${part.name}: ${part.hint}`).join("\n") } : null;
}

/** Throwing weapons that still work under water: spears. */
export const worksUnderwater = weapon => weapon.category !== "thrown" || weapon.skill === "staffSpear" || /копь/iu.test(weapon.name ?? "");

/** Core p.165, ice and snow: Athletics DC 14 after running or attacking, or fall prone. */
export async function rollFooting(actor) {
  const { skillValue } = await import("../data/skills.mjs");
  const { knockProne } = await import("./brawling.mjs");
  const athletics = skillValue(actor.system, "athletics");
  const roll = await new foundry.dice.Roll(`1d10wc + ${athletics?.total ?? 0}`).evaluate();
  const kept = roll.total >= 14;
  await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { skipLuck: true } },
    flavor: `<section class="witcher-attack-chat"><h3>Лёд и снег · удержаться на ногах</h3><p>Атлетика против СЛ 14: <strong>${kept ? "устоял" : "поскользнулся и упал ничком"}</strong>.</p></section>` });
  if (!kept) await knockProne(actor);
  return kept;
}

async function openEnvironmentDialog(scene = globalThis.canvas?.scene) {
  if (!scene || !game.user.isGM) return;
  const current = sceneEnvironment(scene);
  const options = (list, value) => list.map(entry => `<option value="${entry.id}" ${entry.id === value ? "selected" : ""}>${entry.name}</option>`).join("");
  const hints = list => list.map(entry => `<li><b>${entry.name}.</b> ${entry.hint}</li>`).join("");
  const content = `<div class="witcher-environment-form"><label>Освещение<select name="light">${options(LIGHT_LEVELS, current.light)}</select></label>
    <label>Местность<select name="terrain">${options(TERRAINS, current.terrain)}</select></label>
    <label class="checkbox"><input type="checkbox" name="heat" ${current.heat ? "checked" : ""}> Экстремальная жара</label>
    <details><summary>Что это даёт (стр. 165)</summary><ul>${hints(LIGHT_LEVELS)}${hints(TERRAINS)}<li>${HEAT_HINT}</li></ul>
    <p>Исключения для отдельных токенов — состояния «Против солнца», «Освещён», «На суше», «В воде», «Под водой» (HUD токена).</p></details></div>`;
  const result = await foundry.applications.api.DialogV2.prompt({ window: { title: `Среда: ${scene.name}` }, position: { width: 480 }, content, rejectClose: false,
    ok: { label: "Сохранить", callback: (_event, button) => { const data = new FormData(button.form); return { light: data.get("light"), terrain: data.get("terrain"), heat: data.get("heat") === "on" }; } } });
  if (result) await scene.update({ [`flags.${SYSTEM_ID}.environment`]: result });
}

/** Region behavior «Среда Ведьмака»: light, terrain or heat inside the region (ice, a swamp, a lit hall…). */
function environmentBehaviorClass() {
  const { StringField } = foundry.data.fields, base = foundry.data.regionBehaviors.RegionBehaviorType;
  const choices = (list, blank) => ({ "": blank, ...Object.fromEntries(list.filter(entry => entry.id !== "auto").map(entry => [entry.id, entry.name])) });
  return class EnvironmentRegionBehavior extends base {
    static defineSchema() {
      return {
        light: new StringField({ required: true, blank: true, initial: "", choices: choices(LIGHT_LEVELS, "Как в сцене"), label: "Освещение" }),
        terrain: new StringField({ required: true, blank: true, initial: "snow", choices: choices(TERRAINS, "Как в сцене"), label: "Местность" }),
        heat: new StringField({ required: true, blank: true, initial: "", choices: { "": "Как в сцене", on: "Жара", off: "Без жары" }, label: "Экстремальная жара" })
      };
    }
    // Statistics are read live: redraw the sheet when a token steps in or out.
    static events = Object.fromEntries([CONST.REGION_EVENTS.TOKEN_ENTER, CONST.REGION_EVENTS.TOKEN_EXIT].map(name => [name, async function(event) {
      const actor = event.data?.token?.actor;
      actor?.reset?.();
      if (actor?.sheet?.rendered) actor.sheet.render();
    }]));
  };
}

export function registerEnvironment() {
  CONFIG.RegionBehavior.dataModels.environment = environmentBehaviorClass();
  CONFIG.RegionBehavior.typeLabels.environment = "Среда Ведьмака";
  CONFIG.RegionBehavior.typeIcons.environment = "fa-solid fa-snowflake";
  CONFIG.RegionBehavior.typeHints = { ...CONFIG.RegionBehavior.typeHints, environment: "Освещение, местность (лёд и снег, болото, вода) или жара внутри региона (стр. 165). Пустое поле — как в сцене." };
  Hooks.on("getSceneControlButtons", controls => {
    const tokens = controls.tokens ?? controls.token;
    if (!tokens?.tools || !game.user.isGM) return;
    tokens.tools.witcherEnvironment = { name: "witcherEnvironment", title: "Среда сцены (стр. 165)", icon: "fa-solid fa-cloud-sun", order: 90, button: true,
      onChange: () => openEnvironmentDialog().catch(error => ui.notifications.error(error.message)) };
  });
  // Statistics read the scene: refresh open sheets when the environment changes.
  Hooks.on("updateScene", (scene, changes) => {
    if (!foundry.utils.hasProperty(changes, `flags.${SYSTEM_ID}.environment`) && !foundry.utils.hasProperty(changes, "environment.darknessLevel")) return;
    for (const token of scene.tokens) { token.actor?.reset?.(); if (token.actor?.sheet?.rendered) token.actor.sheet.render(); }
  });
}
