import { SYSTEM_ID } from "../config.mjs";
import { bestiarySources, bestiaryFolders, bestiaryPreset, harvestItemName } from "../data/bestiary.mjs";
import { bookSource } from "../data/book-references.mjs";
export function registerBestiaryMigration(){game.settings.register(SYSTEM_ID,"bestiaryContentVersion",{scope:"world",config:false,type:Number,default:0});}

/** Repair the initial pack's missing embedded records through the live Foundry API. */
export async function migrateBestiaryContent() {
  if(game.user!==game.users.activeGM||game.settings.get(SYSTEM_ID,"bestiaryContentVersion")>=1)return;
  const pack=game.packs.get(`${SYSTEM_ID}.bestiary`);if(!pack)return;
  const documents=await pack.getDocuments(),locked=pack.locked;
  const repairs=bestiarySources().flatMap(source=>{
    const actor=documents.find(actor=>actor.id===source._id);
    // A nonempty collection may be user-edited; leave it intact.
    return actor&&!actor.items.size?[{actor,items:source.items}]:[];
  });
  try {
    if(locked&&repairs.length)await pack.configure({locked:false});
    for(const {actor,items} of repairs) {
      const created=await actor.createEmbeddedDocuments("Item",items,{keepId:true});
      if(created.length!==items.length)throw new Error(`Не удалось восстановить все предметы: ${actor.name}`);
    }
    await game.settings.set(SYSTEM_ID,"bestiaryContentVersion",1);
  } finally {if(locked&&repairs.length)await pack.configure({locked:true});}
}

/** Version 2 (core pp.270–313): append creatures the world pack does not have yet; existing ones stay as edited. */
export const migrateBestiaryCreatures = () => appendMissingCreatures(2);
/** Version 5 (Monster Hunter's Journal p.26): barghests, the barghest leader and Kai. */
export const migrateBestiaryJournalCreatures = () => appendMissingCreatures(5);
/** Version 6: Radolf Kazmer, a named GM character from Radolf's wagon. */
export const migrateBestiaryRadolf = () => appendMissingCreatures(6);
/** Version 7 (Monster Hunter's Journal pp.16–21): graveir, foglet and rotfiend. */
export const migrateBestiaryJournalNecrophages = () => appendMissingCreatures(7);
/** Version 9 (Monster Hunter's Journal pp.28–31): the hym, the pesta and her plague rat swarm. */
export const migrateBestiaryJournalSpirits = () => appendMissingCreatures(9);
/** Version 10 (Monster Hunter's Journal pp.36–51): beasts and cursed ones, with their sidebar variants. */
export const migrateBestiaryJournalBeasts = () => appendMissingCreatures(10);

async function appendMissingCreatures(version) {
  if(game.user!==game.users.activeGM||game.settings.get(SYSTEM_ID,"bestiaryContentVersion")>=version)return;
  const pack=game.packs.get(`${SYSTEM_ID}.bestiary`);if(!pack)return;
  const index=await pack.getIndex(),locked=pack.locked;
  const missing=bestiarySources().filter(source=>!index.has(source._id));
  try {
    if(locked&&missing.length)await pack.configure({locked:false});
    if(missing.length) {
      const folders=bestiaryFolders().filter(folder=>missing.some(source=>source.folder===folder._id)&&!pack.folders.has(folder._id));
      if(folders.length)await foundry.documents.Folder.implementation.createDocuments(folders,{pack:pack.collection,keepId:true});
      const created=await Actor.implementation.createDocuments(missing.map(source=>foundry.utils.deepClone(source)),{pack:pack.collection,keepId:true});
      const createdIds=new Set(created.map(actor=>actor.id));
      if(missing.some(source=>!createdIds.has(source._id)))throw new Error("Не удалось добавить всех существ бестиария. Повторная загрузка продолжит миграцию.");
    }
    await game.settings.set(SYSTEM_ID,"bestiaryContentVersion",version);
    if(missing.length)ui.notifications.info(`Бестиарий: добавлено существ — ${missing.length}.`);
  } finally {if(locked&&missing.length)await pack.configure({locked:true});}
}

const JOURNAL_BOOK = "Дневник охотника на чудовищ";
const FILLED = ["difficulty", "size", "weight", "habitat", "intellect"];
/**
 * Monster Hunter's Journal refresh of one actor: text loot that now has a catalog item becomes a harvest row,
 * blank printed fields are filled (the basic barghest), and abilities added to the profile later are appended.
 * Edited values, edited rows and existing items stay as they are.
 */
export function journalCreatureRefresh(actor, source) {
  if (!source || bookSource(source.system.creature?.source) !== JOURNAL_BOOK) return null;
  const creature = actor.system?.creature ?? {}, loot = creature.loot ?? [], have = new Set((actor.system?.harvest ?? []).map(row => row.uuid));
  const added = (source.system.harvest ?? []).filter(row => !have.has(row.uuid) && loot.some(entry => entry.name === harvestItemName(row.uuid)));
  const update = {};
  if (added.length) {
    const names = new Set(added.map(row => harvestItemName(row.uuid)));
    update["system.harvest"] = [...(actor.system.harvest ?? []), ...structuredClone(added)];
    update["system.creature.loot"] = loot.filter(entry => !names.has(entry.name));
  }
  for (const key of FILLED) if (!creature[key] && source.system.creature[key]) update[`system.creature.${key}`] = source.system.creature[key];
  if (!creature.reward && source.system.creature.reward) update["system.creature.reward"] = source.system.creature.reward;
  if (creature.group === "Стая" && source.system.creature.group !== "Стая") update["system.creature.group"] = source.system.creature.group;
  const ids = new Set(Array.from(actor.items ?? [], item => item.id ?? item._id)), rules = new Set(Array.from(actor.items ?? [], item => item.system?.ruleId));
  const items = source.items.filter(item => item.type === "ability" && !ids.has(item._id) && !rules.has(item.system.ruleId)).map(item => structuredClone(item));
  return Object.keys(update).length || items.length ? { update, items } : null;
}
async function applyJournalRefresh(actor, plan, options = {}) {
  if (Object.keys(plan.update).length) await actor.update(plan.update, options);
  if (plan.items.length) await actor.createEmbeddedDocuments("Item", plan.items, { keepId: true, ...options });
}
/** Version 8: the journal creatures in the world pack and world actors imported from it. */
export async function migrateBestiaryJournalRefresh() {
  if (game.user !== game.users.activeGM || game.settings.get(SYSTEM_ID, "bestiaryContentVersion") >= 8) return;
  const pack = game.packs.get(`${SYSTEM_ID}.bestiary`);
  if (pack) {
    const sources = new Map(bestiarySources().map(source => [source._id, source]));
    const plans = (await pack.getDocuments()).map(actor => ({ actor, plan: journalCreatureRefresh(actor, sources.get(actor.id)) })).filter(entry => entry.plan);
    const locked = pack.locked;
    try {
      if (locked && plans.length) await pack.configure({ locked: false });
      for (const { actor, plan } of plans) await applyJournalRefresh(actor, plan);
    } finally { if (locked && plans.length) await pack.configure({ locked: true }); }
  }
  for (const actor of game.actors ?? []) {
    const plan = journalCreatureRefresh(actor, bestiaryPreset(actor));
    if (plan) await applyJournalRefresh(actor, plan);
  }
  await game.settings.set(SYSTEM_ID, "bestiaryContentVersion", 8);
}
