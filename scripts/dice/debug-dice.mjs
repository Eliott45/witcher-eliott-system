import { SYSTEM_ID } from "../config.mjs";

// GM-only testing aid: queue exact die faces for the next rolls ("10, 4" for d10, or "d6: 6; d10: 1, 7").
// Each forced value is used once, then rolls are random again. Core «Dice Configuration → Manual» is the
// alternative when every roll should ask for a value.

/** "10, 4" → {10:[10,4]}; "d6: 6; d10: 1, 7" → {6:[6], 10:[1,7]}. Out-of-range values are dropped. */
export function parseDebugDice(text = "") {
  const queues = {};
  for (const group of String(text).split(";").map(part => part.trim()).filter(Boolean)) {
    const match = group.match(/^d(\d+)\s*:\s*(.*)$/iu), faces = match ? Number(match[1]) : 10;
    const values = (match ? match[2] : group).split(/[,\s]+/u).map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= faces);
    if (values.length) (queues[faces] ??= []).push(...values);
  }
  return queues;
}
export const formatDebugDice = queues => Object.entries(queues).filter(([, values]) => values.length)
  .map(([faces, values]) => `d${faces}: ${values.join(", ")}`).join("; ");

let queues = {};
const load = () => { try { queues = parseDebugDice(game.settings.get(SYSTEM_ID, "debugDice")); } catch { queues = {}; } };

export function registerDebugDice() {
  game.settings.register(SYSTEM_ID, "debugDice", {
    name: "WITCHER.Settings.DebugDice", hint: "WITCHER.Settings.DebugDiceHint",
    scope: "client", config: true, type: String, default: "", onChange: load
  });
  const DiceTerm = foundry.dice.terms.DiceTerm, original = DiceTerm.prototype.mapRandomFace;
  DiceTerm.prototype.mapRandomFace = function (randomUniform) {
    const queue = game.user?.isGM ? queues[this.faces] : null;
    if (!queue?.length) return original.call(this, randomUniform);
    const value = queue.shift();
    ui.notifications?.info(`Отладка кубиков: d${this.faces} = ${value}${queue.length ? ` (в очереди ещё ${queue.length})` : ""}`);
    game.settings.set(SYSTEM_ID, "debugDice", formatDebugDice(queues)).catch(console.error);
    return value;
  };
  Hooks.once("ready", load);
}
