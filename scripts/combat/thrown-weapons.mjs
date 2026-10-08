import { SYSTEM_ID } from "../config.mjs";
import { effectiveItem } from "../data/workshop.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { dropItemToGround } from "../loot/loot.mjs";

/** Capture before posting: throwing must not erase oils, rune identities or relic properties from the attack. */
export function thrownWeaponPlan(actor, item, quote, { targetContext = null, point = null } = {}) {
  if (!item || quote.weapon?.category !== "thrown" || item.system.natural) return null;
  if (!actor.isOwner || item.actor !== actor) throw new Error("Нет доступа к метательному оружию.");
  const quantity = quote.attack?.count ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.system.quantity) throw new Error("Недостаточно метательного оружия для всех бросков.");
  if (!game.user.isGM && !game.users.activeGM) throw new Error("Для метания оружия нужен подключённый мастер: он размещает предмет на земле.");
  if (actor.flags?.[SYSTEM_ID]?.lootRequest) throw new Error("Дождитесь завершения предыдущего перемещения предмета.");
  const scene = targetContext?.attacker?.parent ?? actor.token?.parent ?? globalThis.canvas?.scene;
  if (!scene) throw new Error("Для метания оружия откройте сцену.");
  if (targetContext?.target && targetContext.target.parent?.id !== scene.id) throw new Error("Цель должна находиться на той же сцене.");
  const aim = point ?? (targetContext?.target ? tokenCenter(targetContext.target) : null);
  if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) throw new Error("Выберите цель метания или точку, в которой останется оружие.");
  return { weaponSnapshot: { type: item.type, name: item.name, system: structuredClone(quote.weapon ?? effectiveItem(item)) },
    attackTime: game.time?.worldTime ?? 0,
    thrownDrop: { itemId: item.id, quantity, sourceQuantity: item.system.quantity, sceneId: scene.id, point: { x: aim.x, y: aim.y }, state: "ready" } };
}

const pending = new WeakMap();
/** Call immediately after a successful attack post, inside the caller's inventory queue, before waiting on dice animation. */
export function settleThrownWeapon(actor, item, message) {
  if (pending.has(message)) return pending.get(message);
  const work = settle(actor, item, message);
  pending.set(message, work);
  const clear = () => { if (pending.get(message) === work) pending.delete(message); };
  work.then(clear, clear);
  return work;
}

async function settle(actor, item, message) {
  const attack = message.flags?.[SYSTEM_ID]?.weaponAttack, plan = attack?.thrownDrop;
  if (!plan || !actor.isOwner || message.speakerActor?.uuid !== actor.uuid) return null;
  if (plan.state === "complete") return attack.groundWeaponUuid ?? null;
  // Player requests are processed by the active GM; submitting them twice would throw another copy.
  const request = actor.flags?.[SYSTEM_ID]?.lootRequest;
  if (request?.thrownAttack === message.uuid) return null;
  if (!item || item.actor !== actor || item.id !== plan.itemId) throw new Error("Метательное оружие больше не находится в этом инвентаре.");
  if (item.system.natural || item.system.quantity < plan.quantity) throw new Error("Предмет изменился после броска. Проверьте инвентарь и кучку добычи.");
  // Once the roll is posted the weapon has left the hand, including when the GM's transfer later fails.
  await item.update({ "system.equipped": false });
  await message.update({ [`flags.${SYSTEM_ID}.weaponAttack.thrownDrop.state`]: "pending" });
  try {
    return await dropItemToGround(actor, item, { quantity: plan.quantity, point: plan.point, sceneId: plan.sceneId,
      silent: true, thrownAttack: message.uuid });
  } catch (error) {
    await message.update({ [`flags.${SYSTEM_ID}.weaponAttack.thrownDrop.state`]: "failed" });
    throw error;
  }
}
