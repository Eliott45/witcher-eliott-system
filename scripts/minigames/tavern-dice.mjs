/** Tavern checks are rolled on the GM's client in the middle of a move, so a critical chain must never wait for
 * the manual-critical prompt: that would stall the player's move and leak hidden checks into the chat.
 * The chain itself follows the system rules: a 10 adds the next d10 (and keeps going on 10s), a 1 counts as 0
 * and subtracts the next d10 (a 10 there keeps subtracting). */
const MAX_CHAIN = 100;
const plainD10 = async () => (await new Roll("1d10").evaluate()).total;
export async function tavernD10(roll = plainD10) {
  const faces = [await roll()];
  if (faces[0] !== 1 && faces[0] !== 10) return { value: faces[0], faces, crit: "" };
  const negative = faces[0] === 1;
  let value = negative ? 0 : 10;
  for (let step = 0; step < MAX_CHAIN; step++) {
    const next = await roll();
    faces.push(next); value += negative ? -next : next;
    if (next !== 10) break;
  }
  return { value, faces, crit: negative ? "fumble" : "critical" };
}
/** A full check: d10 with its chain plus a flat base. */
export async function tavernCheck(base, roll = plainD10) {
  const die = await tavernD10(roll);
  return { total: base + die.value, die: die.value, faces: die.faces, crit: die.crit };
}
/** «10 → 4» or «1 → 6» for a table that wants to show why a check exploded. */
export const critText = faces => faces?.length > 1 ? `${faces[0] === 1 ? "Провал" : "Крит"}: ${faces.join(" → ")}` : "";
