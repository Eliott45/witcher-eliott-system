import { SYSTEM_ID } from "../config.mjs";
import { navigationBonus, signalRange, isRadolfTorch, torchIgnited } from "../data/radolf-rules.mjs";
import { isCarried } from "../data/containers.mjs";
import { skillValue } from "../data/skills.mjs";
import { inventoryWrite } from "../data/inventory-writes.mjs";
import { rollActionCheck, actionQuote, actionUpdate } from "./action-economy.mjs";
import { creaturePost, esc } from "./creature-actions-common.mjs";
import { scatterMarbles } from "./radolf-marbles.mjs";

export async function useRadolfItem(item) {
  const actor = item?.actor;
  if (!actor?.isOwner || !isCarried(item)) throw new Error("Нужен предмет при себе у доступного персонажа.");
  const bonus = navigationBonus(item);
  if (bonus) {
    const skill = skillValue(actor.system, "wildernessSurvival");
    if (skill?.total == null) throw new Error("Заполните Интеллект персонажа.");
    return rollActionCheck(actor, { formula: `1d10wc + ${skill.total + bonus}`,
      flavor: `<h3>Ориентирование · ${esc(item.name)}</h3><p>Выживание в дикой природе ${skill.total} + ${bonus} за предмет.</p>`,
      flags: { [SYSTEM_ID]: { skillCheck: { key: "wildernessSurvival", base: skill.total + bonus, level: skill.level,
        attribute: skill.attributeValue, bonus: skill.bonus + bonus } } } });
  }
  if (item.system.ruleId === "radolf.marbles") return scatterMarbles(actor, item);
  return inventoryWrite(actor, async () => {
    if (!isCarried(item)) throw new Error("Предмет больше не находится при себе.");
    const action = actionQuote(actor);
    if (isRadolfTorch(item)) {
      const lit = !torchIgnited(item);
      if (lit && (!item.system.equipped || item.system.containerId)) throw new Error("Сначала возьмите факел в руку.");
      await actor.update({ ...actionUpdate(actor, action), items: [{ _id: item.id, [`flags.${SYSTEM_ID}.torchLit`]: lit }] });
    } else if (signalRange(item)) {
      await creaturePost(actor, { title: item.name, text: `Подан сигнал. Дальность: ${signalRange(item)}. Его могут услышать все в пределах этой дальности.` });
      await actor.update(actionUpdate(actor, action));
    }
  });
}

export const radolfActions = {
  async useRadolfItem(_event, target) {
    if (!this.isEditable) return;
    try {
      await this.submit();
      await useRadolfItem(this.item ?? this.actor.items.get(target.dataset.itemId));
    } catch (error) { ui.notifications.warn(error.message); }
  }
};
