/** Rules of the remaining «Развлечения в таверне» games. Rolls happen elsewhere (GM client); these are pure state steps. */

/* ---------- Борьба на руках ---------- */
export const ARM_STAMINA = 5, ARM_TRICK_BONUS = 5, ARM_MAX_ROUNDS = 12;
export const armStart = () => ({ round: 1, rounds: [{ plays: [null, null], winner: null }], streak: { seat: -1, count: 0 } });
/** Two straight wins take the match; so does an opponent whose Stamina drops to their wound threshold. */
export function settleArmRound(state) {
  const current = state.rounds[state.round - 1];
  if (!current.plays.every(Boolean)) return state;
  const [left, right] = current.plays, winner = left.total === right.total ? null : left.total > right.total ? 0 : 1;
  const streak = winner === null ? { seat: -1, count: 0 } : winner === state.streak.seat ? { seat: winner, count: state.streak.count + 1 } : { seat: winner, count: 1 };
  const rounds = state.rounds.map((round, index) => index === state.round - 1 ? { ...round, winner } : round);
  const end = extra => ({ ...state, rounds, streak, phase: "settling", ...extra });
  const caught = current.plays.flatMap((play, index) => play.trick?.caught ? [index] : []);
  if (caught.length) return end({ caught, winner: caught.length === 1 ? 1 - caught[0] : null, reason: "caught" });
  if (streak.count >= 2) return end({ winner: streak.seat, reason: "showdown" });
  const spent = current.plays.map(play => play.spent === true);
  if (spent.some(Boolean)) return end({ winner: spent.every(Boolean) ? null : spent[0] ? 1 : 0, reason: "exhausted" });
  if (state.round >= ARM_MAX_ROUNDS) return end({ winner: null, reason: "showdown" });
  return { ...state, rounds: [...rounds, { plays: [null, null], winner: null }], streak, round: state.round + 1 };
}

/* ---------- Соревнование по выпивке ---------- */
export const DRINK_MAX = 6, DRINK_BASE_DC = 10, DRINK_STEP = 2, OIL_PORTIONS = 3, SURPRISE_DC = 10;
export const drinkDC = round => DRINK_BASE_DC + DRINK_STEP * (round - 1);
export const drinkSeat = () => ({ fails: 0, active: true, acted: false, out: false, outRound: 0, drinks: 0, oil: 0, pending: [] });
/** Applies one portion (or a GM's surprise check) to a seat. `outcome.checks` lists the checks actually rolled now. */
export function applyDrink(state, index, outcome) {
  const seats = state.seats.map(seat => ({ ...seat, pending: [...(seat.pending ?? [])] })), seat = seats[index];
  if (outcome.portion) { seat.acted = true; seat.drinks += 1; }
  if (outcome.oil) seat.oil = OIL_PORTIONS;
  if (outcome.deferred) { seat.pending.push(outcome.deferred); seat.oil = Math.max(0, seat.oil - (outcome.portion ? 1 : 0)); }
  if (outcome.resolved) seat.pending = [];
  for (const check of outcome.checks ?? []) {
    if (check.success) continue;
    // The GM's surprise check ends the contest for that drinker at once.
    seat.fails = check.surprise ? 2 : Math.min(2, seat.fails + 1);
  }
  if (seat.fails >= 2 && seat.active) Object.assign(seat, { active: false, out: true, outRound: state.round });
  const log = [...(state.log ?? []), { round: state.round, seat: index, ...outcome }].slice(-30);
  return advanceDrink({ ...state, seats, log });
}
/** Last drinker standing wins; if the final drinkers fall in the same round, they share the bank. */
export function advanceDrink(state) {
  const active = state.seats.flatMap((seat, index) => seat.active ? [index] : []);
  if (active.length === 1 && !(state.seats[active[0]].pending ?? []).length) return { ...state, phase: "settling", winners: active, winner: active[0], reason: "showdown" };
  if (!active.length) {
    const last = state.seats.flatMap((seat, index) => seat.outRound === state.round ? [index] : []);
    return { ...state, phase: "settling", winners: last, winner: last.length === 1 ? last[0] : null, reason: "showdown" };
  }
  if (active.every(index => state.seats[index].acted)) return { ...state, round: state.round + 1, seats: state.seats.map(seat => ({ ...seat, acted: false })) };
  return state;
}

/* ---------- Филе из пяти пальцев ---------- */
export const FILLET_DC = 12, FILLET_SPEED_DC = 3, FILLET_MAX_STAGE = 3;
export const filletDC = stage => FILLET_DC + FILLET_SPEED_DC * (stage - 1);
export const filletLimit = (state, stage = state.stage) => (state.limitBase ?? 0) * 2 ** (Math.max(1, stage) - 1);
export const filletSeat = () => ({ bets: [0, 0, 0] });
export const totalBet = seat => (seat.bets ?? []).reduce((sum, value) => sum + value, 0);
export const betsTotal = state => state.seats.slice(1).reduce((sum, seat) => sum + totalBet(seat), 0);
/** Raising a bet: the new total of all bets stays within this speed's limit. */
export function placeBet(state, index, amount) {
  const value = Number(amount), stage = Math.max(1, state.stage ?? 1);
  if (index < 1) throw new Error("Исполнитель не ставит против себя.");
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Ставка — целое число крон.");
  const seats = state.seats.map(seat => ({ ...seat, bets: [...(seat.bets ?? [0, 0, 0])] })), seat = seats[index];
  const earlier = seat.bets.slice(0, stage - 1).reduce((sum, bet) => sum + bet, 0);
  if (value < earlier) throw new Error("Сделанную ставку нельзя уменьшить.");
  seat.bets[stage - 1] = value - earlier;
  const total = seats.slice(1).reduce((sum, row) => sum + totalBet(row), 0);
  if (total > filletLimit(state, stage)) throw new Error(`Против исполнителя ставят не больше ${filletLimit(state, stage)} кр.`);
  return { ...state, seats };
}
/** Escrow for one speed: bettors put in their raise, the performer covers all of it. */
export function filletDeposits(state, stage = state.stage) {
  const raises = state.seats.map((seat, index) => index ? seat.bets?.[stage - 1] ?? 0 : 0);
  raises[0] = raises.reduce((sum, value) => sum + value, 0);
  return raises;
}
/** The performer stops and collects everything; a miss pays every bettor double what they risked. */
export function filletPayouts(state) {
  const totals = state.seats.map((seat, index) => index ? totalBet(seat) : 0), all = totals.reduce((a, b) => a + b, 0);
  if (state.reason === "collected") return state.seats.map((_, index) => index ? 0 : all * 2);
  return totals.map((bet, index) => index ? bet * 2 : 0);
}

/* ---------- Кулачный бой ---------- */
export const BRAWL_MAX = 4;
export const brawlSeat = () => ({ active: true, out: "", caught: false });
/** One knockout, surrender or disqualification: the last fighter on their feet wins. */
export function knockOut(state, index, reason) {
  if (!state.seats[index]?.active) return state;
  const seats = state.seats.map((seat, i) => i === index ? { ...seat, active: false, out: reason, caught: seat.caught || reason === "caught" } : seat);
  const log = [...(state.log ?? []), { seat: index, out: reason }].slice(-30);
  const active = seats.flatMap((seat, i) => seat.active ? [i] : []);
  if (active.length > 1) return { ...state, seats, log };
  return { ...state, seats, log, phase: "settling", winner: active[0] ?? null, winners: active, reason: "showdown" };
}
export const BRAWL_OUT = { yield: "Сдался", knocked: "Без сознания", caught: "Пойман со скрытым весом", award: "Проиграл по решению мастера" };
