import { SYSTEM_ID } from "../config.mjs";
import { bookSource, withoutBookPages } from "../data/book-references.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";

export const BOOK_REFERENCES_VERSION = 1;
const textFields = new Set(["description", "properties", "notes", "sessionNotes", "backstory", "appearance", "tactics", "vulnerabilities", "lore", "text", "hint"]);

function cleaned(value, key) {
  if (typeof value === "string") return key === "source" ? bookSource(value) : textFields.has(key) ? withoutBookPages(value) : value;
  if (Array.isArray(value)) return value.map(entry => cleaned(entry, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([field, entry]) => [field, cleaned(entry, field)]));
  return value;
}

function changes(before, after, path, update) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  // Foundry replaces arrays as a whole; dotted array-index updates are not supported.
  if (!before || typeof before !== "object" || Array.isArray(before)) update[path] = after;
  else for (const key of Object.keys(after)) changes(before[key], after[key], `${path}.${key}`, update);
}

/** Patch only prose and source fields; IDs, formulas, stats, links and all other flags stay intact. */
export function bookReferenceUpdate(document) {
  const source = document.toObject ? document.toObject() : document, update = {};
  if (source.system) changes(source.system, cleaned(source.system), "system", update);
  if (typeof source.description === "string") changes(source.description, withoutBookPages(source.description), "description", update);
  const pregenSource = source.flags?.[SYSTEM_ID]?.pregen?.source;
  if (typeof pregenSource === "string") changes(pregenSource, bookSource(pregenSource), `flags.${SYSTEM_ID}.pregen.source`, update);
  return update;
}

const updatesFor = documents => Array.from(documents ?? []).flatMap(document => {
  const update = bookReferenceUpdate(document);
  return Object.keys(update).length ? [{ _id: document.id ?? document._id, ...update }] : [];
});

async function updateEffects(parent, options) {
  const updates = updatesFor(parent.effects);
  if (updates.length) await parent.updateEmbeddedDocuments("ActiveEffect", updates, options);
}

async function updateChildren(document, options) {
  await updateEffects(document, options);
  if (!document.items) return;
  await inventoryWrite(document, async () => {
    const items = updatesFor(document.items);
    if (items.length) await document.updateEmbeddedDocuments("Item", items, options);
    for (const item of document.items) await updateEffects(item, options);
  });
}

async function updateCollection(documents, type, options = {}) {
  const updates = updatesFor(documents);
  if (updates.length) await foundry.documents[type].implementation.updateDocuments(updates, options);
  for (const document of documents) await updateChildren(document, options.broadcast === false ? { broadcast: false } : {});
}

export function registerBookReferencesMigration() {
  game.settings.register(SYSTEM_ID, "bookReferencesVersion", { scope: "world", config: false, type: Number, default: 0 });
}

/** Run after content migrations, using Foundry APIs for both live and locked compendiums. */
export async function migrateBookReferences() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "bookReferencesVersion") >= BOOK_REFERENCES_VERSION) return;
  await updateCollection(game.items, "Item");
  await updateCollection(game.actors, "Actor");
  // A synthetic actor must update through its token, never through Actor.updateDocuments.
  const tokens = new Map();
  for (const scene of game.scenes) for (const token of scene.tokens) if (!token.actorLink && token.actor) tokens.set(token.actor.uuid, token.actor);
  for (const actor of tokens.values()) {
    const update = bookReferenceUpdate(actor);
    if (Object.keys(update).length) await actor.update(update);
    await updateChildren(actor, {});
  }
  for (const pack of game.packs.values()) {
    if (!(pack.collection.startsWith(`${SYSTEM_ID}.`) || pack.collection.startsWith("world.")) || !["Item", "Actor", "ActiveEffect"].includes(pack.documentName)) continue;
    const documents = await pack.getDocuments(), locked = pack.locked;
    try {
      if (locked) await pack.configure({ locked: false });
      await updateCollection(documents, pack.documentName, { pack: pack.collection, broadcast: false });
    } finally { if (locked) await pack.configure({ locked: true }); }
  }
  await game.settings.set(SYSTEM_ID, "bookReferencesVersion", BOOK_REFERENCES_VERSION);
}
