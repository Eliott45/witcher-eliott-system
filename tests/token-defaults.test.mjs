import assert from "node:assert/strict";
import { test } from "node:test";
import { applyActorTokenDefaults } from "../scripts/combat/token-defaults.mjs";

// The hook contract uses a pending document and the caller's partial creation data.
globalThis.CONST = { TOKEN_DISPLAY_MODES: { OWNER_HOVER: 30, NONE:0 }, DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2} };
globalThis.foundry = {
  utils: {
    hasProperty: (object, path) => {
      for (const key of path.split(".")) {
        if (object == null || !Object.hasOwn(object, key)) return false;
        object = object[key];
      }
      return true;
    }
  }
};

function create(type, data = {}) {
  let changes;
  applyActorTokenDefaults({ type, updateSource: value => { changes = value; } }, data);
  return changes;
}

test("new characters have linked tokens and a full 360-degree field of view", () => {
  const changes = create("character");
  assert.equal(changes["prototypeToken.sight.enabled"], true);
  assert.equal(changes["prototypeToken.sight.angle"], 360);
  assert.equal(changes["prototypeToken.actorLink"], true);
  assert.equal(changes["prototypeToken.lockRotation"], false);
  assert.ok(!Object.hasOwn(changes, "prototypeToken.sight.range"), "Do not grant darkvision");
  assert.ok(!Object.hasOwn(changes, "prototypeToken.light"), "Do not make characters emit light");
});

test("NPC resources are independent and default vision is unrestricted", () => {
  const changes = create("npc");
  assert.equal(changes["prototypeToken.actorLink"], false);
  assert.equal(changes["prototypeToken.sight.angle"], 360);
});

test("duplicates and imports preserve explicit values, including false and zero", () => {
  const data = {
    prototypeToken: {
      actorLink: false,
      sight: { enabled: false, angle: 0, range: 24, visionMode: "darkvision" },
      lockRotation: true,
      displayBars: 0
    }
  };
  const original = structuredClone(data);
  assert.deepEqual(create("character", data), {});
  assert.deepEqual(data, original);
});

test("partial prototypes receive only missing defaults", () => {
  const changes = create("character", { prototypeToken: { sight: { angle: 90 } } });
  assert.ok(!Object.hasOwn(changes, "prototypeToken.sight.angle"));
  assert.equal(changes["prototypeToken.sight.enabled"], true);
  assert.equal(changes["prototypeToken.actorLink"], true);
});

test("future non-creature actor types are left alone", () => {
  assert.equal(create("loot"), undefined);
});

test("service tokens are linked, publicly readable, without vision or health bars; imported permissions survive",()=>{
  const defaults=create("services");
  assert.equal(defaults["ownership.default"],2);assert.equal(defaults["prototypeToken.actorLink"],true);
  assert.equal(defaults["prototypeToken.sight.enabled"],false);assert.equal(defaults["prototypeToken.displayBars"],0);
  assert.equal(defaults["prototypeToken.bar1.attribute"],null);assert.ok(defaults.img.endsWith("/services.svg"));
  const imported=create("services",{ownership:{default:0},img:"my-store.webp",prototypeToken:{texture:{src:"my-token.webp"}}});
  assert.equal(imported["ownership.default"],undefined);assert.equal(imported.img,undefined);assert.equal(imported["prototypeToken.texture.src"],undefined);
});
