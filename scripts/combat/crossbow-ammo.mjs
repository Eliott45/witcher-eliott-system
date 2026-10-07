import { SYSTEM_ID } from "../config.mjs";
import { isAmmunition } from "../data/physical-items.mjs";
import { CORE_AMMUNITION } from "../data/core-ammunition.mjs";

// A crossbow holds one bolt (core p.152): loading takes it from the inventory, a shot spends it and unloading
// returns it. The bolt is remembered on the crossbow so it comes back as the same kind of ammunition.
export const isCrossbow = item => item?.type === "weapon" && item.system.skill === "crossbow";
const STANDARD = CORE_AMMUNITION.find(entry => entry.id === "ammunition.standard");

/** Bolt in the crossbow; a crossbow loaded before bolts were tracked holds a standard one. */
export function loadedBolt(item) {
  if (!isCrossbow(item) || item.system.loaded === false) return null;
  return item.flags?.[SYSTEM_ID]?.loadedAmmo ?? { name: STANDARD.name, img: STANDARD.img, ruleId: STANDARD.system.ruleId ?? STANDARD.id, properties: "" };
}

/** Ammunition stacks that can be loaded, the first one by default. */
export const boltChoices = actor => Array.from(actor.items ?? []).filter(item => isAmmunition(item) && (item.system.quantity ?? 0) > 0);

const boltRecord = ammo => ({ name: ammo.name, img: ammo.img, ruleId: ammo.system.ruleId ?? "", properties: ammo.system.properties ?? "", source: (() => {
  const { name, img, type, flags, system } = ammo.toObject?.() ?? structuredClone(ammo);
  return { name, img, type, flags, system: { ...system, quantity: 1, equipped: false, containerId: "" } };
})() });

/** Changes that put one bolt from `ammoId` into the crossbow. */
export function loadUpdate(actor, item, ammoId) {
  if (!isCrossbow(item)) throw new Error("Заряжать можно только арбалет.");
  if (item.system.loaded !== false) throw new Error(`${item.name} уже заряжен.`);
  const choices = boltChoices(actor), ammo = choices.find(entry => entry.id === ammoId) ?? (ammoId ? null : choices[0]);
  if (!ammo) throw new Error("Нет болтов в инвентаре.");
  return { ammo, items: [{ _id: ammo.id, "system.quantity": ammo.system.quantity - 1 },
    { _id: item.id, "system.loaded": true, [`flags.${SYSTEM_ID}.loadedAmmo`]: boltRecord(ammo) }] };
}

/** Changes after a shot: the bolt is spent. */
export const firedUpdate = item => ({ _id: item.id, "system.loaded": false, [`flags.${SYSTEM_ID}.loadedAmmo`]: null });

/** Takes the bolt out and returns it to its stack (or a new one). */
export async function unloadCrossbow(actor, item) {
  const bolt = loadedBolt(item);
  if (!bolt) return null;
  await actor.updateEmbeddedDocuments("Item", [firedUpdate(item)]);
  const stack = Array.from(actor.items ?? []).find(entry => isAmmunition(entry) && (bolt.ruleId ? entry.system.ruleId === bolt.ruleId : entry.name === bolt.name));
  if (stack) await actor.updateEmbeddedDocuments("Item", [{ _id: stack.id, "system.quantity": (stack.system.quantity ?? 0) + 1 }]);
  else {
    const source = bolt.source ? structuredClone(bolt.source) : { name: STANDARD.name, img: STANDARD.img, type: STANDARD.type, flags: STANDARD.flags,
      system: { ...structuredClone(STANDARD.system), ruleId: STANDARD.system.ruleId ?? STANDARD.id } };
    source.system.quantity = 1;
    await actor.createEmbeddedDocuments("Item", [source]);
  }
  return bolt;
}
