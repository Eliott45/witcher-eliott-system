import { SYSTEM_ID } from "../config.mjs";
import { hasAbility, withStubbornnessLock } from "../data/abilities.mjs";
import { escapeTooltip } from "../sheets/statistics-tooltips.mjs";
import { trackRollDisplay } from "./roll-display.mjs";

const eligibleSkills = new Set(["courage", "resistCoercion"]);
const flagPath = `flags.${SYSTEM_ID}.stubbornness`;
const label = (key, values) => values ? game.i18n.format(`WITCHER.Stubbornness.${key}`, values)
  : game.i18n.localize(`WITCHER.Stubbornness.${key}`);

export function stubbornnessState(message) {
  const flags = message.flags[SYSTEM_ID] ?? {};
  const actor = message.speakerActor;
  const eligible = eligibleSkills.has(flags.skillCheck?.key) && !flags.stubbornnessReroll
    && message.rolls.length === 1 && Number.isFinite(message.rolls[0].total);
  const remaining = actor ? Math.max(0, 3 - actor.system.abilityState.stubbornnessUsed) : 0;
  const available = eligible && actor?.isOwner && message.isOwner && message.isContentVisible
    && hasAbility(actor, "human.stubbornness") && remaining > 0 && !flags.stubbornness;
  return { actor, eligible, available: Boolean(available), remaining, result: flags.stubbornness };
}

/** Preserve the original audience even if the player's current chat mode has changed. */
export function stubbornnessMessageMode(message) {
  return message.blind ? "blind" : message.whisper.length ? "gm" : "public";
}

export async function rerollStubbornness(source) {
  const actor = source.speakerActor;
  if (!actor) return;
  return withStubbornnessLock(actor, async () => {
    if (!stubbornnessState(source).available) return;
    const used = actor.system.abilityState.stubbornnessUsed;
    const claim = foundry.utils.randomID();
    let charged = false, posted;
    const display = trackRollDisplay();
    try {
      // Persist the claim before rolling: reopening chat cannot offer a second attempt.
      await source.update({ [flagPath]: { state: "pending", claim } });
      await actor.update({ "system.abilityState.stubbornnessUsed": used + 1 });
      charged = true;
      const original = source.rolls[0];
      // Rebuild from formula, never clone evaluated dice/options: a cloned wc chain
      // would retain its old continuation metadata. The formula already includes Luck.
      const roll = await new foundry.dice.Roll(original.formula).evaluate({ allowInteractive: !source.blind });
      const result = { state: "complete", claim, original: original.total, rerolled: roll.total,
        kept: Math.max(original.total, roll.total), sourceId: source.id };
      const flags = source.flags[SYSTEM_ID];
      const name = game.i18n.localize(`WITCHER.Skills.Entries.${flags.skillCheck.key}.Label`);
      const luck = flags.luck ? { bonus: flags.luck.bonus, rollIndex: 0 } : undefined;
      const luckHint = luck?.bonus ? `<small>${escapeTooltip(label("LuckKept", { value: luck.bonus }))}</small>` : "";
      posted = await roll.toMessage({
        speaker: { ...source.speaker }, whisper: [...source.whisper], blind: source.blind,
        flavor: `<strong>${escapeTooltip(label("Reroll"))} · ${escapeTooltip(name)}</strong>${luckHint}`,
        flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true, ...(luck ? { luck } : {}),
          skillCheck: { ...flags.skillCheck }, stubbornnessReroll: result } }
      }, { messageMode: stubbornnessMessageMode(source) });
      if (!posted) throw new Error("Stubbornness chat creation was cancelled");
      await display.wait(posted);
      await source.update({ [flagPath]: { ...result, rerollId: posted.id } });
      return posted;
    } catch (error) {
      if (!posted) {
        // Refund only before a result exists. A posted roll must never become a free retry.
        if (charged) await actor.update({ "system.abilityState.stubbornnessUsed": used });
        await source.update({ [flagPath]: null });
      }
      throw error;
    } finally { display.close(); }
  });
}

function resultHTML(result) {
  return `<strong>${escapeTooltip(label("Kept", { value: result.kept }))}</strong>
    <small>${escapeTooltip(label("Comparison", { original: result.original, rerolled: result.rerolled }))}</small>
    <small>${escapeTooltip(label("Spent"))}</small>`;
}

export function renderStubbornness(message, html) {
  if (!message.isContentVisible) return;
  html.querySelector(".witcher-chat-stubbornness")?.remove();
  const reroll = message.flags[SYSTEM_ID]?.stubbornnessReroll;
  const state = stubbornnessState(message);
  if (!reroll && !state.eligible) return;
  const panel = document.createElement("section");
  panel.className = "witcher-chat-stubbornness";
  if (reroll || state.result?.state === "complete") panel.innerHTML = resultHTML(reroll ?? state.result);
  else if (state.result?.state === "pending") panel.textContent = label("Pending");
  else if (state.available) {
    panel.innerHTML = `<small>${escapeTooltip(label("Hint"))}</small><button type="button"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> ${escapeTooltip(label("Button", { remaining: state.remaining }))}</button>`;
    panel.querySelector("button").addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await rerollStubbornness(message); }
      catch (error) {
        console.error(`${SYSTEM_ID} | Stubbornness reroll failed`, error);
        ui.notifications.error(label("Error"));
      } finally { button.disabled = !stubbornnessState(message).available; }
    });
  } else return;
  html.querySelector(".message-content")?.append(panel);
}

export function registerStubbornnessChat() {
  Hooks.on("renderChatMessageHTML", renderStubbornness);
  // The old cards must stop offering a charge after a different check uses the last one.
  const refresh = actor => {
    if (!ui.chat?.rendered) return;
    for (const message of game.messages) {
      if (message.speakerActor?.uuid === actor.uuid && eligibleSkills.has(message.flags[SYSTEM_ID]?.skillCheck?.key))
        ui.chat.updateMessage(message, { notify: false });
    }
  };
  Hooks.on("updateActor", refresh);
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, item => {
    if (item.type === "ability" && item.parent?.documentName === "Actor") refresh(item.parent);
  });
}
