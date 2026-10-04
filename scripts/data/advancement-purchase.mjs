import { queueActorWrite } from "./actor-writes.mjs";
import { advancementFingerprint, advancementPlan } from "./advancement.mjs";
import { professionItemData } from "./profession-item.mjs";

/** Revalidate the quoted plan, then persist balance, ranks and embedded abilities in ONE actor update. */
export function purchaseAdvancement(actor, selection, expected, localize = key => key) {
  return queueActorWrite(actor, async () => {
    const validate = () => {
      if (!actor.isOwner) throw new Error(localize("WITCHER.Advancement.NoPermission"));
      if (advancementFingerprint(actor) !== expected) throw new Error(localize("WITCHER.Advancement.Stale"));
    };
    validate();
    const plan = advancementPlan(actor, selection, localize);
    if (!plan.valid) throw new Error(localize(`WITCHER.Advancement.${plan.errors[0] ?? "Invalid"}`));
    const update = { "system.experience": plan.remaining };
    for (const row of plan.changes) {
      if (row.kind === "skills") update[`system.skills.${row.key}`] = row.target;
      else if (row.kind === "attributes") update[`system.attributes.${row.key}`] = row.target;
      else if (row.kind === "languages") {
        update["system.languages"] ??= actor.system.languages.map(entry => ({ ...entry }));
        const entry = update["system.languages"].find(entry => entry.id === row.key);
        if (entry) entry.level = row.target;
        else update["system.languages"].push({ id: row.key, name: row.name, level: row.target });
      } else if (row.kind === "profession") {
        const item = row.itemId ? { _id: row.itemId, system: { level: row.target } } : await professionItemData(row.definition, row.target);
        (update.items ??= []).push(item);
      }
    }
    // Loading a compendium can yield while another client edits this actor.
    validate();
    const result = await actor.update(update);
    if (!result) throw new Error(localize("WITCHER.Advancement.SaveFailed"));
    return plan;
  });
}

export function setExperience(actor, points, expected, localize = key => key) {
  return queueActorWrite(actor, async () => {
    if (!actor.isOwner) throw new Error(localize("WITCHER.Advancement.NoPermission"));
    if (!Number.isSafeInteger(points) || points < 0) throw new Error(localize("WITCHER.Advancement.InvalidPoints"));
    if ((actor.system.experience ?? 0) !== expected) throw new Error(localize("WITCHER.Advancement.Stale"));
    return actor.update({ "system.experience": points });
  });
}
