/** «Драконий клад» from «Развлечения в таверне»: 2–4 players grab coins from around a basket with an angry snake. */
export const HOARD_MIN = 2, HOARD_MAX = 4;
/** The snake's Awareness base and bite attack base, as printed. */
export const SNAKE_AWARENESS = 12, SNAKE_BITE = 10;
/** «Дыхание суккуба» makes the player a smaller target: +5 Sleight of Hand. Spotting it uses the potion's own DC. */
export const DOPING_BONUS = 5, DOPING_DC = 16, DOPING_STATUSES = ["succubus-skin", "succubus-drink"];
/** Each player lays out 10 coins (or the agreed stake in crowns); a successful grab takes half of one stake. */
export function hoardCoins(stake) {
  const per = Number(stake) > 0 ? Number(stake) : 10;
  return { per, grab: Math.ceil(per / 2) };
}
export const hoardSeat = () => ({ collected: 0, active: true, bites: 0, acted: false, doped: false, caught: false, checked: false });
export const activeHoard = state => state.seats.flatMap((seat, index) => seat.active ? [index] : []);
/** Applies one resolved reach into the basket; the play was rolled by the GM and is stored in a receipt first. */
export function applyReach(state, index, play) {
  const seats = state.seats.map(seat => ({ ...seat })), seat = seats[index];
  let pot = state.pot;
  seat.acted = true; seat.checked ||= Boolean(play.doping); seat.doped ||= Boolean(play.doping);
  if (play.caught) {
    // A caught cheater is thrown out; whatever they grabbed goes back around the basket.
    pot += seat.collected; seat.collected = 0; seat.active = false; seat.caught = true;
  } else if (play.success) {
    const taken = Math.min(state.grab, pot); pot -= taken; seat.collected += taken; play = { ...play, taken };
  } else if (play.bitten) seat.bites += 1;
  const log = [...state.log, { round: state.round, seat: index, ...play }].slice(-30);
  return advanceHoard({ ...state, seats, pot, log });
}
export function leaveHoard(state, index) {
  const seats = state.seats.map((seat, i) => i === index ? { ...seat, active: false } : seat);
  return advanceHoard({ ...state, seats, log: [...state.log, { round: state.round, seat: index, left: true }].slice(-30) });
}
/** The game ends when the coins are gone or nobody is left reaching; otherwise a full round starts a new snake roll. */
export function advanceHoard(state) {
  const active = activeHoard(state);
  if (state.pot <= 0 || !active.length) return { ...state, phase: "settling", reason: "showdown", winner: null };
  if (active.every(index => state.seats[index].acted)) return { ...state, round: state.round + 1, snake: null, seats: state.seats.map(seat => ({ ...seat, acted: false })) };
  return state;
}
/** Final purse: what each player grabbed, plus an equal share of coins still on the table. */
export function hoardPayouts(state) {
  const count = state.seats.length, share = Math.floor(Math.max(0, state.pot) / count), extra = Math.max(0, state.pot) - share * count;
  return state.seats.map((seat, index) => seat.collected + share + (index < extra ? 1 : 0));
}
export function hoardLeader(state) {
  const best = Math.max(...state.seats.map(seat => seat.collected));
  const leaders = state.seats.flatMap((seat, index) => seat.collected === best && best > 0 ? [index] : []);
  return leaders.length === 1 ? leaders[0] : null;
}
