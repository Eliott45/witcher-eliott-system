import { SYSTEM_ID } from "../config.mjs";
import { DicePool, DICE_FACES, MAX_DICE } from "./dice-pool.mjs";

const pool = new DicePool();
let tray;

/** Foundry v14 moves the same chat input between sidebar, popout and notifications. */
export function renderDiceTray(_app, elements) {
  const input = elements["#chat-message"];
  const form = input.closest(".chat-form");
  if (!form) {
    tray?.remove();
    return;
  }
  tray ??= createDiceTray();
  form.insertBefore(tray, input);
}

function createDiceTray() {
  const localize = key => game.i18n.localize(`WITCHER.Dice.${key}`);
  const panel = document.createElement("fieldset");
  panel.className = "witcher-dice-tray";
  const legend = document.createElement("legend");
  legend.textContent = localize("Title");
  panel.append(legend);

  const dice = document.createElement("div");
  dice.className = "witcher-dice-types";
  const controls = new Map();
  for (const faces of DICE_FACES) {
    const group = document.createElement("div");
    group.className = "witcher-die";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "witcher-die-add";
    button.title = game.i18n.format("WITCHER.Dice.AddHint", { die: `d${faces}` });
    button.setAttribute("aria-label", button.title);
    const icon = document.createElement("img");
    icon.src = `icons/svg/d${faces === 100 ? 10 : faces}-grey.svg`;
    icon.alt = "";
    const label = document.createElement("span");
    label.textContent = `d${faces}`;
    button.append(icon, label);

    const count = document.createElement("input");
    count.type = "number";
    count.min = "0";
    count.max = String(MAX_DICE);
    count.step = "1";
    count.inputMode = "numeric";
    count.setAttribute("aria-label", game.i18n.format("WITCHER.Dice.Count", { die: `d${faces}` }));
    button.addEventListener("click", event => {
      event.preventDefault();
      pool.set(faces, pool.count(faces) + 1);
      refresh();
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      pool.set(faces, pool.count(faces) - 1);
      refresh();
    });
    count.addEventListener("input", () => {
      pool.set(faces, count.value);
      refresh(false);
    });
    count.addEventListener("change", () => refresh());
    // Keep number editing separate from the chat's Enter-to-send behavior.
    count.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        count.blur();
      }
    });
    controls.set(faces, { group, count });
    group.append(button, count);
    dice.append(group);
  }

  const formula = document.createElement("output");
  formula.className = "witcher-dice-formula";
  formula.setAttribute("aria-live", "polite");
  const actions = document.createElement("div");
  actions.className = "witcher-dice-actions";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = localize("Clear");
  reset.addEventListener("click", () => {
    pool.clear();
    refresh();
  });
  const roll = document.createElement("button");
  roll.type = "button";
  roll.className = "witcher-dice-roll";
  roll.addEventListener("click", async event => {
    event.preventDefault();
    if (pool.busy || !pool.formula) return;
    const pending = pool.roll(command => ui.chat.processMessage(command));
    refresh();
    try {
      await pending;
    } catch (error) {
      console.error(`${SYSTEM_ID} | Dice roll failed`, error);
      ui.notifications.error(localize("Error"));
    } finally {
      refresh();
    }
  });
  actions.append(reset, roll);
  panel.append(dice, formula, actions);

  function refresh(syncInputs = true) {
    panel.disabled = pool.busy;
    for (const [faces, { group, count }] of controls) {
      if (syncInputs) count.value = String(pool.count(faces));
      group.classList.toggle("selected", pool.count(faces) > 0);
    }
    formula.textContent = pool.formula || localize("Empty");
    reset.disabled = roll.disabled = !pool.formula || pool.busy;
    roll.textContent = localize(pool.busy ? "Rolling" : "Roll");
  }
  refresh();
  return panel;
}
