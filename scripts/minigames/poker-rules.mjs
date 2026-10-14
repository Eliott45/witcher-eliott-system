/** Dice poker from «Развлечения в таверне». Equal combinations use poker kickers,
 * an explicit table convention because the supplement does not specify a tie-break. */
export const POKER_HANDS = ["Без комбинации", "Пара", "Две пары", "Сет", "Малый стрейт", "Большой стрейт", "Фулхаус", "Каре", "Покер"];
/** «Шулерские кости»: one die may be changed after seeing every die; spotting it is Awareness DC 16. */
export const LOADED_DICE_DC = 16;
/** Gaming gear that can start a game straight from the inventory. */
export const TAVERN_GAMES = { poker: { name: "Покер на костях", icon: "fa-dice" }, gwent: { name: "Гвинт", icon: "fa-layer-group" } };
export const POKER_ITEMS = { "gear.dice-poker-board": "poker", "gear.loaded-dice": "poker", "gear.gwent-deck": "gwent" };
export const gameOf = state => state?.game === "gwent" ? "gwent" : "poker";
export function pokerItemContext(item) {
  const game = POKER_ITEMS[item?.system?.ruleId];
  return game && item.actor ? { game, label: `${TAVERN_GAMES[game].name}: бросить вызов`, icon: TAVERN_GAMES[game].icon } : null;
}
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
/** Dice positions that form the combination, for highlighting on the table. */
export function pokerScoring(dice) {
  const { rank } = pokerHand(dice);
  if ([4, 5, 6, 8].includes(rank)) return [0, 1, 2, 3, 4];
  if (!rank) return [];
  const counts = new Map(); for (const n of dice) counts.set(n, (counts.get(n) ?? 0) + 1);
  return dice.flatMap((face, index) => counts.get(face) > 1 ? [index] : []);
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
  const row = state.seats[seat], gwent = gameOf(state) === "gwent";
  if (["roll", "reroll", "finish"].includes(action) && gwent || action === "play" && !gwent) throw new Error("Сейчас это действие недоступно.");
  const allowed = action === "accept" ? state.phase === "invited" && seat === 1
    : action === "decline" ? state.phase === "invited" && seat === 1
      : action === "cancel" ? state.phase === "invited" && seat === 0
        : action === "roll" ? state.phase === "opening" && !row.opening
          // The single reroll is final: keeping every die is a reroll of nothing.
          : action === "reroll" ? state.phase === "drawing" && !row.draw
            // Only a player carrying loaded dice gets the extra moment before the reveal.
            : action === "finish" ? state.phase === "palming" && Boolean(row.palm) && !row.final
              : action === "play" ? state.phase === "playing" && !state.rounds?.[state.round - 1]?.plays[seat]
                : action === "concede" ? ["opening", "drawing", "palming", "playing"].includes(state.phase) : false;
  if (!allowed) throw new Error("Сейчас это действие недоступно.");
  return seat;
}
/** Caught cheaters lose; if both are caught nobody wins and the stakes return. */
export function revealPoker(state, hands, caught = []) {
  hands.forEach(pokerHand);
  if (caught.length) return { ...state, phase: "settling", hands, caught, winner: caught.length === 1 ? 1 - caught[0] : null, reason: "caught" };
  const comparison = comparePoker(hands[0], hands[1], state.tieMode);
  return { ...state, phase: "settling", hands, caught: [], winner: comparison === 0 ? null : comparison > 0 ? 0 : 1, reason: "showdown" };
}
