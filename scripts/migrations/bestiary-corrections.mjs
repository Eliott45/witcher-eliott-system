import { SYSTEM_ID } from "../config.mjs";
import { bestiaryPreset } from "../data/bestiary.mjs";

// Only the old stock field values are eligible. All other fields, embedded items and GM edits survive.
const CORRECTIONS = {
  bstr000000000010: [["system.creature.hasTailOrWings", [false, undefined]]],
  bstr000000000013: [["system.creature.hasTailOrWings", [false, undefined]]],
  bstr000000000017: [["system.creature.recoveryBase", [0, undefined]]],
  bstr000000000019: [["system.attributes.body", [7]]],
  bstr000000000020: [["system.creature.sizeClass", ["medium", undefined]]],
  bstr000000000025: [["system.creature.runBase", [0, undefined]], ["system.creature.hasTailOrWings", [false, undefined]]]
};
const valueAt = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);
const documentsOf = collection => Array.from(collection?.contents ?? collection ?? []);

/** Correct a recognized preset without replacing the Actor or overwriting unrelated GM changes. */
export function bestiaryCorrectionPatch(actor) {
  const preset = bestiaryPreset(actor), fields = CORRECTIONS[preset?._id] ?? [];
  return Object.fromEntries(fields.flatMap(([path, previous]) => {
    const current = valueAt(actor, path), desired = valueAt(preset, path);
    return previous.includes(current) && desired !== undefined && current !== desired ? [[path, desired]] : [];
  }));
}

/** Version 3: fix existing pack entries, world copies and unlinked scene tokens through Foundry APIs. */
export async function migrateBestiaryCorrections() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "bestiaryContentVersion") >= 3) return;
  const pack = game.packs.get(`${SYSTEM_ID}.bestiary`);
  if (!pack) return;
  const seenObjects = new Set(), seenUuids = new Set();
  const collect = actors => actors.flatMap(actor => {
    if (!actor || seenObjects.has(actor) || actor.uuid && seenUuids.has(actor.uuid)) return [];
    seenObjects.add(actor);
    if (actor.uuid) seenUuids.add(actor.uuid);
    const patch = bestiaryCorrectionPatch(actor);
    return Object.keys(patch).length ? [{ actor, patch }] : [];
  });
  const packRepairs = collect(documentsOf(await pack.getDocuments()));
  const worldRepairs = collect(documentsOf(game.actors));
  const tokenRepairs = collect(documentsOf(game.scenes).flatMap(scene => documentsOf(scene.tokens)
    .filter(token => !token.actorLink).map(token => token.actor)));
  const locked = pack.locked;
  try {
    if (locked && packRepairs.length) await pack.configure({ locked: false });
    for (const { actor } of [...packRepairs, ...worldRepairs, ...tokenRepairs]) {
      // A preceding asynchronous write may refresh a token or give the GM time to edit another actor.
      const patch = bestiaryCorrectionPatch(actor);
      if (!Object.keys(patch).length) continue;
      await actor.update(patch);
      // A preUpdate hook can cancel a write without throwing. Do not declare such a migration complete.
      if (Object.entries(patch).some(([path, value]) => valueAt(actor, path) !== value))
        throw new Error(`Не удалось исправить данные бестиария: ${actor.name}. Повторная загрузка продолжит миграцию.`);
    }
  } finally {
    if (locked && packRepairs.length) await pack.configure({ locked: true });
  }
  await game.settings.set(SYSTEM_ID, "bestiaryContentVersion", 3);
}
