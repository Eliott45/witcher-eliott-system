import { SKILLS, SKILL_GROUPS } from "../data/skills.mjs";
import { ATTRIBUTE_ICONS } from "./statistics-context.mjs";

// The advancement window draws each group of entries as a constellation: skills by their attribute, languages and
// attributes as one sign each. Positions are seeded by the group, so a sky looks the same every time it opens.

/** A small seeded generator (mulberry32 over an FNV-1a hash of the seed). */
function seeded(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return () => {
    hash = (hash + 0x6D2B79F5) | 0;
    let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` stars spread over a 100×100 field (best-candidate sampling keeps room for the labels) and joined by a
 * minimum spanning tree, which reads as a constellation: every star linked, no crossings of the obvious kind.
 */
export function constellation(count, seed, { margin = 12, aspect = 0.62 } = {}) {
  const random = seeded(seed), points = [];
  // Labels sit under the stars and are wide: horizontal distance counts for less than vertical.
  const gap = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  for (let i = 0; i < count; i++) {
    let best = null, bestGap = -1;
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = { x: margin + random() * (100 - margin * 2), y: margin + random() * (100 - margin * 2) };
      const nearest = points.length ? Math.min(...points.map(point => gap(point, candidate))) : Infinity;
      if (nearest > bestGap) { best = candidate; bestGap = nearest; }
    }
    points.push(best);
  }
  const edges = [], linked = new Set(count ? [0] : []);
  while (linked.size < count) {
    let shortest = null;
    for (const a of linked) for (let b = 0; b < count; b++) {
      if (linked.has(b)) continue;
      const length = Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y);
      if (!shortest || length < shortest.length) shortest = { a, b, length };
    }
    edges.push([shortest.a, shortest.b]);
    linked.add(shortest.b);
  }
  return { points: points.map(point => ({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 })), edges };
}

const rankOf = value => Number.isFinite(value) ? value : 0;

/** Groups, the active constellation with its stars and lines, thumbnails of the others, and the chosen star. */
export function buildSky(rows, category, { group = "", star = "", localize = key => key } = {}) {
  const attributeOf = key => SKILLS.find(skill => skill.key === key)?.attribute;
  const groups = (category === "skills"
    ? SKILL_GROUPS.map(id => ({ id, name: localize(`WITCHER.Attributes.${id}.Label`), short: localize(`WITCHER.Attributes.${id}.Short`),
      icon: `fa-solid ${ATTRIBUTE_ICONS[id] ?? "fa-star"}`, rows: rows.filter(row => attributeOf(row.key) === id) }))
    : [{ id: category, name: localize(`WITCHER.Advancement.Categories.${category}`), short: "",
      icon: category === "languages" ? "fa-solid fa-language" : "fa-solid fa-person", rows }]).filter(entry => entry.rows.length);
  if (!groups.length) return null;
  const sky = groups.map(entry => {
    const { points, edges } = constellation(entry.rows.length, `${category}:${entry.id}`);
    const stars = entry.rows.map((row, index) => {
      const level = rankOf(row.level), target = rankOf(Number(row.displayTarget)), plan = Math.max(0, target - level);
      return { ...row, x: points[index].x, y: points[index].y, rank: level, plan, magnitude: Math.min(10, level + plan),
        twinkle: (2.4 + (index * 0.37) % 2.2).toFixed(2), delay: ((index * 0.61) % 3).toFixed(2), unset: row.level === null };
    });
    const lines = edges.map(([a, b]) => ({ x1: stars[a].x, y1: stars[a].y, x2: stars[b].x, y2: stars[b].y,
      lit: stars[a].rank > 0 && stars[b].rank > 0, planned: stars[a].plan > 0 || stars[b].plan > 0 }));
    return { ...entry, stars, lines, planned: stars.reduce((sum, entry) => sum + entry.plan, 0),
      learned: stars.filter(entry => entry.rank > 0).length };
  });
  const active = sky.find(entry => entry.id === group) ?? sky.find(entry => entry.stars.some(entry => entry.id === star)) ?? sky[0];
  const chosen = active.stars.find(entry => entry.id === star) ?? active.stars.find(entry => entry.plan) ?? active.stars[0];
  for (const entry of sky) entry.active = entry === active;
  for (const entry of active.stars) entry.chosen = entry === chosen;
  return { groups: sky, active, star: chosen, single: sky.length === 1 };
}
