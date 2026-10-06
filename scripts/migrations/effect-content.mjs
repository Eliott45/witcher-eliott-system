import { SYSTEM_ID } from "../config.mjs";
import { EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { CRITICAL_WOUND_SOURCES } from "../combat/critical-wound-effects.mjs";

// 2: also append conditions added to the system after a world's compendium was created (Staggered, Grappled…).
// 3: refresh untouched critical wound entries (prostheses on lost limbs).
// 4: p.161 conditions now automated (Vomiting added; Intoxication, Blindness, Nausea, bleeding/burning texts).
// 5: Dying explains stabilisation by First Aid (core p.162).
// 6: Prone — stand up by spending movement (core p.163).
// 7: Prone is called «Ничком».
export const EFFECT_CONTENT_VERSION = 7;
// Earlier shipped names still count as unedited entries.
const PREVIOUS_NAMES = { prone: ["Сбит с ног"] };
const REFRESHED_CONDITIONS = new Set(["burning", "bleeding", "burrowing", "intoxicated", "blinded", "nauseated", "dying", "prone"]);
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
  await game.settings.set(SYSTEM_ID, "effectContentVersion", EFFECT_CONTENT_VERSION);
}
