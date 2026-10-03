import { SYSTEM_ID } from "../config.mjs";
import { getProfession, getProfessionAbility, professionAbilityState, COMBAT_SKILLS } from "../data/professions.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";

export function professionContext(actor) {
  const definition = getProfession(actor.system.details.profession);
  if (!definition) return null;
  const localize = key => game.i18n.localize(key);
  const entries = definition.abilities.map(ability => {
    const state = professionAbilityState(actor, ability);
    return { ...ability, level: state.level, unlocked: state.unlocked, prerequisite: state.prerequisite, itemId: state.owned?.id ?? "", uuid: `Compendium.${SYSTEM_ID}.abilities.Item.${ability.documentId}`,
      total: state.attribute === null ? "—" : state.attribute + state.level,
      rollUnavailable: !ability.attribute || state.attribute === null || !conditionRules(actor).canAct,
      attributeLabel: ability.attribute ? localize(`WITCHER.Attributes.${ability.attribute}.Short`) : localize("WITCHER.Professions.Passive") };
  });
  return { ...definition, uuid: `Compendium.${SYSTEM_ID}.professions.Item.${definition.documentId}`,
    skillNames: definition.skills.map(key => localize(`WITCHER.Skills.Entries.${key}.Label`)).join(" · "),
    combatSkillNames: definition.id === "man-at-arms" ? COMBAT_SKILLS.map(key => localize(`WITCHER.Skills.Entries.${key}.Label`)).join(" · ") : "",
    defining: entries[0], branches: definition.branches.map((name, index) => ({ name, entries: entries.filter(entry => entry.branch === String(index)) })) };
}

const writes = new WeakMap();
export function setProfessionLevel(actor, id, level) {
  const previous = writes.get(actor) ?? Promise.resolve();
  const work = previous.then(async () => {
    if (!actor.isOwner) return;
    const definition = getProfessionAbility(id);
    if (!definition || definition.profession !== actor.system.details.profession) return;
    level = Math.max(0, Math.min(10, Math.trunc(Number(level) || 0)));
    const { owned } = professionAbilityState(actor, definition);
    if (owned) return owned.update({ "system.level": level });
    const source = await foundry.utils.fromUuid(`Compendium.${SYSTEM_ID}.abilities.Item.${definition.documentId}`);
    const data = source ? source.toObject() : { name: definition.name, type: "ability", img: "icons/svg/book.svg",
      system: { ruleId: definition.id, description: `<p>${escapeTooltip(definition.description)}</p>`, attribute: definition.attribute } };
    delete data._id;
    delete data.folder;
    data.system.level = level;
    return actor.createEmbeddedDocuments("Item", [data]);
  });
  writes.set(actor, work.catch(() => {}));
  return work;
}

export async function rollProfessionAbility(_event, target) {
  if (!this.isEditable || target.disabled) return;
  await (writes.get(this.actor) ?? Promise.resolve());
  const definition = getProfessionAbility(target.dataset.abilityId);
  if (!definition || definition.profession !== this.actor.system.details.profession || !definition.attribute || !conditionRules(this.actor).canAct) return;
  const { level, attribute } = professionAbilityState(this.actor, definition);
  if (attribute === null) return;
  const messageMode = game.settings.get("core", "messageMode");
  const roll = await new foundry.dice.Roll(`1d10wc + ${attribute + level}`).evaluate({ allowInteractive: messageMode !== "blind" });
  return roll.toMessage({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this.actor }),
    flavor: `<span data-tooltip="${escapeTooltip(`${definition.name}: ${attribute} + ${level}`)}">${escapeTooltip(definition.name)}</span>`,
    flags: { [SYSTEM_ID]: { professionCheck: { id: definition.id, level, attribute, base: attribute + level } } }
  }, { messageMode });
}

/** Only initialize an untouched/default magic pool. Existing custom values survive profession changes. */
export function professionSelectionUpdate(actor, id) {
  const old = getProfession(actor.system.details.profession);
  const next = getProfession(id);
  return { "system.details.profession": id,
    ...(actor.system.vigor === (old?.vigor ?? 0) ? { "system.vigor": next?.vigor ?? 0 } : {}) };
}
