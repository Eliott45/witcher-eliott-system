import { isCarried } from "../data/containers.mjs";
import { setStatus, hasStatus } from "../combat/status-effects.mjs";
import { HIDDEN_WEIGHT_DC } from "../data/tavern-equipment.mjs";
import { tavernCheck } from "./tavern-dice.mjs";
import { actorOf, skillTotal, crit, gmNote, esc } from "./tavern-common.mjs";
import { ARM_STAMINA, ARM_TRICK_BONUS, OIL_PORTIONS, SURPRISE_DC, drinkDC, filletDC, knockOut } from "./tavern-games.mjs";

/** GM-side turns of the arm-wrestling, drinking, fillet and fistfight tables. Results go into receipts first. */
const statusOn = (actor, status) => Boolean(actor?.effects) && hasStatus(actor, status);
const setOn = (actor, status) => actor?.effects ? setStatus(actor, status, true) : null;

/** Arm wrestling: Physique; the free-hand trick is Sleight of Hand against the opponent's Awareness, +5 if unseen. */
export async function armPress(state, index, data) {
  const seat = state.seats[index], actor = actorOf(seat), rival = actorOf(state.seats[1 - index]);
  let trick = null;
  if (data.trick) {
    const hand = await tavernCheck(skillTotal(actor, "sleightOfHand") ?? 0), awareness = skillTotal(rival, "awareness");
    const watch = awareness == null ? null : await tavernCheck(awareness), caught = Boolean(watch && watch.total >= hand.total);
    trick = { hand: hand.total, watch: watch?.total ?? null, caught, bonus: caught ? 0 : ARM_TRICK_BONUS };
    await gmNote("Борьба на руках: приём", `<p>${esc(seat.name)} незаметно упирается свободной рукой: Ловкость рук ${hand.total}${crit(hand)}.</p><p>${watch
      ? `Внимание ${esc(rival.name)}: ${watch.total}${crit(watch)} — ${caught ? "заметил! Нарушение: схватка проиграна." : "не заметил, +5 к Силе."}`
      : "У соперника нет персонажа. Других зрителей проверьте вручную: Внимание против этого результата."}</p>`);
  }
  const physique = skillTotal(actor, "physique") ?? 0, check = await tavernCheck(physique + (trick?.bonus ?? 0));
  const play = { physique, trick, die: check.die, faces: check.faces, total: check.total, stamina: null, threshold: null, spent: false };
  // Both pay 5 Stamina a round; at or below the wound threshold the arm gives out.
  if (actor?.system?.stamina) {
    const stamina = Math.max(0, Number(actor.system.stamina.value ?? 0) - ARM_STAMINA), threshold = Number(actor.system.statistics?.woundThreshold ?? 0);
    await actor.update({ "system.stamina.value": stamina });
    Object.assign(play, { stamina, threshold, spent: stamina <= threshold });
  }
  return play;
}

/** Drinking contest: Endurance against the portion's DC. Vegetable oil postpones the checks for three portions,
 * then everything drunk since catches up at once. The GM's surprise check is DC 10 and ends the contest on a failure. */
export async function drinkTurn(state, index, data = {}, { surprise = false } = {}) {
  const seat = state.seats[index], actor = actorOf(seat), endurance = skillTotal(actor, "endurance") ?? 0, dc = surprise ? SURPRISE_DC : drinkDC(state.round);
  const outcome = { portion: !surprise, surprise, dc, checks: [] };
  if (data.oil && !surprise) {
    if ((seat.oil ?? 0) > 0) throw new Error("Масло уже действует.");
    const oil = actor?.items.find(item => item.system.ruleId === "material.oil" && item.system.quantity > 0 && isCarried(item));
    if (!oil) throw new Error("Нужна единица масла при себе.");
    await oil.update({ "system.quantity": oil.system.quantity - 1 });
    outcome.oil = true;
    await gmNote("Соревнование по выпивке: масло", `<p>${esc(seat.name)} тайком выпивает масло: проверки Стойкости откладываются на ${OIL_PORTIONS} порции, потом приходят разом.</p>`);
  }
  const oilLeft = outcome.oil ? OIL_PORTIONS : seat.oil ?? 0;
  const roll = async pending => { const check = await tavernCheck(endurance); return { dc: pending.dc, surprise: pending.surprise, total: check.total, faces: check.faces, success: check.total >= pending.dc }; };
  if (oilLeft > 0) {
    outcome.deferred = { dc, surprise };
    if (!surprise && oilLeft === 1) {
      outcome.resolved = true;
      for (const pending of [...(seat.pending ?? []), outcome.deferred]) outcome.checks.push({ ...await roll(pending), late: true });
    }
  } else outcome.checks.push(await roll({ dc, surprise }));
  let fails = seat.fails ?? 0;
  for (const check of outcome.checks) if (!check.success) fails = check.surprise ? 2 : Math.min(2, fails + 1);
  if (fails >= 1 && (seat.fails ?? 0) < 1) await setOn(actor, "intoxicated");
  if (fails >= 2 && (seat.fails ?? 0) < 2) await setOn(actor, "nauseated");
  return outcome;
}

/** Five finger fillet: Gambling sets how much anyone will bet; Small Blades against 12, +3 per speed-up. */
export async function filletOdds(seat) {
  const check = await tavernCheck(skillTotal(actorOf(seat), "gambling") ?? 0);
  return { limitBase: Math.max(0, check.total), limitFaces: check.faces };
}
export async function filletStab(state) {
  const skill = skillTotal(actorOf(state.seats[0]), "smallBlades") ?? 0, dc = filletDC(state.stage), check = await tavernCheck(skill);
  return { stage: state.stage, dc, skill, total: check.total, faces: check.faces, success: check.total >= dc };
}

/** Fistfight: a fighter carrying an equipped Hidden Weight is checked once by every opponent (Awareness DC 18). */
export async function brawlStart(state) {
  let next = state;
  for (const [index, seat] of state.seats.entries()) {
    const weight = actorOf(seat)?.items.find(item => item.system.ruleId === "weapon.hidden-weight" && item.system.equipped);
    if (!weight) continue;
    const lines = [];
    let spotted = false;
    for (const [other, rival] of state.seats.entries()) {
      const watcher = actorOf(rival), awareness = other === index ? null : skillTotal(watcher, "awareness");
      if (awareness == null) continue;
      const check = await tavernCheck(awareness), seen = check.total >= HIDDEN_WEIGHT_DC;
      spotted ||= seen; lines.push(`${esc(watcher.name)}: ${check.total}${crit(check)}${seen ? " — заметил!" : ""}`);
    }
    await gmNote("Кулачный бой: скрытый вес", `<p>${esc(seat.name)} зажал в кулаке скрытый вес.</p><p>Внимание против СЛ ${HIDDEN_WEIGHT_DC}: ${lines.join(", ") || "некому проверить"}.</p><p><strong>${spotted ? "Замечено: боец дисквалифицирован." : "Никто не заметил."}</strong></p>`);
    if (spotted) next = knockOut(next, index, "caught");
  }
  return next.phase === "fighting" ? { ...next, combat: await brawlCombat(next) } : next;
}
/** Puts the fighters' tokens on the viewed scene into a fresh encounter, so the fight uses the system's brawling. */
async function brawlCombat(state) {
  const scene = game.scenes?.viewed;
  if (!scene) return "";
  const tokens = state.seats.flatMap(seat => {
    const actor = actorOf(seat), token = actor && scene.tokens.find(entry => entry.actorId === actor.id || entry.actor?.uuid === actor.uuid);
    return token && seat.active ? [token] : [];
  });
  if (tokens.length < 2) return "";
  const combat = await foundry.documents.Combat.implementation.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", tokens.map(token => ({ tokenId: token.id, sceneId: scene.id, actorId: token.actorId })));
  return combat.id;
}
/** Unconscious, dying, dead or at 0 HP: that fighter is out. */
export function brawlKnockouts(state) {
  let next = state;
  for (const [index, seat] of state.seats.entries()) {
    const actor = actorOf(seat);
    if (!seat.active || !actor) continue;
    const down = ["unconscious", "dying", "dead"].some(status => statusOn(actor, status)) || Number(actor.system.health?.value ?? 1) <= 0;
    if (down) next = knockOut(next, index, "knocked");
  }
  return next;
}
