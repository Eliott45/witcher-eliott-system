import { controlsSeat } from "./poker-rules.mjs";
import { critText } from "./tavern-dice.mjs";
import { ARM_TRICK_BONUS, drinkDC, filletDC, filletLimit, totalBet, betsTotal, FILLET_MAX_STAGE, BRAWL_OUT, OIL_PORTIONS, SURPRISE_DC } from "./tavern-games.mjs";

const bar = (value, max) => ({ value: Number(value) || 0, max: Number(max) || 0, percent: max ? Math.max(0, Math.min(100, Math.round((Number(value) || 0) / max * 100))) : 0 });
const mark = faces => faces?.length > 1 ? critText(faces) : "";
const seatBase = (state, index, me, user, { portrait, online, actorOf }) => {
  const seat = state.seats[index], actor = actorOf(seat);
  return { index, name: seat.name, img: portrait(seat), online: online(seat), npc: Boolean(seat.npc), mine: index === me, controlled: controlsSeat(seat, user), actor,
    label: index === me ? "Вы" : seat.npc ? "НПС" : "Игрок" };
};
// Documents stay out of the template context.
const clean = ({ actor, ...rest }) => rest;
const gathering = (state, user) => {
  const host = controlsSeat(state.seats[0], user) || user.isGM;
  return { canStart: state.phase === "gathering" && host, canJoin: state.phase === "gathering" && !state.seats.some(seat => seat.userId === user.id && !seat.npc), canAddNpc: state.phase === "gathering" && user.isGM };
};

/** Arm wrestling: two straight wins, five Stamina per round, a sneaky free hand. */
export function armView(state, user, me, helpers) {
  const order = me === 0 ? [1, 0] : [0, 1], current = state.rounds?.[state.round - 1], last = [...(state.rounds ?? [])].reverse().find(round => round.plays.every(Boolean));
  const seat = index => {
    const base = seatBase(state, index, me, user, helpers), play = current?.plays[index] ?? null, shown = play ?? last?.plays[index] ?? null, actor = base.actor;
    return clean({ ...base, stamina: actor?.system?.stamina ? bar(actor.system.stamina.value, actor.system.stamina.max) : null, threshold: actor?.system?.statistics?.woundThreshold ?? null,
      thresholdPercent: actor?.system?.stamina?.max ? Math.round((actor.system.statistics?.woundThreshold ?? 0) / actor.system.stamina.max * 100) : 0,
      total: shown?.total ?? null, crit: mark(shown?.faces), faded: !play && Boolean(shown), pressed: Boolean(play),
      trick: shown?.trick && (base.controlled || user.isGM) ? shown.trick.caught ? "Приём замечен!" : `Приём: +${ARM_TRICK_BONUS}` : shown?.trick?.caught ? "Пойман на приёме" : "",
      status: ["finished", "cancelled", "declined"].includes(state.phase) ? state.winner === index ? "Победитель" : "" : state.phase === "playing" ? play ? "Давит" : "Собирается с силами" : "" });
  };
  // Lean from the bottom seat's point of view: +2 means it is about to pin the other arm.
  const bottom = order[1], lean = state.streak?.seat === bottom ? state.streak.count : state.streak?.seat === order[0] ? -state.streak.count : 0;
  return { arm: { top: seat(order[0]), bottom: seat(order[1]), lean, round: state.round, history: (state.rounds ?? []).filter(round => round.plays.every(Boolean)).map((round, i) => ({
    round: i + 1, totals: order.map(index => round.plays[index].total).join(" — "), won: round.winner === null ? "draw" : round.winner === bottom ? "won" : "lost" })) },
    canPress: state.phase === "playing" && me >= 0 && !current?.plays[me] };
}

/** Drinking contest: the DC climbs by 2 a portion; the second failure ends the contest with nausea. */
export function drinkView(state, user, me, helpers) {
  const seats = state.seats.map((seat, index) => {
    const base = seatBase(state, index, me, user, helpers), own = base.controlled || user.isGM, oilItem = base.actor?.items?.find?.(item => item.system.ruleId === "material.oil" && item.system.quantity > 0);
    return clean({ ...base, drinks: Array.from({ length: Math.min(seat.drinks ?? 0, 12) }, (_, i) => ({ i })), more: Math.max(0, (seat.drinks ?? 0) - 12), fails: seat.fails ?? 0,
      tipsy: (seat.fails ?? 0) === 1, out: Boolean(seat.out), acted: Boolean(seat.acted), oil: own ? seat.oil ?? 0 : 0, pending: own ? (seat.pending ?? []).length : 0, hasOil: own && Boolean(oilItem),
      canSurprise: user.isGM && state.phase === "playing" && seat.active, kick: state.phase === "gathering" && (controlsSeat(state.seats[0], user) || user.isGM) && index > 0,
      status: seat.out ? seat.outRound ? "Выбыл" : "Сдался" : state.phase === "gathering" ? index === 0 ? "Хозяин стола" : "За столом" : (seat.fails ?? 0) === 1 ? "Пьян" : "Держится",
      winner: (state.winners ?? []).includes(index) && state.phase === "finished" });
  });
  const own = state.seats[me];
  const log = (state.log ?? []).slice(-6).reverse().map(entry => {
    const name = state.seats[entry.seat]?.name ?? "Участник", mine = controlsSeat(state.seats[entry.seat], user) || user.isGM;
    if (entry.left) return { tone: "left", icon: "fa-flag", text: `${name} сдаётся и отставляет кружку.` };
    const checks = (entry.checks ?? []).map(check => `${check.total}${check.faces?.length > 1 ? ` [${critText(check.faces)}]` : ""} против СЛ ${check.dc} — ${check.success ? "держится" : check.surprise ? "тошнит!" : "плывёт"}`).join("; ");
    if (entry.surprise) return { tone: entry.checks?.some(check => !check.success) ? "bad" : "good", icon: "fa-bell", text: `Мастер проверяет ${name}: ${checks || (mine ? "отложено маслом" : "держится")}.` };
    if (!entry.checks?.length) return { tone: "good", icon: "fa-beer-mug-empty", text: `${name} осушает порцию ${entry.dc ? `(СЛ ${entry.dc})` : ""}${mine && entry.deferred ? " — масло держит" : " — ни в одном глазу"}.` };
    return { tone: entry.checks.some(check => !check.success) ? "bad" : "good", icon: entry.checks.some(check => !check.success) ? "fa-face-dizzy" : "fa-beer-mug-empty", text: `${name}${entry.resolved ? ", масло отпускает" : ""}: ${checks}.` };
  });
  return { drink: { seats, dc: state.round ? drinkDC(state.round) : drinkDC(1), round: state.round, log, oilPortions: OIL_PORTIONS, surpriseDC: SURPRISE_DC },
    ...gathering(state, user), canDrink: state.phase === "playing" && me >= 0 && own?.active && !own.acted, canOil: state.phase === "playing" && me >= 0 && !own?.acted && !(own?.oil > 0) && seats[me]?.hasOil,
    canLeave: me >= 0 && (state.phase === "gathering" ? me > 0 : state.phase === "playing" && own?.active) };
}

/** Five finger fillet: one performer, the room bets against them; each speed-up is +3 DC and doubles the limit. */
export function filletView(state, user, me, helpers) {
  const performer = clean(seatBase(state, 0, me, user, helpers)), stage = state.stage ?? 1, limit = filletLimit(state, stage), total = betsTotal(state);
  const bettors = state.seats.slice(1).map((seat, i) => clean({ ...seatBase(state, i + 1, me, user, helpers), bet: totalBet(seat), kick: state.phase === "gathering" && (controlsSeat(state.seats[0], user) || user.isGM) }));
  const stages = Array.from({ length: FILLET_MAX_STAGE }, (_, i) => ({ number: i + 1, dc: filletDC(i + 1), current: i + 1 === stage, done: i + 1 < stage || (i + 1 === stage && ["decide", "finished"].includes(state.phase) && state.reason !== "failed") }));
  const log = (state.log ?? []).slice(-6).reverse().map(entry => ({ tone: entry.success ? "good" : "bad", icon: entry.success ? "fa-check" : "fa-droplet",
    text: `Скорость ${entry.stage}: Владение лёгкими клинками ${entry.total}${entry.faces?.length > 1 ? ` [${critText(entry.faces)}]` : ""} против СЛ ${entry.dc} — ${entry.success ? "нож ни разу не задел пальцы" : "лезвие в пальце!"}` }));
  const performerMove = me === 0;
  return { fillet: { performer, bettors, stages, stage, limit, total, room: Math.max(0, limit - total), odds: state.limitBase ?? 0, oddsCrit: mark(state.limitFaces), dc: filletDC(stage), log,
    nextDC: filletDC(stage + 1), canSpeed: stage < FILLET_MAX_STAGE, myBet: me > 0 ? totalBet(state.seats[me]) : 0, cut: state.reason === "failed" },
    ...gathering(state, user), canStab: state.phase === "playing" && performerMove, canDecide: state.phase === "decide" && performerMove, canResume: state.phase === "betting" && performerMove,
    canBet: ["gathering", "betting"].includes(state.phase) && me > 0, canLeave: state.phase === "gathering" && me > 0 };
}

/** Fistfight: the fight is a real combat; the table tracks who is still standing and holds the bets. */
export function brawlView(state, user, me, helpers) {
  const seats = state.seats.map((seat, index) => {
    const base = seatBase(state, index, me, user, helpers), actor = base.actor, items = actor?.items ? Array.from(actor.items) : [];
    const equipped = items.filter(item => item.system?.equipped && (item.type === "armor" || (item.type === "weapon" && !item.system.natural)));
    const hidden = equipped.filter(item => item.system.ruleId === "weapon.hidden-weight"), visible = equipped.filter(item => item.system.ruleId !== "weapon.hidden-weight");
    return clean({ ...base, health: actor?.system?.health ? bar(actor.system.health.value, actor.system.health.max) : null, stamina: actor?.system?.stamina ? bar(actor.system.stamina.value, actor.system.stamina.max) : null,
      active: seat.active, out: seat.out ? BRAWL_OUT[seat.out] ?? seat.out : "", caught: Boolean(seat.caught),
      warnings: visible.map(item => item.name), hidden: (base.controlled || user.isGM) && hidden.length ? "скрытый вес в кулаке" : "",
      canAward: user.isGM && state.phase === "fighting" && seat.active, kick: state.phase === "gathering" && (controlsSeat(state.seats[0], user) || user.isGM) && index > 0,
      winner: state.phase === "finished" && state.winner === index });
  });
  const log = (state.log ?? []).slice(-6).reverse().map(entry => ({ tone: entry.out === "caught" ? "bad" : "left", icon: entry.out === "knocked" ? "fa-bed" : entry.out === "caught" ? "fa-mask" : "fa-flag",
    text: `${state.seats[entry.seat]?.name ?? "Боец"}: ${(BRAWL_OUT[entry.out] ?? entry.out).toLowerCase()}.` }));
  return { brawl: { seats, log, combat: Boolean(state.combat) }, ...gathering(state, user), canYield: state.phase === "fighting" && me >= 0 && state.seats[me]?.active,
    canLeave: state.phase === "gathering" && me > 0 };
}
