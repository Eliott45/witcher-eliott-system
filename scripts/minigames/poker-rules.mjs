/** Dice poker from «Развлечения в таверне». Equal combinations use poker kickers,
 * an explicit table convention because the supplement does not specify a tie-break. */
export const POKER_HANDS = ["Без комбинации", "Пара", "Две пары", "Сет", "Малый стрейт", "Большой стрейт", "Фулхаус", "Каре", "Покер"];
export function pokerHand(dice) {
  if (!Array.isArray(dice) || dice.length !== 5 || dice.some(n => !Number.isInteger(n) || n < 1 || n > 6)) throw new Error("Нужны пять шестигранных костей.");
  const counts = new Map(); for (const n of dice) counts.set(n, (counts.get(n) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const sorted = [...dice].sort((a, b) => a - b), sum = dice.reduce((a, b) => a + b, 0);
  const rank = groups[0][1] === 5 ? 8 : groups[0][1] === 4 ? 7 : groups[0][1] === 3 && groups[1][1] === 2 ? 6
    : sorted.join("") === "23456" ? 5 : sorted.join("") === "12345" ? 4 : groups[0][1] === 3 ? 3
      : groups[0][1] === 2 && groups[1][1] === 2 ? 2 : groups[0][1] === 2 ? 1 : 0;
  return { rank, name: POKER_HANDS[rank], sum, values: rank ? groups.map(([face]) => face) : [sum] };
}
export function comparePoker(a, b, tieMode = "faces") {
  const left = pokerHand(a), right = pokerHand(b);
  if (left.rank !== right.rank) return Math.sign(left.rank - right.rank);
  if (left.rank && tieMode === "draw") return 0;
  for (let i = 0; i < left.values.length; i++) if (left.values[i] !== right.values[i]) return Math.sign(left.values[i] - right.values[i]);
  return 0;
}
export function rerollIndices(indices) {
  if (!Array.isArray(indices) || indices.length > 5 || indices.some(i => !Number.isInteger(i) || i < 0 || i > 4) || new Set(indices).size !== indices.length) throw new Error("Выберите от нуля до пяти разных костей.");
  return [...indices].sort((a, b) => a - b);
}
export function wagerAmount(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > 1000000) throw new Error("Ставка — целое число от 0 до 1 000 000 крон.");
  return n;
}
export const pokerClosed = state => ["finished", "declined", "cancelled"].includes(state?.phase);
export const pokerSeat = (state, userId) => state.seats.findIndex(seat => seat.userId === userId);
export function requirePokerAction(state, userId, action, revision) {
  if (!state || state.version !== 1) throw new Error("Этот стол недоступен.");
  const seat = pokerSeat(state, userId);
  if (seat < 0) throw new Error("Вы не участник этой партии.");
  // Concurrent moves by different seats are valid; each seat has its own revision.
  if (state.seats[seat].revision !== revision) throw new Error("Ход уже обработан. Стол обновлён.");
  const row = state.seats[seat];
  const allowed = action === "accept" ? state.phase === "invited" && seat === 1
    : action === "decline" ? state.phase === "invited" && seat === 1
      : action === "cancel" ? state.phase === "invited" && seat === 0
        : action === "roll" ? state.phase === "opening" && !row.opening
          : action === "reroll" ? state.phase === "drawing" && !row.draw
            : action === "finish" ? state.phase === "drawing" && Boolean(row.draw) && !row.final
              : action === "concede" ? ["opening", "drawing"].includes(state.phase) : false;
  if (!allowed) throw new Error("Сейчас это действие недоступно.");
  return seat;
}
export function revealPoker(state, hands) {
  hands.forEach(pokerHand);
  const comparison = comparePoker(hands[0], hands[1], state.tieMode);
  return { ...state, phase: "settling", hands, winner: comparison === 0 ? null : comparison > 0 ? 0 : 1, reason: "showdown" };
}
