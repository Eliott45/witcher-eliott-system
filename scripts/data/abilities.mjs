import { getRace } from "./races.mjs";

export function additionalAbilityIds(actor) {
  return (actor.items ?? []).filter(item => item.type === "ability").map(item => item.system.ruleId).filter(Boolean);
}

export function hasAbility(actor, id) {
  return getRace(actor.system.details.race)?.abilities.some(ability => ability.id === id)
    || additionalAbilityIds(actor).includes(id);
}

const counterWrites = new Map();
export function adjustStubbornness(actor, change) {
  if (!actor.isOwner || !hasAbility(actor, "human.stubbornness") || ![-1, 0, 1].includes(change)) return Promise.resolve();
  const previous = counterWrites.get(actor.uuid) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(() => {
    if (!actor.isOwner || !hasAbility(actor, "human.stubbornness")) return;
    const used = change === 0 ? 0 : Math.min(3, Math.max(0, actor.system.abilityState.stubbornnessUsed + change));
    return actor.update({ "system.abilityState.stubbornnessUsed": used });
  });
  counterWrites.set(actor.uuid, work);
  const clear = () => { if (counterWrites.get(actor.uuid) === work) counterWrites.delete(actor.uuid); };
  work.then(clear, clear);
  return work;
}
