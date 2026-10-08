import { available } from "../data/workshop.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { inventoryTransaction, copyPhysical } from "./transaction.mjs";
import { workshopCheck, workshopNotice } from "./check.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { MUTAGENS } from "../data/workshop-alchemy.mjs";
import { equipmentUuid } from "../data/workshop.mjs";
import { setStatus, hasStatus, DEAD, DYING } from "../combat/status-effects.mjs";

export async function prepareMutagen(item) {
  const actor=item.actor;if(!actor?.isOwner)return;
  if(item.system.kind!=="mutagen" || !available(item) || item.system.mutagen.prepared)throw new Error("Нужен неподготовленный мутаген при себе.");
  const helpers=game.actors.filter(entry=>entry.isOwner);
  const answer=await foundry.applications.api.DialogV2.prompt({window:{title:"Подготовка мутагена"},content:`<p>${esc(item.name)}. Алхимия СЛ ${item.system.mutagen.dc}; 1 час.</p><label>Проверку выполняет<select name="helper">${helpers.map(helper=>`<option value="${helper.id}" ${helper.id===actor.id?"selected":""}>${esc(helper.name)}</option>`).join("")}</select></label><label><input name="time" type="checkbox"> Час подготовки завершён; инструменты алхимика доступны</label><p>Обрабатывается одна порция. Неудачная подготовка расходует её.</p>`,ok:{label:"Подготовить",callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});
  if(!answer)return;if(!answer.time)throw new Error("Подтвердите подготовку и доступ к инструментам.");
  const helper=game.actors.get(answer.helper);if(!helper?.isOwner)return;
  return inventoryWrite(actor,async()=>{
    if(!available(item)||item.system.mutagen.prepared)throw new Error("Мутаген уже использован.");
    const check=await workshopCheck(helper,{name:`Подготовка: ${item.name}`,skill:"alchemy",dc:item.system.mutagen.dc});
    if(!available(item)||item.system.mutagen.prepared)throw new Error("Мутаген изменился во время проверки; порция не потрачена.");
    const data=copyPhysical(item,1);data.system.mutagen.prepared=true;
    await inventoryTransaction(actor,{expenses:[{itemId:item.id,quantity:1}],creates:check.success?[data]:[]});
  });
}
export async function applyMutagen(item) {
  const actor=item.actor;if(!actor?.isOwner)return;
  const eligible=()=>actor.system.details.race==="witcher" && item.system.kind==="mutagen" && item.system.mutagen.prepared && available(item) && actor.system.mutations.length<2;
  if(!eligible())throw new Error("Нужен ведьмак, подготовленная порция и свободный слот мутагена (максимум 2).");
  const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:"Постоянная мутация"},content:`<p>${esc(item.name)} будет израсходован. Бонус станет постоянным, удалить мутаген нельзя. Свободных слотов: ${2-actor.system.mutations.length}.</p><p>${esc(item.system.properties)}</p>`,rejectClose:false});
  if(!confirmed)return;
  return inventoryWrite(actor,async()=>{
    if(!eligible())throw new Error("Слоты или мутаген уже изменились.");
    const mutation={id:foundry.utils.randomID(),sourceUuid:item._stats.compendiumSource||item.uuid,name:item.name,monster:item.system.mutagen.monster,category:"mutagen",properties:item.system.properties,bonuses:foundry.utils.deepClone(item.system.mutagen.bonuses)};
    await inventoryTransaction(actor,{expenses:[{itemId:item.id,quantity:1}],actorUpdate:{"system.mutations":[...actor.system.mutations,mutation]}});
    await workshopNotice(actor,`<p>${esc(actor.name)}: применён ${esc(item.name)}. Эффект постоянный.</p>`);
  });
}
/** Loot is configured on an NPC; no implicit access to someone else's inventory or infinite harvesting. */
export async function harvestMaterial(npc,id) {
  if(!npc.isOwner)return;
  const selected=npc.system.harvest.find(row=>row.id===id),entry=selected?{...selected}:null;
  if(!entry||entry.attempted)throw new Error("Добыча уже собрана или попытка извлечения потрачена.");
  if(entry.formula&&!npc.system.creature.lootGenerated)throw new Error("Сначала нажмите «Бросить добычу» во вкладке «Инвентарь».");
  if(entry.quantity<=0)throw new Error("Этого материала в добыче нет.");
  const source=await foundry.utils.fromUuid(entry.uuid);if(!source)throw new Error("Исходный материал недоступен.");
  const actors=game.actors.filter(actor=>actor.isOwner&&actor.id!==npc.id);
  const targetId=await foundry.applications.api.DialogV2.prompt({window:{title:"Получатель добычи"},content:`<label>Персонаж<select name="actor">${actors.map(actor=>`<option value="${actor.id}">${esc(actor.name)}</option>`).join("")}</select></label><p>${esc(source.name)} ×${entry.quantity}. ${entry.skill?`СЛ ${entry.dc}`:"Проверка для этой добычи не задана"}.</p>`,ok:{label:"Извлечь",callback:(_e,b)=>new FormData(b.form).get("actor")},rejectClose:false});
  const actor=game.actors.get(targetId);if(!actor?.isOwner)return;
  return inventoryWrite(npc,async()=>{
    const unchanged=()=>{const row=npc.system.harvest.find(row=>row.id===id);return row&&!row.attempted&&["uuid","quantity","skill","dc","formula"].every(key=>row[key]===entry[key]);};
    if(!unchanged())throw new Error("Добыча изменилась. Откройте извлечение заново.");
    const check=entry.skill?await workshopCheck(actor,{name:`Извлечение: ${source.name}`,skill:entry.skill,dc:entry.dc}):{success:true};
    if(!unchanged())throw new Error("Добыча изменилась во время проверки. Предметы не выданы.");
    // Mark before transfer; restore the flag on a failed transfer, never award the same row twice.
    await npc.update({"system.harvest":npc.system.harvest.map(row=>row.id===id?{...row,attempted:true}:row)});
    try {
      if(check.success)await inventoryWrite(actor,()=>actor.createEmbeddedDocuments("Item",[copyPhysical(source,entry.quantity)]));
    } catch(error){await npc.update({"system.harvest":npc.system.harvest.map(row=>row.id===id?{...row,attempted:false}:row)});throw error;}
    await workshopNotice(actor,`<p>${esc(npc.name)}: ${check.success?`получено ${esc(source.name)} ×${entry.quantity}`:"извлечь материал не удалось"}.</p>`);
  });
}

// Core p.251 «Мутагены». Drinking is one process: an hour of preparation, an Alchemy check (by the witcher
// or a companion) at the mutagen's DC, then the effect becomes permanent (two mutagens at most).
// Sidebar «Мутирование»: anyone else is poisoned at once (Endurance DC 18, or a companion's First Aid DC 18,
// ends it); a mage with Mutation can mutate them instead — full day, all of the mage's STA,
// DC 28 − (BODY + WILL)/2: success grants the mutagen and its minor mutation, failure leaves the subject dying.
export const MUTATION_SKILL = "profession.mage.mutation";
export const mutationDC = actor => 28 - Math.floor(((actor.system.statistics.effective.body ?? 0) + (actor.system.statistics.effective.will ?? 0)) / 2);
const mutationRecord = (item, { minor = false, bonuses = true } = {}) => ({ id: foundry.utils.randomID(), sourceUuid: item._stats?.compendiumSource || item.uuid, name: item.name,
  monster: item.system.mutagen.monster, category: "mutagen",
  properties: [item.system.properties, minor && item.system.mutagen.mutation ? `Малая мутация: ${item.system.mutagen.mutation}` : ""].filter(Boolean).join(" · "),
  bonuses: bonuses ? foundry.utils.deepClone(item.system.mutagen.bonuses) : [] });
const mages = () => game.actors.filter(actor => actor.isOwner && actor.system.details?.profession === "mage");
const owned = () => game.actors.filter(actor => actor.isOwner && actor.type === "character");
const options = (list, selected) => list.map(actor => `<option value="${actor.id}" ${actor.id === selected ? "selected" : ""}>${esc(actor.name)}</option>`).join("");

export async function consumeMutagen(item) {
  const actor = item.actor;
  if (!actor?.isOwner) return;
  if (item.system.kind !== "mutagen" || !available(item)) throw new Error("Нужен мутаген при себе.");
  if ((actor.system.mutations ?? []).length >= 2) throw new Error("Уже принято два мутагена: больше нельзя (стр. 251).");
  const witcher = actor.system.details.race === "witcher", prepared = item.system.mutagen.prepared, dc = item.system.mutagen.dc;
  const effect = String(item.system.properties ?? "").replace(/\.+$/u, "");
  const intro = `<p><b>${esc(item.name)}</b>: ${esc(effect)}.</p><p>Эффект постоянный, удалить мутаген нельзя. Принято: ${(actor.system.mutations ?? []).length} / 2.</p>`;
  const anyMage = mages().length > 0;
  const content = witcher
    ? `${intro}${prepared ? "<p>Порция уже подготовлена: проверка не нужна.</p>" : `<p>Подготовка — 1 час, затем Алхимия СЛ ${dc}. При неудаче порция пропадает.</p><label>Алхимию выполняет<select name="helper">${options(owned(), actor.id)}</select></label>`}<label><input type="checkbox" name="time"> Час подготовки прошёл, инструменты алхимика под рукой</label>`
    : `${intro}<p>${esc(actor.name)} не ведьмак (стр. 251, «Мутирование»).</p>`
      + `<label><input type="radio" name="mode" value="mage" ${anyMage ? "checked" : "disabled"}> Мутирует маг (Мутация СЛ ${mutationDC(actor)}; полный день и вся Выносливость мага)</label>`
      + `<label>Маг<select name="mage" ${anyMage ? "" : "disabled"}>${options(mages(), mages()[0]?.id)}</select></label>`
      + `<label><input type="radio" name="mode" value="eat" ${anyMage ? "" : "checked"}> Съесть без мага: отравление, затем Стойкость СЛ 18 или Первая помощь СЛ 18</label>`
      + `<label>Спасает от яда<select name="saver">${options(owned(), actor.id)}</select></label>`
      + `<p><small>При успехе мутирования у тела появится малая мутация (${esc(item.system.mutagen.mutation)}); если кто-то её заметит, социальный статус — «ненависть и опасение».</small></p>`;
  const answer = await foundry.applications.api.DialogV2.prompt({ window: { title: item.name }, position: { width: 480 }, content, rejectClose: false,
    ok: { label: witcher ? "Принять мутаген" : "Продолжить", callback: (_event, button) => Object.fromEntries(new FormData(button.form)) } });
  if (!answer) return;
  return inventoryWrite(actor, async () => {
    if (!available(item) || (actor.system.mutations ?? []).length >= 2) throw new Error("Мутаген или слоты уже изменились.");
    const spend = { expenses: [{ itemId: item.id, quantity: 1 }] };
    if (witcher) {
      if (!answer.time) throw new Error("Подтвердите час подготовки и инструменты алхимика.");
      if (!prepared) {
        const helper = game.actors.get(answer.helper) ?? actor;
        const check = await workshopCheck(helper, { name: `Подготовка: ${item.name}`, skill: "alchemy", dc });
        if (!check.success) { await inventoryTransaction(actor, spend); return workshopNotice(actor, `<p>${esc(item.name)}: подготовка не удалась — порция пропала.</p>`); }
      }
      await inventoryTransaction(actor, { ...spend, actorUpdate: { "system.mutations": [...actor.system.mutations, mutationRecord(item)] } });
      return workshopNotice(actor, `<p>${esc(actor.name)} принимает ${esc(item.name)}: ${esc(String(item.system.properties ?? "").replace(/\.+$/u, ""))}. Эффект постоянный.</p>`);
    }
    if (answer.mode === "mage") {
      const mage = game.actors.get(answer.mage);
      if (!mage) throw new Error("Выберите мага с навыком «Мутация».");
      const check = await workshopCheck(mage, { name: `Мутация: ${actor.name} · ${item.name}`, skill: MUTATION_SKILL, dc: mutationDC(actor), details: "СЛ 28 − (ТЕЛ + ВОЛЯ подопытного) / 2" });
      await mage.update({ "system.stamina.value": 0 });
      if (check.success) {
        await inventoryTransaction(actor, { ...spend, actorUpdate: { "system.mutations": [...actor.system.mutations, mutationRecord(item, { minor: true })] } });
        return workshopNotice(actor, `<p>${esc(actor.name)} мутирован: ${esc(item.system.properties)}; малая мутация — ${esc(item.system.mutagen.mutation)}. Если кто-то её заметит, социальный статус — «ненависть и опасение». ${esc(mage.name)} потратил весь день и всю Выносливость.</p>`);
      }
      // Rejection: the body changes anyway (the minor mutation, no bonus) and the subject is dying.
      await inventoryTransaction(actor, { ...spend, actorUpdate: { "system.mutations": [...actor.system.mutations, mutationRecord(item, { minor: true, bonuses: false })], "system.health.value": Math.min(actor.system.health.value, 0) } });
      await setStatus(actor, DYING, true);
      return workshopNotice(actor, `<p>Тело ${esc(actor.name)} отторгает ${esc(item.name)}: подопытный при смерти, мутация изменила тело (${esc(item.system.mutagen.mutation)}); социальный статус — «ненависть и опасение».</p>`);
    }
    await inventoryTransaction(actor, spend);
    await setStatus(actor, "poisoned", true);
    const saver = game.actors.get(answer.saver) ?? actor, self = saver === actor;
    const check = await workshopCheck(saver, { name: `${self ? "Стойкость" : "Первая помощь"}: яд мутагена`, skill: self ? "endurance" : "firstAid", dc: 18 });
    if (check.success) await setStatus(actor, "poisoned", false);
    return workshopNotice(actor, `<p>${esc(actor.name)} съедает ${esc(item.name)} и отравлен: эффекта мутагена нет. ${check.success ? "Яд удалось остановить." : "Отравление продолжается — повторите проверку (Стойкость СЛ 18) действием."}</p>`);
  });
}

/** Core p.251: after killing a monster, a witcher may cut out its mutagen with Witcher Training DC 16. */
export const mutagenFor = npc => npc?.type === "npc" ? MUTAGENS.find(entry => (npc.name ?? "").toLocaleLowerCase("ru").includes(entry.system.mutagen.monster.toLocaleLowerCase("ru"))) ?? null : null;
export async function harvestMutagen(npc) {
  const entry = mutagenFor(npc);
  if (!npc?.isOwner || !entry) throw new Error("У этого существа нет мутагена из таблицы (стр. 251).");
  if (!hasStatus(npc, DEAD) && npc.system.health.value > 0) throw new Error("Мутаген вырезают после убийства чудовища.");
  if (npc.flags?.[SYSTEM_ID]?.mutagenHarvested) throw new Error("Попытка извлечь мутаген уже была.");
  const witchers = game.actors.filter(actor => actor.isOwner && actor.system.details?.profession === "witcher");
  if (!witchers.length) throw new Error("Нужен ведьмак (Подготовка ведьмака СЛ 16).");
  const id = await foundry.applications.api.DialogV2.prompt({ window: { title: `Мутаген: ${npc.name}` }, rejectClose: false,
    content: `<p>${esc(entry.name)}. Подготовка ведьмака СЛ 16; попытка одна.</p><label>Ведьмак<select name="actor">${options(witchers, witchers[0].id)}</select></label>`,
    ok: { label: "Вырезать", callback: (_event, button) => new FormData(button.form).get("actor") } });
  const witcher = game.actors.get(id);
  if (!witcher) return;
  await npc.setFlag(SYSTEM_ID, "mutagenHarvested", true);
  const check = await workshopCheck(witcher, { name: `Вырезать мутаген: ${npc.name}`, skill: "profession.witcher.training", dc: 16 });
  if (check.success) {
    const source = await foundry.utils.fromUuid(equipmentUuid(entry.documentId));
    if (source) await inventoryWrite(witcher, () => witcher.createEmbeddedDocuments("Item", [copyPhysical(source, 1)]));
  }
  return workshopNotice(witcher, `<p>${esc(npc.name)}: ${check.success ? `${esc(witcher.name)} получает ${esc(entry.name)}` : "мутаген испорчен при извлечении"}.</p>`);
}
