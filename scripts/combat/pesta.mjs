import { SYSTEM_ID } from "../config.mjs";
import { creatureProfile } from "../data/creature-modes.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { immuneToCondition } from "../data/creatures.mjs";
import { ALL_SKILL_KEYS } from "../data/condition-definitions.mjs";
import { CORE_MAGIC } from "../data/spells.mjs";
import { tokenGap } from "./attack-target.mjs";
import { fullTurnStart } from "./full-turn-rules.mjs";
import { activeCreatureGM, creatureFlags, creatureRoll, creaturePost, creatureEffect, pickCreaturePoint, esc } from "./creature-actions-common.mjs";

// Monster Hunter's Journal pp.30–31, pesta: a cloud of infected flies, plague rat swarms and diseased claws.
export const PESTA = { reach: 1, fliesDisease: 25, swarmDisease: 50, ratsPerCall: 2, ratRange: 2 };
export const isPesta = actor => creatureProfile(actor)?.id === "pesta";
export const isPlagueRats = actor => creatureProfile(actor)?.id === "plague-rats";
const dead = actor => Array.from(actor?.effects ?? []).some(effect => activeEffect(effect) && effect.statuses?.has("dead"));
export const pestaFlies = actor => isPesta(actor) && !dead(actor) && !creatureFlags(actor).pestaFliesGone;
const tokenOf = actor => actor?.isToken ? actor.token : actor?.getActiveTokens?.(false, true)?.[0]?.document
  ?? Array.from(globalThis.canvas?.scene?.tokens ?? []).find(token => token.actor === actor) ?? null;

export function fliesEffect(actor) {
  return { name: "Облако мух", img: "icons/svg/biohazard.svg", type: "base", system: {}, statuses: [],
    description: "<p>Рядом с пестой вьются заражённые мухи: −2 ко всем действиям в этом ходу.</p>",
    start: fullTurnStart(actor), duration: { value: 1, units: "rounds", expiry: "turnEnd", expired: false },
    flags: { [SYSTEM_ID]: { pestaFlies: true, condition: { rounds: 1, expiry: "turnEnd", modifiers: [...ALL_SKILL_KEYS.map(key => ({ target: `skills.${key}`, value: -2 })), { target: "attributeCheck", value: -2 }] } } } };
}

/** At the start of every turn: within melee range of a pesta with her flies, −2 to all actions and a 25% chance of disease. */
export async function pestaFliesTurn(combat, combatant, context = {}) {
  if (!activeCreatureGM() || !combat?.started || context.skipped) return;
  const actor = combatant?.actor, token = combatant?.token ?? tokenOf(actor);
  if (!actor || !token || isPesta(actor) || isPlagueRats(actor) || dead(actor)) return;
  const pesta = Array.from(token.parent?.tokens ?? []).find(other => pestaFlies(other.actor) && tokenGap(other, token) <= PESTA.reach);
  if (!pesta) return;
  const key = `${combat.id}:${combat.round}:${combat.turn ?? 0}`;
  if (creatureFlags(actor).pestaFliesTurn === key) return;
  await actor.update({ [`flags.${SYSTEM_ID}.pestaFliesTurn`]: key });
  await actor.createEmbeddedDocuments("ActiveEffect", [fliesEffect(actor)]);
  const immune = immuneToCondition(actor, ["diseased"]), roll = immune ? null : await creatureRoll("1d100"), ill = Boolean(roll && roll.total <= PESTA.fliesDisease);
  if (ill && !Array.from(actor.effects).some(effect => activeEffect(effect) && effect.statuses?.has("diseased")))
    await actor.createEmbeddedDocuments("ActiveEffect", [creatureEffect(actor, "diseased")]);
  await creaturePost(actor, { title: "Облако мух", rolls: roll ? [roll] : [], text: `${esc(actor.name)}: −2 ко всем действиям в этом ходу; болезнь ${PESTA.fliesDisease}%: ${immune ? "невосприимчив" : `${roll.total} — ${ill ? "заболел" : "обошлось"}`}.` });
}

const AIR_SPELLS = () => new Set(CORE_MAGIC.filter(entry => entry.system?.element === "air").map(entry => entry.system.ruleId));
/** A fire attack or a wind spell that hits the pesta scatters her flies. */
export async function onPestaStruck(attack) {
  if (!activeCreatureGM() || !attack?.target) return false;
  const pesta = globalThis.fromUuidSync?.(attack.target)?.actor;
  if (!pestaFlies(pesta)) return false;
  const fire = attack.traits?.types?.includes("elemental") || (attack.hitTraits?.burning ?? 0) > 0, wind = Boolean(attack.spell && AIR_SPELLS().has(attack.ruleId));
  if (!fire && !wind) return false;
  await pesta.update({ [`flags.${SYSTEM_ID}.pestaFliesGone`]: true });
  await creaturePost(pesta, { title: "Облако мух рассеяно", text: `${fire ? "Огонь" : "Ветер"} разгоняет мух песты. Действием она может призвать их снова.` });
  return true;
}

/** World actor for the rat swarm: a copy imported once from the bestiary profile. */
async function ratsActor() {
  const existing = Array.from(game.actors ?? []).find(actor => isPlagueRats(actor));
  if (existing) return existing;
  const { bestiarySources } = await import("../data/bestiary.mjs");
  const source = structuredClone(bestiarySources().find(entry => entry.name === "Стая чумных крыс"));
  source.flags = { ...source.flags, core: { sourceId: `Compendium.${SYSTEM_ID}.bestiary.Actor.${source._id}` } };
  return foundry.documents.Actor.implementation.create(source, { keepId: !game.actors?.has?.(source._id) });
}

/** The caller pays the action. */
export async function usePestaAction(actor, id, options = {}) {
  const source = options.sourceToken ?? tokenOf(actor);
  if (!source) throw new Error("Поставьте песту на сцену.");
  if (id === "pesta-flies") {
    if (!creatureFlags(actor).pestaFliesGone) throw new Error("Облако мух уже вокруг песты.");
    await actor.update({ [`flags.${SYSTEM_ID}.pestaFliesGone`]: false });
    return creaturePost(actor, { title: "Облако мух", text: "Песта снова окружена заражёнными мухами." });
  }
  if (id === "pesta-rats") {
    const points = [];
    for (let index = 0; index < PESTA.ratsPerCall; index++) {
      const point = await pickCreaturePoint(source, { destination: options.positions?.[index], max: PESTA.ratRange + Math.max(source.width ?? 1, source.height ?? 1) * source.parent.grid.distance / 2,
        title: `Чумные крысы: место стаи ${index + 1}/${PESTA.ratsPerCall}` });
      if (!point) return null;
      points.push(point);
    }
    const rats = await ratsActor(), prototype = rats.prototypeToken.toObject(), size = source.parent.grid.size;
    await source.parent.createEmbeddedDocuments("Token", points.map((point, index) => {
      const token = { ...prototype, actorId: rats.id, actorLink: false, name: `${rats.name} ${index + 1}`, x: Math.round(point.x - size / 2), y: Math.round(point.y - size / 2), width: 1, height: 1,
        flags: { [SYSTEM_ID]: { pestaRats: { source: actor.uuid } } } };
      delete token._id; return token;
    }));
    return creaturePost(actor, { title: "Призыв чумных крыс", text: "Рядом с пестой появляются две стаи крыс: они сразу движутся к ближайшему врагу и атакуют его." });
  }
  throw new Error("Неизвестное действие песты.");
}

/** Damage of a rat swarm or similar body-wide attack: a separate roll for each body part, minus its SP. */
export async function bodyWideHit(target, formula) {
  const { blastDamage } = await import("./bombs.mjs"), { burningParts } = await import("./burning.mjs");
  const rolls = {}, dice = [];
  for (const id of burningParts(target)) { const roll = await creatureRoll(formula); dice.push(roll); rolls[id] = roll.total; }
  return { damage: blastDamage(target, rolls, { types: [], piercing: "none", silver: false, silverDice: "" }), dice };
}

