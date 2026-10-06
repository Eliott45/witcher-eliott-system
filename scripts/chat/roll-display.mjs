import { SYSTEM_ID } from "../config.mjs";

/** Client setting: wait for Dice So Nice before revealing results (off = show at once). */
export function diceSyncEnabled() {
  try { return game.settings.get(SYSTEM_ID, "waitDiceAnimation") !== false; } catch { return true; }
}
export const waitsForDice = () => Boolean(globalThis.game?.dice3d) && diceSyncEnabled();

const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Subscribe before creation so fast chat renders/DSN completions cannot be missed. */
export function trackRollDisplay() {
  // Headless consumers have no chat or animation to wait for.
  if (!globalThis.Hooks) return { flags: {}, wait: async () => {}, close: () => {} };
  const id = foundry.utils.randomID();
  let rendered, animated, messageId;
  const renderReady = new Promise(resolve => { rendered = resolve; });
  const animationReady = new Promise(resolve => { animated = resolve; });
  const completed = new Set();
  const renderHook = Hooks.on("renderChatMessageHTML", message => {
    if (message.flags[SYSTEM_ID]?.displayId === id) rendered();
  });
  const diceHook = Hooks.on("diceSoNiceRollComplete", (finishedId, companions = []) => {
    for (const finished of [finishedId, ...companions]) completed.add(finished);
    if (completed.has(messageId)) animated();
  });
  return {
    flags: { [SYSTEM_ID]: { displayId: id } },
    async wait(message) {
      if (!message) return;
      messageId = message.id;
      if (ui.chat?.rendered && message.visible) await renderReady;
      // DSN's public wait method skips animations when "immediately display chat"
      // is enabled. Its completion hook handles that mode and interactive throws too.
      // A paused animation (hidden tab, minimised window) must not block the action forever.
      if (waitsForDice() && message._dice3danimating && !completed.has(message.id)) await Promise.race([animationReady, new Promise(resolve => setTimeout(resolve, 15000))]);
      await nextPaint();
    },
    close() {
      Hooks.off("renderChatMessageHTML", renderHook);
      Hooks.off("diceSoNiceRollComplete", diceHook);
    }
  };
}
