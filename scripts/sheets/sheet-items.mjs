import { SYSTEM_ID } from "../config.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";
import { isContainer } from "../data/containers.mjs";

export async function viewSheetItem(_event, target) {
  const item = target.dataset.itemId ? this.actor.items.get(target.dataset.itemId)
    : await foundry.utils.fromUuid(target.dataset.uuid);
  if (item?.testUserPermission(game.user, "LIMITED")) await item.sheet.render({ force: true });
}

export async function createAbility() {
  if (!this.isEditable) return;
  const [item] = await this.actor.createEmbeddedDocuments("Item", [{
    name: game.i18n.localize("WITCHER.Abilities.New"), type: "ability", img: "icons/svg/aura.svg"
  }]);
  if (item) await item.sheet.render({ force: true });
}

export function browseAbilities() {
  game.packs.get(`${SYSTEM_ID}.abilities`)?.render(true);
}

export function browseLanguages() {
  game.packs.get(`${SYSTEM_ID}.languages`)?.render(true);
}

export async function removeSheetItem(_event, target) {
  if (!this.isEditable) return;
  const item = this.actor.items.get(target.dataset.itemId);
  if (!item) return;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: item.name },
    content: `<p>${escapeTooltip(game.i18n.format("WITCHER.Abilities.RemoveConfirm", { name: item.name }))}</p>${isContainer(item) ? "<p>Содержимое сохранится в инвентаре.</p>" : ""}`,
    rejectClose: false
  });
  if (confirmed && this.isEditable) await item.delete();
}
