import { SYSTEM_ID } from "../../config.mjs";
import { canPlay, diceLanded, teardownStage, settleTokens, speakerToken, seen, placedToken } from "./fx-core.mjs";
import { bodySilhouette, registerBattleFx } from "./battle-fx.mjs";
import { heatRay } from "./spell-fx.mjs";
import { playExchange, playDamage, clearStains } from "./combat-fx.mjs";
import { castFlourish, registerSignFx } from "./sign-fx.mjs";
import { registerScreenFx } from "./screen-fx.mjs";
import { registerTableFx } from "./table-fx.mjs";

// Chat messages drive the animation: every client sees a defense, an applied blow or a cast arrive and plays it
// locally once the dice have landed. Messages a viewer cannot read animate nothing for that viewer.

/** The struck part over the target of the attack a step belongs to. */
function showLocation(message, location, options = {}) {
  const attack = game.messages.get(message.flags?.[SYSTEM_ID]?.exchange?.attack)?.flags?.[SYSTEM_ID]?.weaponAttack, target = placedToken(attack?.target);
  if (location && target && seen(target)) bodySilhouette(target, location, options);
}

async function animate(message) {
  if (!canPlay() || !message.visible || message.isContentVisible === false) return;
  const flags = message.flags?.[SYSTEM_ID] ?? {}, kind = flags.exchange?.kind;
  if (flags.cadfanHeat && !flags.cadfanHeat.choice) {
    // Cadfan's Grasp on an enemy's weapon: heat runs from the caster to the holder.
    const holder = fromUuidSync(flags.cadfanHeat.actor)?.getActiveTokens?.()[0];
    if (holder && seen(holder)) heatRay(speakerToken(message), holder);
    return;
  }
  if (kind !== "defense" && kind !== "applied" && kind !== "location" && !flags.magicCast) return;
  await diceLanded(message);
  if (!canPlay()) return;
  if (kind === "defense") return playExchange(message);
  if (kind === "location") return showLocation(message, flags.exchange.location?.id);
  if (kind === "applied") {
    // A critical wound cracks the part it struck.
    if (flags.exchange.critical) {
      const link = flags.exchange, damage = game.messages.find(entry => { const other = entry.flags?.[SYSTEM_ID]?.exchange; return other?.attack === link.attack && other.index === link.index && other.kind === "damage"; });
      showLocation(message, damage?.flags?.[SYSTEM_ID]?.exchange?.location?.id, { crack: true });
    }
    return playDamage(message);
  }
  return castFlourish(message);
}

/** Blood and leftovers of past blows go away; Yrden circles and Quen shields stay, they follow real effects. */
export function clearLeftovers() {
  clearStains();
  settleTokens();
}

/**
 * The broom in the token controls. A player cleans their own screen; the GM cleans everyone's by bumping a hidden
 * world setting, whose update reaches every client.
 */
async function sweep() {
  clearLeftovers();
  if (game.user.isGM) await game.settings.set(SYSTEM_ID, "combatEffectsCleanup", Date.now());
  ui.notifications.info(game.i18n.localize(game.user.isGM ? "WITCHER.Settings.ClearCombatEffectsAll" : "WITCHER.Settings.ClearCombatEffectsDone"));
}

export function registerCombatEffects() {
  Hooks.on("createChatMessage", message => { animate(message).catch(error => console.error(`${SYSTEM_ID} | FX`, error)); });
  Hooks.on("canvasTearDown", () => teardownStage());
  // The first sweep creates the setting document, later ones update it.
  for (const hook of ["createSetting", "updateSetting"]) Hooks.on(hook, setting => { if (setting.key === `${SYSTEM_ID}.combatEffectsCleanup`) clearLeftovers(); });
  Hooks.on("getSceneControlButtons", controls => {
    const tokens = controls.tokens ?? controls.token;
    if (!tokens?.tools) return;
    tokens.tools.witcherClearEffects = { name: "witcherClearEffects", title: "WITCHER.Settings.ClearCombatEffects", icon: "fa-solid fa-broom", order: 91, button: true,
      onChange: () => sweep().catch(error => ui.notifications.error(error.message)) };
  });
  registerSignFx();
  registerScreenFx();
  registerTableFx();
  registerBattleFx();
}
