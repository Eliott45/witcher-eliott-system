import { test } from "node:test";
import assert from "node:assert/strict";
import { constellation, buildSky } from "../scripts/sheets/advancement-sky.mjs";
import { SKILLS, SKILL_GROUPS } from "../scripts/data/skills.mjs";

test("a constellation is seeded, stays on its field and links every star once", () => {
  const sky = constellation(10, "skills:intelligence");
  assert.deepEqual(constellation(10, "skills:intelligence"), sky);
  assert.notDeepEqual(constellation(10, "skills:reflex").points, sky.points);
  assert.equal(sky.points.length, 10);
  for (const { x, y } of sky.points) { assert.ok(x >= 12 && x <= 88); assert.ok(y >= 12 && y <= 88); }
  // A spanning tree: n − 1 edges and every star reachable from the first.
  assert.equal(sky.edges.length, 9);
  const seen = new Set([0]);
  for (let pass = 0; pass < 10; pass++) for (const [a, b] of sky.edges) if (seen.has(a) || seen.has(b)) { seen.add(a); seen.add(b); }
  assert.equal(seen.size, 10);
  assert.deepEqual(constellation(1, "one"), { points: constellation(1, "one").points, edges: [] });
  assert.deepEqual(constellation(0, "none"), { points: [], edges: [] });
});

test("skills form one constellation per attribute; the chosen star and planned ranks are carried over", () => {
  const rows = SKILLS.filter(skill => skill.key !== "language").map(skill => ({ id: `skill:${skill.key}`, key: skill.key, name: skill.key,
    level: skill.key === "swordsmanship" ? 4 : 0, displayLevel: skill.key === "swordsmanship" ? 4 : 0, displayTarget: skill.key === "swordsmanship" ? 6 : 0 }));
  const sky = buildSky(rows, "skills", { star: "skill:swordsmanship" });
  assert.deepEqual(sky.groups.map(group => group.id), SKILL_GROUPS);
  assert.equal(sky.active.id, "reflex");
  assert.equal(sky.star.id, "skill:swordsmanship");
  assert.equal(sky.star.rank, 4);
  assert.equal(sky.star.plan, 2);
  assert.equal(sky.active.planned, 2);
  assert.equal(sky.active.lines.length, sky.active.stars.length - 1);
  // An explicit group wins; an unknown one falls back to the first.
  assert.equal(buildSky(rows, "skills", { group: "will" }).active.id, "will");
  assert.equal(buildSky(rows, "skills", { group: "nope" }).active.id, "intelligence");
  const single = buildSky(rows.slice(0, 3), "attributes", {});
  assert.equal(single.single, true);
  assert.equal(buildSky([], "languages", {}), null);
});
