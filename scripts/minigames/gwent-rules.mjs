/** Gwent from «Развлечения в таверне»: up to three rounds, each a d10 card draw added to Gambling or Tactics. */
export const GWENT_SKILLS = { gambling: "Азартные игры", tactics: "Тактика" };
export const GWENT_MAX_FORGERIES = 3;
export const GWENT_CARDS = [
  { faces: [1], key: "hero", name: "Карта героя", mod: 3, icon: "fa-crown", text: "Вы вытянули карту могущественного героя из своей колоды!" },
  { faces: [2], key: "badHand", name: "Плохая рука", mod: -3, icon: "fa-heart-crack", text: "Карты против вас — этот раунд, вероятно, проигран." },
  { faces: [3], key: "leader", name: "Карта лидера", mod: 2, icon: "fa-chess-king", text: "Лидер расширяет возможности ваших рядов." },
  { faces: [4], key: "badShuffle", name: "Плохое тасование", mod: -2, icon: "fa-shuffle", text: "Карты плохо перемешались." },
  { faces: [5, 6], key: "weather", name: "Карты погоды", mod: 1, icon: "fa-cloud-showers-heavy", text: "Погода даёт вам серьёзное преимущество." },
  { faces: [7, 8], key: "spy", name: "Карта шпиона", mod: -1, icon: "fa-user-secret", text: "Вражеский шпион проскальзывает в ваш ряд." },
  { faces: [9], key: "sacrifice", name: "Вынужденная жертва", mod: -2, icon: "fa-hand-holding-heart", text: "−2 в этом раунде, но +3 в следующем. В последнем раунде бонус пропадает." },
  { faces: [10], key: "path", name: "Путь к победе", mod: 0, icon: "fa-route", text: "Повторный бросок по таблице. В первом раунде ничего не даёт." }
];
export const gwentCard = face => GWENT_CARDS.find(card => card.faces.includes(face)) ?? null;
/** Draws one card. `roll` returns a d10 face; «Путь к победе» rerolls the table except in the first round. */
export async function drawGwentCard(roll, round) {
  const faces = [await roll()];
  if (faces[0] === 10 && round > 1) while (faces.at(-1) === 10 && faces.length < 6) faces.push(await roll());
  const card = gwentCard(faces.at(-1));
  if (!card) throw new Error("На d10 может выпасть от 1 до 10.");
  return { faces, key: card.key, name: card.name, mod: card.mod, path: faces.length > 1, carry: card.key === "sacrifice" ? 3 : 0 };
}
export const gwentDeckBonus = ({ quality = 0, fakes = 0 } = {}) => clamp(quality, 0, 3) + clamp(fakes, 0, GWENT_MAX_FORGERIES);
export function clamp(value, min, max) { const n = Math.trunc(Number(value) || 0); return Math.min(max, Math.max(min, n)); }
/** Fake cards count up to three; the easiest one to spot sets the Awareness DC. */
export function gwentForgeries(list) {
  const valid = (Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite).sort((a, b) => b - a).slice(0, GWENT_MAX_FORGERIES);
  return { count: valid.length, dc: valid.length ? Math.min(...valid) : 0 };
}
export const gwentStart = () => ({ round: 1, rounds: [{ plays: [null, null], winner: null }], score: [0, 0], carry: [0, 0] });
/** Settles the current round once both players have played: two won rounds end the match, as does the third round. */
export function settleGwentRound(state) {
  const current = state.rounds[state.round - 1];
  if (!current.plays.every(Boolean)) return state;
  const [left, right] = current.plays, winner = left.total === right.total ? null : left.total > right.total ? 0 : 1;
  const score = state.score.map((value, index) => value + (winner === index ? 1 : 0));
  const rounds = state.rounds.map((round, index) => index === state.round - 1 ? { ...round, winner } : round);
  const caught = current.plays.flatMap((play, index) => play.spotted ? [index] : []);
  if (caught.length) return { ...state, rounds, score, phase: "settling", caught, winner: caught.length === 1 ? 1 - caught[0] : null, reason: "caught" };
  if (score.some(value => value >= 2) || state.round >= 3) {
    return { ...state, rounds, score, phase: "settling", caught: [], winner: score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1, reason: "showdown" };
  }
  return { ...state, rounds: [...rounds, { plays: [null, null], winner: null }], score, round: state.round + 1, carry: current.plays.map(play => play.carry ?? 0) };
}
