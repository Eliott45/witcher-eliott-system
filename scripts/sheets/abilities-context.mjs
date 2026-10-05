import { getProfessionAbility } from "../data/professions.mjs";
import { getRace } from "../data/races.mjs";
import { abilityUuid } from "../data/compendiums.mjs";
import { hasAbility, abilitySuppressed } from "../data/abilities.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";

export async function abilitiesContext(actor) {
  const items = (actor.items ?? []).filter(item => item.type === "ability");
  const used = new Set();
  const entries = await Promise.all((getRace(actor.system.details.race)?.abilities ?? []).map(async ability => {
    const owned = items.find(item => item.system.ruleId === ability.id);
    if (owned) used.add(owned.id);
    const uuid = abilityUuid(ability.id);
    const document = owned ?? await foundry.utils.fromUuid(uuid).catch(() => null);
    const readable = document?.testUserPermission(game.user, "LIMITED");
    return {
      id: owned?.id ?? "", uuid: readable ? document.uuid : uuid, fromRace: true, suppressed: abilitySuppressed(actor, ability.id),
      name: readable ? document.name : game.i18n.localize(ability.label),
      img: readable ? document.img : "icons/svg/aura.svg",
      html: readable ? document.system.description : `<p>${escapeTooltip(game.i18n.localize(ability.description))}</p>`
    };
  }));
  for (const item of items.filter(item => !used.has(item.id) && getProfessionAbility(item.system.ruleId)?.profession !== actor.system.details.profession)) entries.push({
    id: item.id, uuid: item.uuid, fromRace: false, name: item.name, img: item.img, html: item.system.description, suppressed: abilitySuppressed(actor, item.system.ruleId)
  });
  const enriched = await Promise.all(entries.map(async entry => ({ ...entry,
    description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(entry.html,
      { secrets: actor.isOwner, relativeTo: actor })
  })));
  const usedCount = actor.system.abilityState.stubbornnessUsed;
  return {
    entries: enriched, hasTrust: hasAbility(actor, "human.trust"), hasStubbornness: hasAbility(actor, "human.stubbornness"),
    trustEnabled: actor.system.abilityState.trustEnabled, stubbornnessUsed: usedCount,
    remaining: game.i18n.format("WITCHER.Abilities.Remaining", { remaining: 3 - usedCount }),
    full: usedCount === 0, exhausted: usedCount === 3
  };
}
