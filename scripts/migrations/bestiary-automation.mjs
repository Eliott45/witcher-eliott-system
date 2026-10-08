import { SYSTEM_ID } from "../config.mjs";
import { bestiaryPreset, bestiarySources } from "../data/bestiary.mjs";
import { BESTIARY_V4_PREVIOUS, BESTIARY_V4_ITEM_FIELDS, ARCHER_V4_HARVEST } from "./bestiary-automation-values.mjs";

const ARCHER = "bstr000000000002", ARMOR_STATE = "bestiaryArmorV4";
const at = (source, path) => path.split(".").reduce((value, key) => value?.[key], source);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const documents = collection => Array.from(collection?.contents ?? collection ?? []);
const itemById = (actor, id) => documents(actor.items).find(item => (item.id ?? item._id) === id);
const previousValue = (current, old) => old === null ? current === undefined || current === null || current === "" : same(current, old);

function presetOf(actor) {
  const preset = bestiaryPreset(actor);
  if (preset) return preset;
  // The old Warg page reference changed; unlike source-only matching this cannot identify another creature.
  return bestiarySources().find(source => source.name === actor.name && (BESTIARY_V4_PREVIOUS[source._id]?.fields ?? [])
    .some(([path, old]) => path === "system.creature.source" && actor.system?.creature?.source === old)) ?? null;
}

function fieldsPatch(current, desired, fields = []) {
  const patch = {};
  for (const [path, old] of fields) {
    const value = at(current, path), next = at(desired, path);
    if (path === "system.creature.lore" && Array.isArray(value)) {
      // Only the changed stock lore text is replaced; unrelated notes and edited rows survive.
      const lore = structuredClone(value);
      for (let index = 0; index < old.length; index++) {
        const before = old[index], after = next[index];
        if (!after || before.text === after.text) continue;
        const row = lore.find(row => row.name === before.name && row.skill === before.skill && row.dc === before.dc && row.text === before.text);
        if (row) row.text = after.text;
      }
      if (!same(lore, value)) patch[path] = lore;
    } else if (next !== undefined && previousValue(value, old) && !same(value, next)) patch[path] = structuredClone(next);
  }
  return patch;
}

/** Pure stock-value diff. User fields, resources, wounds and deleted embedded items are not reconstructed. */
export function bestiaryAutomationPatch(actor) {
  const preset = presetOf(actor), before = BESTIARY_V4_PREVIOUS[preset?._id];
  if (!preset) return { actor: {}, items: [], armor: null };
  const itemPatches = Object.entries(before?.items ?? {}).flatMap(([id, [type, fieldSet]]) => {
    const item = itemById(actor, id), desired = preset.items.find(item => item._id === id);
    if (!item || item.type !== type || !desired) return [];
    const patch = fieldsPatch(item, desired, BESTIARY_V4_ITEM_FIELDS[fieldSet]);
    return Object.keys(patch).length ? [{ _id: id, ...patch }] : [];
  });
  return { actor: fieldsPatch(actor, preset, before?.fields), items: itemPatches,
    armor: preset._id === ARCHER ? archerArmorPlan(actor, preset) : null };
}

function stockHarvest(row, old) {
  return row && row.id === old.id && row.uuid === old.uuid && row.quantity === old.quantity
    && (row.formula ?? "") === old.formula && (row.skill ?? "") === old.skill && (row.dc ?? 0) === old.dc && !row.attempted;
}
function archerArmorPlan(actor, preset) {
  const state = actor.flags?.[SYSTEM_ID]?.[ARMOR_STATE];
  if (state?.complete) return null;
  const sources = preset.items.filter(item => item.type === "armor"), items = documents(actor.items);
  if (state) return { state, sources };
  const sp = actor.system.creature.naturalArmor;
  if (!Number.isFinite(sp) || sp < 0 || sp > 5) return null;
  // Loot already taken or customized must not be replaced with a free new set of armor.
  if (!ARCHER_V4_HARVEST.every(old => stockHarvest(actor.system.harvest.find(row => row.id === old.id), old))) return null;
  if (items.some(item => item.type === "armor") || sources.some(source => itemById(actor, source._id))) return null;
  return { state: { sp, harvestIds: ARCHER_V4_HARVEST.map(row => row.id), complete: false }, sources };
}

const verify = (document, patch, label) => {
  if (Object.entries(patch).some(([path, value]) => !same(at(document, path), value)))
    throw new Error(`Не удалось обновить ${label}. Повторная загрузка продолжит миграцию бестиария.`);
};

/** Retryable two-stage conversion; the migration marker remembers wear across interrupted embedded writes. */
async function migrateArcherArmor(actor) {
  let plan = bestiaryAutomationPatch(actor).armor;
  if (!plan) return;
  if (!actor.flags?.[SYSTEM_ID]?.[ARMOR_STATE]) {
    const patch = { [`flags.${SYSTEM_ID}.${ARMOR_STATE}`]: plan.state };
    await actor.update(patch); verify(actor, patch, "план брони лучника");
  }
  plan = bestiaryAutomationPatch(actor).armor;
  if (!plan) return;
  const { state, sources } = plan;
  const missing = sources.filter(source => !itemById(actor, source._id));
  if (missing.length) {
    const creates = missing.map(source => {
      const copy = structuredClone(source), max = copy.system.stoppingPower.max;
      copy.system.stoppingPower.value = Math.max(0, max - (5 - state.sp));
      copy.flags = { ...copy.flags, [SYSTEM_ID]: { ...copy.flags?.[SYSTEM_ID], bestiaryArmorV4: true } };
      return copy;
    });
    await actor.createEmbeddedDocuments("Item", creates, { keepId: true });
    if (creates.some(source => !itemById(actor, source._id))) throw new Error("Не удалось добавить все доспехи лучника. Повторная загрузка добавит недостающие.");
  }
  // Do not overwrite changes made while the embedded write was pending.
  if (actor.system.creature.naturalArmor !== state.sp) throw new Error("Броня лучника изменена во время миграции; прежнее значение сохранено.");
  const harvest = actor.system.harvest.filter(row => !ARCHER_V4_HARVEST.some(old => stockHarvest(row, old)));
  const patch = { "system.creature.naturalArmor": 0, "system.harvest": harvest,
    [`flags.${SYSTEM_ID}.${ARMOR_STATE}`]: { ...state, complete: true } };
  await actor.update(patch); verify(actor, patch, "броню лучника");
}

/** v4: stock automation metadata and archer armor, through normal Document APIs. */
export async function migrateBestiaryAutomation() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "bestiaryContentVersion") >= 4) return;
  const pack = game.packs.get(`${SYSTEM_ID}.bestiary`);
  if (!pack) return;
  const seen = new Set(), uuids = new Set();
  const collect = actors => actors.filter(actor => {
    if (!actor || seen.has(actor) || actor.uuid && uuids.has(actor.uuid)) return false;
    seen.add(actor); if (actor.uuid) uuids.add(actor.uuid);
    const patch = bestiaryAutomationPatch(actor);
    return Object.keys(patch.actor).length || patch.items.length || patch.armor;
  });
  const packActors = collect(documents(await pack.getDocuments()));
  const worldActors = collect(documents(game.actors));
  const tokenActors = collect(documents(game.scenes).flatMap(scene => documents(scene.tokens).filter(token => !token.actorLink).map(token => token.actor)));
  const locked = pack.locked;
  try {
    if (locked && packActors.length) await pack.configure({ locked: false });
    for (const actor of [...packActors, ...worldActors, ...tokenActors]) {
      let patch = bestiaryAutomationPatch(actor);
      if (Object.keys(patch.actor).length) { await actor.update(patch.actor); verify(actor, patch.actor, actor.name); }
      patch = bestiaryAutomationPatch(actor);
      if (patch.items.length) {
        await actor.updateEmbeddedDocuments("Item", patch.items);
        for (const { _id, ...fields } of patch.items) verify(itemById(actor, _id), fields, `предмет ${_id}`);
      }
      await migrateArcherArmor(actor);
    }
  } finally {
    if (locked && packActors.length) await pack.configure({ locked: true });
  }
  await game.settings.set(SYSTEM_ID, "bestiaryContentVersion", 4);
}
