import { SYSTEM_ID } from "../config.mjs";
import { getProfession, getProfessionAbility, professionAbilityState, COMBAT_SKILLS } from "../data/professions.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";
import { queueActorWrite, pendingActorWrite } from "../data/actor-writes.mjs";
import { professionItemData } from "../data/profession-item.mjs";

export function professionContext(actor) {
  const definition = getProfession(actor.system.details.profession);
  if (!definition) return null;
  const localize = key => game.i18n.localize(key);
  const entries = definition.abilities.map(ability => {
    const state = professionAbilityState(actor, ability);
    return { ...ability, level: state.level, unlocked: state.unlocked, prerequisite: state.prerequisite, itemId: state.owned?.id ?? "", uuid: `Compendium.${SYSTEM_ID}.abilities.Item.${ability.documentId}`,
      total: state.attribute === null ? "—" : state.attribute + state.level + state.bonus,
      rollHint: `${ability.name}: 1d10 + ${state.attribute ?? "—"} + ${state.level}${state.bonus ? ` + (${state.bonus})` : ""}`,
      rollUnavailable: !ability.attribute || state.attribute === null || !conditionRules(actor).canAct,
      attributeLabel: ability.attribute ? localize(`WITCHER.Attributes.${ability.attribute}.Short`) : localize("WITCHER.Professions.Passive") };
  });
  return { ...definition, uuid: `Compendium.${SYSTEM_ID}.professions.Item.${definition.documentId}`,
    skillNames: definition.skills.map(key => localize(`WITCHER.Skills.Entries.${key}.Label`)).join(" · "),
    combatSkillNames: definition.id === "man-at-arms" ? COMBAT_SKILLS.map(key => localize(`WITCHER.Skills.Entries.${key}.Label`)).join(" · ") : "",
    defining: entries[0], branches: definition.branches.map((name, index) => ({ name, entries: entries.filter(entry => entry.branch === String(index)) })) };
}

export function setProfessionLevel(actor, id, level) {
  return queueActorWrite(actor, async () => {
    if (!actor.isOwner) return;
    const definition = getProfessionAbility(id);
    if (!definition || definition.profession !== actor.system.details.profession) return;
    level = Math.max(0, Math.min(10, Math.trunc(Number(level) || 0)));
    const { owned } = professionAbilityState(actor, definition);
    if (owned) return owned.update({ "system.level": level });
    return actor.createEmbeddedDocuments("Item", [await professionItemData(definition, level)]);
  });
}

export async function rollProfessionAbility(_event, target) {
  if (!this.isEditable || target.disabled) return;
  await pendingActorWrite(this.actor).catch(() => {});
  const definition = getProfessionAbility(target.dataset.abilityId);
  if (!definition || definition.profession !== this.actor.system.details.profession || !definition.attribute || !conditionRules(this.actor).canAct) return;
  const { level, attribute, bonus } = professionAbilityState(this.actor, definition);
  if (attribute === null) return;
  const { rollActionCheck } = await import("../combat/action-economy.mjs");
  return rollActionCheck(this.actor, { formula: `1d10wc + ${attribute + level + bonus}`,
    flavor: `<span data-tooltip="${escapeTooltip(`${definition.name}: ${attribute} + ${level} + ${bonus}`)}">${escapeTooltip(definition.name)}</span>`,
    flags: { [SYSTEM_ID]: { professionCheck: { id: definition.id, level, attribute, bonus, base: attribute + level + bonus } } }
  });
}

/** Only initialize an untouched/default magic pool. Existing custom values survive profession changes. */
export function professionSelectionUpdate(actor, id) {
  const old = getProfession(actor.system.details.profession);
  const next = getProfession(id);
  return { "system.details.profession": id,
    ...(actor.system.vigor === (old?.vigor ?? 0) ? { "system.vigor": next?.vigor ?? 0 } : {}) };
}
