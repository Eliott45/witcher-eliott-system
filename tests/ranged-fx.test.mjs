import { test } from "node:test";
import assert from "node:assert/strict";
import { blastStyle, thrownShape, projectileLook } from "../scripts/canvas/fx/ranged-fx.mjs";
import { bombProfile } from "../scripts/combat/bombs.mjs";
import { readFile } from "node:fs/promises";

const equipment = JSON.parse(await readFile(new URL("../pack-sources/equipment.json", import.meta.url), "utf8"));
const byRule = id => equipment.find(entry => entry.system?.ruleId === id);

test("every bomb and trap gets the blast that matches what it does", () => {
  const expected = { "bomb.grapeshot": "shrapnel", "bomb.dancing-star": "fire", "bomb.samum": "flash", "bomb.northern-wind": "frost",
    "bomb.devils-puffball": "poison", "bomb.dragon-dream": "gas", "bomb.moon-dust": "moon", "bomb.dimeritium": "dimeritium",
    "trap.biter": "shrapnel", "trap.claw": "jaws", "trap.conflagration": "fire", "trap.fury": "fury", "trap.marker": "paint", "trap.talgar-winter": "frost" };
  for (const [id, style] of Object.entries(expected)) assert.equal(blastStyle(id, bombProfile(byRule(id))), style, id);
  // The explosive arrow's device blast carries no rule id: plain damage reads as shrapnel.
  assert.equal(blastStyle("", { radius: 2, damage: "4d6", burning: 0 }), "shrapnel");
});

test("thrown weapons fly by their shape; arrows by their ammunition and relic bows", () => {
  assert.equal(thrownShape(byRule("weapon.throwing-knife")), "knife");
  assert.equal(thrownShape(byRule("weapon.throwing-axe")), "axe");
  assert.equal(thrownShape(byRule("weapon.orion")), "star");
  assert.equal(thrownShape({ name: "Копьё", system: { ruleId: "weapon.spear", skill: "staffSpear" } }), "spear");
  assert.equal(projectileLook({ kind: "arrow", ammo: "ammunition.broadhead" }).head, "broad");
  assert.equal(projectileLook({ kind: "bolt", ammo: "ammunition.explosive" }).fuse, true);
  assert.equal(projectileLook({ kind: "bolt" }).bolt, true);
  assert.equal(projectileLook({ kind: "arrow", weapon: "weapon.moon-bow" }).frost, true);
  assert.equal(projectileLook({ kind: "arrow", ammo: "unknown" }).head, "leaf", "unknown ammunition looks standard");
});
