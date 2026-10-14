import { GWENT_CARDS, GWENT_SKILLS, gwentCard } from "./gwent-rules.mjs";
import { skillValue } from "../data/skills.mjs";

const signed = value => value > 0 ? `+${value}` : `${value}`;
export const gwentRules = GWENT_CARDS.map(card => ({ faces: card.faces.join("–"), name: card.name, mod: card.mod ? signed(card.mod) : "", text: card.text, icon: card.icon }));
export function gwentSkills(actor, chosen = "") {
  const values = Object.entries(GWENT_SKILLS).map(([key, label]) => {
    let total = 0;
    try { total = actor ? skillValue(actor.system, key)?.total ?? 0 : 0; } catch { total = 0; }
    return { key, label, total };
  });
  const best = values.reduce((a, b) => b.total > a.total ? b : a).key, pick = GWENT_SKILLS[chosen] ? chosen : best;
  return values.map(entry => ({ ...entry, value: signed(entry.total), selected: entry.key === pick }));
}
function playView(play, faded = false) {
  if (!play) return null;
  const card = gwentCard(play.card.faces.at(-1)) ?? {};
  const parts = [{ label: "d10", value: `${play.die}` }, { label: GWENT_SKILLS[play.skill], value: signed(play.skillValue) }, { label: "Карта", value: signed(play.card.mod) }];
  if (play.deck) parts.push({ label: "Колода", value: signed(play.deck) });
  if (play.carry) parts.push({ label: "Жертва", value: signed(play.carry) });
  return { faded, name: play.card.name, icon: card.icon ?? "fa-layer-group", text: card.text ?? "", mod: play.card.mod ? signed(play.card.mod) : "0",
    tone: play.card.mod > 0 ? "good" : play.card.mod < 0 ? "bad" : "even", path: play.card.path ? `Путь к победе: ${play.card.faces.join(" → ")}` : "",
    parts, total: play.total, key: `${play.card.faces.join(".")}:${play.total}` };
}
/** Everything at a gwent table is public: drawn cards, rolls and the round score. */
export function gwentSeat(state, index) {
  const current = state.rounds[state.round - 1]?.plays[index], previous = state.round > 1 ? state.rounds[state.round - 2]?.plays[index] : null;
  const showPrevious = !current && previous && state.phase === "playing";
  return {
    play: playView(current ?? (showPrevious ? previous : state.rounds.findLast(round => round.plays[index])?.plays[index]), Boolean(showPrevious)),
    gems: [0, 1].map(gem => ({ won: state.score[index] > gem })),
    history: state.rounds.filter(round => round.plays.every(Boolean)).map((round, number) => ({ round: number + 1, total: round.plays[index].total,
      result: round.winner === null ? "draw" : round.winner === index ? "won" : "lost" })),
    played: Boolean(current)
  };
}
export function gwentRoundLine(state) {
  const done = state.rounds.filter(round => round.plays.every(Boolean)), last = done.at(-1);
  if (!last) return "";
  const [a, b] = last.plays.map(play => play.total);
  return `Раунд ${done.length}: ${a} — ${b}, ${last.winner === null ? "ничья" : `берёт ${state.seats[last.winner].name}`}`;
}
