import { SYSTEM_ID } from "../config.mjs";
import { CONDITION_BY_ID, EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { CRITICAL_WOUND_SOURCES } from "../combat/critical-wound-effects.mjs";
import { stripPageReferences } from "../data/item-lore.mjs";

// 2: also append conditions added to the system after a world's compendium was created (Staggered, Grappled…).
// 3: refresh untouched critical wound entries (prostheses on lost limbs).
// 4: p.161 conditions now automated (Vomiting added; Intoxication, Blindness, Nausea, bleeding/burning texts).
// 5: Dying explains stabilisation by First Aid (core p.162).
// 6: Prone — stand up by spending movement (core p.163).
// 7: Prone is called «Ничком».
// 8: Standing spends all movement; refresh existing prone effects as well as the catalog.
export const EFFECT_CONTENT_VERSION = 8;
// Earlier shipped names still count as unedited entries.
const PREVIOUS_NAMES = { prone: ["Сбит с ног"] };
const REFRESHED_CONDITIONS = new Set(["burning", "bleeding", "burrowing", "intoxicated", "blinded", "nauseated", "dying", "prone"]);
const OLD_PRONE_DESCRIPTIONS = new Set([
  "−2 к атаке и защите, пока персонаж не потратит перемещение, чтобы встать.",
  "−2 к атаке и защите, пока персонаж не потратит перемещение, чтобы встать. Встав, можно потратить действие, чтобы переместиться на обычное расстояние.",
  "Персонаж лежит: сбит с ног, брошен или упал без сознания. −2 к атаке и защите, пока не потратит перемещение, чтобы встать. Встав, можно потратить действие, чтобы переместиться на обычное расстояние."
].flatMap(text => [text, `<p>${text}</p>`]));

export function proneContentUpdate(effect) {
  if (!Array.from(effect.statuses ?? []).includes("prone")) return {};
  const source = conditionSource(CONDITION_BY_ID.prone), update = {};
  if (effect.name === "Сбит с ног") update.name = source.name;
  if (!effect.description || OLD_PRONE_DESCRIPTIONS.has(stripPageReferences(effect.description))) update.description = source.description;
  const rules = effect.flags?.[SYSTEM_ID]?.condition;
  if (!rules) update[`flags.${SYSTEM_ID}.condition`] = source.flags[SYSTEM_ID].condition;
  else if (!rules.action || rules.action === "Встать — потратить перемещение") update[`flags.${SYSTEM_ID}.condition.action`] = CONDITION_BY_ID.prone.rules.action;
  return update;
}
export function registerEffectContentMigration() {
  game.settings.register(SYSTEM_ID, "effectContentVersion", { scope: "world", config: false, type: Number, default: 0 });
}

export const effectCompendiumSources = (localize = text => text) => [
  ...EFFECT_TEMPLATES.map(entry => conditionSource(entry, text => text.startsWith("WITCHER.") ? localize(text) : text)),
  ...structuredClone(CRITICAL_WOUND_SOURCES)
];

/** Append missing system effects to an existing effects compendium through Foundry; edited entries are kept. */
export async function migrateEffectContent() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "effectContentVersion") >= EFFECT_CONTENT_VERSION) return;
  const pack = game.packs.get(`${SYSTEM_ID}.effects`);
  if (!pack) return;
  const index = await pack.getIndex();
  const sources = effectCompendiumSources(key => game.i18n.localize(key));
  const missing = sources.filter(source => !index.has(source._id));
  // A wound entry still carrying its shipped name is treated as unedited and follows the current rules.
  const unedited = source => [source.name, ...(PREVIOUS_NAMES[source.flags[SYSTEM_ID]?.condition?.key] ?? [])].includes(index.get(source._id)?.name);
  const refresh = sources.filter(source => (source.flags[SYSTEM_ID]?.criticalWound || REFRESHED_CONDITIONS.has(source.flags[SYSTEM_ID]?.condition?.key)) && unedited(source))
    .map(source => ({ _id: source._id, name: source.name, description: source.description, [`flags.${SYSTEM_ID}`]: source.flags[SYSTEM_ID] }));
  if (missing.length || refresh.length) {
    const locked = pack.locked;
    try {
      if (locked) await pack.configure({ locked: false });
      const created = await foundry.documents.ActiveEffect.implementation.createDocuments(missing, { pack: pack.collection, keepId: true });
      if (created.length !== missing.length) throw new Error("Добавлены не все эффекты. Обновление будет повторено при следующем входе мастера.");
      if (refresh.length) await foundry.documents.ActiveEffect.implementation.updateDocuments(refresh, { pack: pack.collection, broadcast: false });
    } finally { if (locked) await pack.configure({ locked: true }); }
  }
  const actors = new Map(game.actors.map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes) for (const token of scene.tokens)
    if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor);
  for (const parent of [...actors.values(), ...game.items, ...Array.from(actors.values()).flatMap(actor => Array.from(actor.items))]) {
    const updates = Array.from(parent.effects).flatMap(effect => {
      const update = proneContentUpdate(effect);
      return Object.keys(update).length ? [{_id:effect.id,...update}] : [];
    });
    if (updates.length) await parent.updateEmbeddedDocuments("ActiveEffect", updates);
  }
  await game.settings.set(SYSTEM_ID, "effectContentVersion", EFFECT_CONTENT_VERSION);
}
