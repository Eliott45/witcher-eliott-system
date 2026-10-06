import { SYSTEM_ID } from "../config.mjs";

export const PREGEN_CONTENT_VERSION = 1;

export function registerPregenMigration() {
  game.settings.register(SYSTEM_ID, "pregenContentVersion", { scope: "world", config: false, type: Number, default: 0 });
}

/** Append source profiles through Foundry; keep edited pregens and imported actors intact. */
export async function migratePregenContent() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "pregenContentVersion") >= PREGEN_CONTENT_VERSION) return;
  const pack = game.packs.get(`${SYSTEM_ID}.pregens`);
  if (!pack) return;
  const index = await pack.getIndex({ fields: [`flags.${SYSTEM_ID}.pregen.id`] });
  const existing = new Set(Array.from(index.values(), entry => entry.flags?.[SYSTEM_ID]?.pregen?.id));
  const response = await fetch(`systems/${SYSTEM_ID}/pack-sources/pregens.json`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Не удалось загрузить прегены: ${response.status}`);
  const sources = await response.json();
  if (!Array.isArray(sources) || !sources.length) throw new Error("Не найден список прегенов.");
  const missing = sources.filter(source => !existing.has(source.flags?.[SYSTEM_ID]?.pregen?.id));
  for (const source of missing) {
    if (source.type !== "character" || !source.flags?.[SYSTEM_ID]?.pregen?.id || index.has(source._id))
      throw new Error(`Проверьте преген «${source.name}»: ID занят или запись некорректна.`);
  }
  const locked = pack.locked;
  try {
    if (missing.length) {
      if (locked) await pack.configure({ locked: false });
      const created = await foundry.documents.Actor.implementation.createDocuments(missing, { pack: pack.collection, keepId: true });
      if (created.length !== missing.length) throw new Error("Добавлены не все прегены. Обновление будет повторено при следующем входе мастера.");
    }
    await game.settings.set(SYSTEM_ID, "pregenContentVersion", PREGEN_CONTENT_VERSION);
  } finally { if (locked && missing.length) await pack.configure({ locked: true }); }
}
