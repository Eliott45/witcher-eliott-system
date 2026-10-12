import { SYSTEM_ID } from "../config.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";

/** Combat cards have their own order; reading it never sorts or updates the inventory. */
export function orderedCombatWeapons(actor) {
  const weapons = Array.from(actor.items ?? []).filter(item => item.type === "weapon");
  const byId = new Map(weapons.map(item => [item.id, item]));
  const saved = actor.flags?.[SYSTEM_ID]?.combatWeaponOrder;
  const ids = new Set([...(Array.isArray(saved) ? saved : []), ...byId.keys()]);
  return Array.from(ids, id => byId.get(id)).filter(Boolean);
}

/** Re-read inside the shared queue so rapid clicks each move one place from the latest saved state. */
export async function moveCombatWeapon(actor, itemId, direction) {
  if (!actor.isOwner || !["up", "down"].includes(direction)) return false;
  return (await inventoryWrite(actor, async () => {
    const weapons = orderedCombatWeapons(actor), index = weapons.findIndex(item => item.id === itemId);
    const next = index + (direction === "up" ? -1 : 1);
    if (index < 0 || next < 0 || next >= weapons.length) return false;
    [weapons[index], weapons[next]] = [weapons[next], weapons[index]];
    await actor.update({ [`flags.${SYSTEM_ID}.combatWeaponOrder`]: weapons.map(item => item.id) });
    return true;
  })) ?? false;
}
