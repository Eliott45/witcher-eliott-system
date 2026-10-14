import { HOARD_MAX, HOARD_MIN, SNAKE_AWARENESS, SNAKE_BITE, DOPING_BONUS, hoardPayouts, hoardLeader } from "./hoard-rules.mjs";
import { controlsSeat } from "./poker-rules.mjs";

const coinWord = (state, count) => state.stake ? `${count} кр.` : `${count} ${count % 10 === 1 && count % 100 !== 11 ? "монета" : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "монеты" : "монет"}`;
function logLine(state, entry, user) {
  const seat = state.seats[entry.seat], name = seat?.name ?? "Игрок", mine = controlsSeat(seat, user) || user.isGM;
  if (entry.left) return { tone: "left", icon: "fa-person-walking-arrow-right", text: `${name} забирает добычу и отходит от корзины.` };
  if (entry.caught) return { tone: "caught", icon: "fa-mask", text: `${name} пойман на «Дыхании суккуба» — выбывает, монеты возвращаются в корзину.` };
  const doping = entry.doping && mine ? ` (+${DOPING_BONUS} суккуб)` : "";
  if (entry.success) return { tone: "grab", icon: "fa-hand-holding-dollar", text: `${name} выхватывает ${coinWord(state, entry.taken ?? 0)}: Ловкость рук ${entry.grab}${doping} против змеи ${entry.snake}.` };
  if (entry.bitten) return { tone: "bite", icon: "fa-skull-crossbones", text: `${name} не успевает (${entry.grab}${doping} против ${entry.snake}) — укус! Уклонение ${entry.dodge} против ${entry.bite}. Отравление.` };
  return { tone: "dodge", icon: "fa-hand", text: `${name} не успевает (${entry.grab}${doping} против ${entry.snake}), но отдёргивает руку: ${entry.dodge} против ${entry.bite}.` };
}
/** Everything a hoard table shows: seats around the basket, the snake's roll, the pot and the latest events. */
export function hoardView(state, user, me, { portrait, online }) {
  const host = controlsSeat(state.seats[0], user) || user.isGM, gathering = state.phase === "gathering", playing = state.phase === "playing";
  const closed = ["finished", "cancelled"].includes(state.phase), payouts = closed && state.reason !== "cancelled" ? hoardPayouts(state) : null;
  const seats = state.seats.map((seat, index) => ({
    index, name: seat.name, img: portrait(seat), online: online(seat), npc: Boolean(seat.npc), mine: index === me, controlled: controlsSeat(seat, user),
    collected: seat.collected ?? 0, coins: coinWord(state, seat.collected ?? 0), bites: seat.bites ?? 0, out: !seat.active && !gathering, caught: Boolean(seat.caught),
    doped: Boolean(seat.doped && (controlsSeat(seat, user) || user.isGM)), payout: payouts ? coinWord(state, payouts[index]) : "",
    status: gathering ? index === 0 ? "Хозяин стола" : "За столом" : seat.caught ? "Пойман" : !seat.active ? "Отошёл" : playing ? seat.acted ? "Ждёт раунда" : index === me ? "Ваш черёд" : "Тянется к корзине" : "",
    canKick: gathering && host && index > 0
  }));
  const empty = gathering ? Array.from({ length: HOARD_MAX - seats.length }, (_, i) => ({ index: seats.length + i })) : [];
  const leader = closed && state.reason !== "cancelled" ? hoardLeader(state) : null;
  return {
    hoard: { seats, empty, pot: state.pot ?? 0, potLabel: coinWord(state, state.pot ?? 0), grab: coinWord(state, state.grab ?? 5), per: coinWord(state, state.per ?? 10),
      snake: state.snake?.total ?? null, round: state.round ?? 0, coins: Array.from({ length: Math.min(12, Math.ceil((state.pot ?? 0) / Math.max(1, state.grab ?? 5))) }, (_, i) => ({ i })),
      log: (state.log ?? []).slice(-6).reverse().map(entry => logLine(state, entry, user)), awareness: SNAKE_AWARENESS, bite: SNAKE_BITE, min: HOARD_MIN, max: HOARD_MAX,
      leader: leader === null ? "" : state.seats[leader].name },
    canStart: gathering && host && state.seats.length >= HOARD_MIN, canJoin: gathering && state.seats.length < HOARD_MAX && !state.seats.some(seat => seat.userId === user.id && !seat.npc),
    canAddNpc: gathering && user.isGM && state.seats.length < HOARD_MAX,
    canReach: playing && me >= 0 && state.seats[me].active && !state.seats[me].acted && Boolean(state.snake),
    canLeave: playing && me >= 0 && state.seats[me].active || gathering && me > 0
  };
}
