import { SYSTEM_ID } from "../config.mjs";
import { consumableContext, consumptionPlan, potionEffectSource, activeDoses, consumedDose, toxicityState } from "../data/consumables.mjs";
import { conditionSource, CONDITION_BY_ID, EFFECT_TEMPLATES, ALCHEMY_EFFECT_KEYS } from "../data/condition-definitions.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction } from "./transaction.mjs";
import { workshopCheck, workshopNotice } from "./check.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { trackRollDisplay } from "../chat/roll-display.mjs";
import { applyOil } from "./upgrades.mjs";
import { applyMutagen } from "./mutagens.mjs";
import { itemPresentation } from "../sheets/item-presentation.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

const pending = new WeakMap();
const poisonFromToxicity = effect => Boolean(effect.flags?.[SYSTEM_ID]?.toxicity);
const activeStatus = (actor, status) => actor.effects.filter(effect => activeEffect(effect) && effect.statuses.has(status));
const initialDC = { hallucinogen: 15, "black-venom": 16, fisstech: 16, perfume: 16 };
const standardEffect = key => {
  const source = conditionSource(EFFECT_TEMPLATES.find(entry => entry.key === key) ?? CONDITION_BY_ID[key], text => game.i18n.localize(text));
  delete source._id;
  return source;
};
async function initialEffectCheck(actor, item, key) {
  if (initialDC[key]) return workshopCheck(actor, { name: item.name, skill: "endurance", dc: initialDC[key] });
  if (key !== "chloroform") return { success: false };
  const stun = actor.system.statistics.stun;
  if (stun == null) throw new Error("Заполните параметры персонажа для испытания УСТ.");
  const target = Math.max(0, stun - 2), mode = game.settings.get("core", "messageMode"), display = trackRollDisplay();
  try {
    const roll = await new foundry.dice.Roll("1d10").evaluate({ allowInteractive: mode !== "blind" });
    const success = roll.total < target;
    const message = await roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor }),
      flavor: `${esc(item.name)} · УСТ −2: нужно меньше ${target}. ${success ? "Успех" : "Неудача"}.`,
      flags: { [SYSTEM_ID]: { ...display.flags[SYSTEM_ID], skipLuck: true } } }, { messageMode: mode });
    if (!message) throw new Error("Испытание отменено; порция не потрачена.");
    await display.wait(message);
    return { success, total: roll.total };
  } finally { display.close(); }
}
function poisonSource(actor, toxicity = false) {
  if (immuneToCondition(actor, ["poisoned"]) || activeStatus(actor, "poisoned").some(effect => poisonFromToxicity(effect) === toxicity)) return null;
  const source = standardEffect("poisoned");
  if (toxicity) {
    source.name = "Отравление: токсичность";
    source.description = "<p>3 урона за ход, игнорируя броню. Стойкость СЛ 18 снимает отравление и эффект последней выпитой дозы. Отравление также прекращается, когда токсичность опускается ниже допустимого предела.</p>";
    source.flags[SYSTEM_ID].toxicity = true;
    source.flags[SYSTEM_ID].condition.save.dc = 18;
  }
  return source;
}

/** Called within the inventory queue; no second Actor toxicity store or independent timer. */
export async function reconcileToxicity(actor, { newDose = false } = {}) {
  if (!actor.isOwner) return;
  const toxicity = toxicityState(actor), poison = actor.effects.filter(poisonFromToxicity);
  // Core/errata explicitly say "below" after poisoning, though a fresh dose at exactly
  // the limit is safe. TODO: revisit this boundary if an official clarification appears.
  if (toxicity.value < toxicity.limit || immuneToCondition(actor, ["poisoned"])) {
    if (poison.length) await actor.deleteEmbeddedDocuments("ActiveEffect", poison.map(effect => effect.id));
  } else if (newDose && toxicity.witcher && toxicity.overloaded && !poison.length) {
    const source = poisonSource(actor, true);
    if (source) await actor.createEmbeddedDocuments("ActiveEffect", [source]);
  }
}
export async function endToxicityPoison(actor, effect) {
  if (!poisonFromToxicity(effect)) return false;
  await inventoryWrite(actor, async () => {
    const last = activeDoses(actor)
      .sort((a, b) => consumedDose(b).consumedAt - consumedDose(a).consumedAt || (b.sort ?? 0) - (a.sort ?? 0)).at(0);
    await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id, ...(last ? [last.id] : [])]);
  });
  return true;
}

/** The bottle is spent on both outcomes; cancelled/unfinished checks never spend it. */
export async function consumeOwnedItem(item, { apply = true, effectKey = "" } = {}) {
  const actor = item.actor;
  if (!actor?.isOwner) return;
  return inventoryWrite(actor, async () => {
    if (!actor.items.has(item.id) || !conditionRules(actor).canAct) throw new Error("Персонаж сейчас не может использовать этот предмет.");
    if(item.system.kind === "mutagen" || item.system.alchemy?.category === "oil") throw new Error("Выберите действие применения мутагена или нанесения масла.");
    consumptionPlan(item);
    const s = item.system, witcherPotion = s.kind === "alchemy" && ["potion", "decoction"].includes(s.alchemy.category);
    let success = true;
    if (witcherPotion && apply && actor.system.details.race !== "witcher")
      success = (await workshopCheck(actor, { name: `Выпить: ${item.name}`, skill: "endurance", dc: 18 })).success;
    const effects = [], remove = [], effectUpdates = [];
    if (witcherPotion && apply) {
      if (!success) { const poison = poisonSource(actor); if (poison) effects.push(poison); }
      else if (s.ruleId === "potion.white-honey") {
        for(const effect of activeDoses(actor)) {
          if(["potion", "decoction"].includes(consumedDose(effect).category)) remove.push(effect.id);
          else effectUpdates.push({_id:effect.id,[`flags.${SYSTEM_ID}.consumable.toxicity`]:0});
        }
        remove.push(...actor.effects.filter(poisonFromToxicity).map(effect => effect.id));
      } else {
        const source = potionEffectSource(item);
        effects.push(source);
        if (s.ruleId === "potion.golden-oriole") remove.push(...activeStatus(actor, "poisoned").map(effect => effect.id));
      }
    } else if (apply) {
      if (s.ruleId === "alchemy.wives-tears") remove.push(...activeStatus(actor, "intoxicated").map(effect => effect.id));
      if (s.ruleId === "alchemy.smelling-salts") for (const status of ["stunned", "unconscious"]) remove.push(...activeStatus(actor, status).map(effect => effect.id));
      const keys = ALCHEMY_EFFECT_KEYS[s.ruleId?.replace(/^alchemy\./, "")] ?? [];
      if (effectKey && keys.includes(effectKey)) {
        // Resistance happens before creating the timed effect. Chloroform uses a plain d10, without Luck.
        const check = await initialEffectCheck(actor, item, effectKey);
        if (effectKey === "fisstech") await workshopCheck(actor, { name: `${item.name}: зависимость`, skill: "endurance", dc: 18 });
        const source = standardEffect(effectKey);
        if(effectKey === "perfume") source.flags[SYSTEM_ID].consumable = {ruleId:s.ruleId,category:"substance",toxicity:25,consumedAt:game.time.worldTime};
        if (!check.success && !immuneToCondition(actor, source.statuses) && !source.statuses.some(status => activeStatus(actor, status).length)) effects.push(source);
        if(effectKey === "fisstech" && check.total < 10 && !activeStatus(actor, "fisstech-unconscious").length) effects.push(standardEffect("fisstech-unconscious"));
      }
    }
    const toxicity = toxicityState(actor), addedToxicity = effects.reduce((sum, effect) => sum + (consumedDose(effect)?.toxicity ?? 0), 0);
    // Stable ordering even when several drinks occur without advancing world time.
    const lastOrder = Math.max(0, ...activeDoses(actor).map(effect => effect.sort ?? 0));
    effects.filter(consumedDose).forEach((effect, index) => { effect.sort = lastOrder + index + 1; });
    if(addedToxicity && toxicity.witcher && toxicity.value + addedToxicity > toxicity.limit && s.ruleId !== "potion.golden-oriole") {
      const poison = poisonSource(actor, true);
      if(poison) effects.push(poison);
    }
    // Re-read after the asynchronous roll; another client may have edited the stack.
    const plan = consumptionPlan(item);
    await inventoryTransaction(actor, { ...plan, effectCreates: effects, effectDeletes: [...new Set(remove)], effectUpdates });
    await reconcileToxicity(actor);
    const presentation = await itemPresentation(item);
    const failure = immuneToCondition(actor, ["poisoned"]) ? " Стойкость не пройдена: эффект состава не получен. От отравления защищает иммунитет." : " Стойкость не пройдена: отравление, без эффекта состава.";
    await workshopNotice(actor, `<section class="witcher-item-card"><h3>${esc(item.name)}</h3><p>${esc(actor.name)}: использована одна порция.${witcherPotion && apply ? success ? " Эффект получен." : failure : ""}</p>${presentation.description}</section>`);
    return { success, quantity: item.system.quantity, toxicity: toxicityState(actor) };
  });
}

const beneficial = new Set(["clotting", "numbing", "sterilizing", "succubus-breath", "pantagran", "smelling-salts", "wives-tears"]);
async function usageDialog(item) {
  const actor = item.actor, context = consumableContext(item);
  if (!actor?.isOwner || !context.canUse) throw new Error("Нет доступных порций при себе.");
  if (item.system.kind === "mutagen") return applyMutagen(item);
  if (item.system.alchemy?.category === "oil") {
    const weapons = actor.items.filter(weapon => weapon.type === "weapon" && !weapon.system.natural && weapon.system.category !== "shield" && weapon.system.quantity === 1 && weapon.system.carried);
    if (!weapons.length) throw new Error("Нет оружия для нанесения масла.");
    const id = await foundry.applications.api.DialogV2.prompt({ window: { title: item.name }, content: `<label>Нанести на оружие<select name="weapon">${weapons.map(weapon => `<option value="${weapon.id}">${esc(weapon.name)}</option>`).join("")}</select></label>`, ok: { label: "Нанести масло", callback: (_event, button) => new FormData(button.form).get("weapon") }, rejectClose: false });
    if (id && actor.items.has(id)) await applyOil(actor.items.get(id), item);
    return;
  }
  const s = item.system, potion = s.kind === "alchemy" && ["potion", "decoction"].includes(s.alchemy.category);
  const id = s.ruleId?.replace(/^alchemy\./, ""), keys = ALCHEMY_EFFECT_KEYS[id] ?? [];
  const self = potion || s.kind === "alchemy", defaultSelf = potion || beneficial.has(id);
  const options = self ? `<label>Применение<select name="application"><option value="self" ${defaultSelf ? "selected" : ""}>На себя</option><option value="other" ${defaultSelf ? "" : "selected"}>Израсходовать для другой цели</option></select></label>` : "<p>Порция будет израсходована, описание и эффекты появятся в чате.</p>";
  const effectOptions = keys.length ? `<label>Эффект<select name="effect">${keys.map(key => `<option value="${key}">${esc(EFFECT_TEMPLATES.find(entry => entry.key === key).name)}</option>`).join("")}</select></label>` : "";
  const presentation = await itemPresentation(item), toxicity = toxicityState(actor);
  const answer = await foundry.applications.api.DialogV2.prompt({ classes: ["witcher-eliott", "witcher-consume-dialog"], window: { title: `Использовать: ${item.name}` },
    content: `<div class="witcher-consume-description">${presentation.description}</div>${options}${effectOptions}<p>Осталось применений: <strong>${context.remaining}</strong>.</p>${potion ? `<p>Токсичность: ${toxicity.value} / ${toxicity.limit}%.${toxicity.witcher ? "" : " При употреблении: Стойкость СЛ 18. Неудача — отравление без эффекта состава."}</p>` : ""}`,
    ok: { label: "Использовать", callback: (_event, button) => Object.fromEntries(new FormData(button.form)) }, rejectClose: false });
  if (answer) return consumeOwnedItem(item, { apply: self && answer.application === "self", effectKey: answer.effect ?? "" });
}
/** Double clicks (including clicks on two different sheets) share one pending dialog/use. */
export function useConsumable(item) {
  const actor = item?.actor;
  if (!actor?.isOwner) return;
  if (pending.has(actor)) return pending.get(actor);
  const work = usageDialog(item).finally(() => pending.delete(actor));
  pending.set(actor, work);
  return work;
}
export function registerConsumption() {
  const reconcile = effect => {
    const actor = effect.parent;
    if (actor?.documentName !== "Actor" || game.user !== (game.users.activeGM ?? game.users.find(user => user.active && actor.testUserPermission(user, "OWNER")))) return;
    if (consumedDose(effect)) inventoryWrite(actor, () => reconcileToxicity(actor, { newDose: consumedDose(effect).ruleId === "potion.golden-oriole" })).catch(error => console.error(`${SYSTEM_ID} | Toxicity`, error));
  };
  for (const hook of ["deleteActiveEffect", "updateActiveEffect"]) Hooks.on(hook, reconcile);
}
