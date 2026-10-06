import { SYSTEM_ID } from "../config.mjs";
import { EFFECT_TEMPLATES, conditionSource } from "../data/condition-definitions.mjs";
import { CRITICAL_WOUND_SOURCES } from "../combat/critical-wound-effects.mjs";

// 2: also append conditions added to the system after a world's compendium was created (Staggered, Grappled…).
export const EFFECT_CONTENT_VERSION = 2;
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
  const missing = effectCompendiumSources(key => game.i18n.localize(key)).filter(source => !index.has(source._id));
  if (missing.length) {
    const locked = pack.locked;
    try {
      if (locked) await pack.configure({ locked: false });
      const created = await foundry.documents.ActiveEffect.implementation.createDocuments(missing, { pack: pack.collection, keepId: true });
      if (created.length !== missing.length) throw new Error("Добавлены не все эффекты. Обновление будет повторено при следующем входе мастера.");
    } finally { if (locked) await pack.configure({ locked: true }); }
  }
  await game.settings.set(SYSTEM_ID, "effectContentVersion", EFFECT_CONTENT_VERSION);
}
