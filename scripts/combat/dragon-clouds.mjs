import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID, ROUND_SECONDS } from "../config.mjs";
import { activeEffect } from "../data/effect-counters.mjs";
import { tokenCenter } from "./attack-target.mjs";
import { scatterOffset } from "../canvas/scatter-overlay.mjs";

const cloud = region => region.flags?.[SYSTEM_ID]?.dragonCloud;
const activeGM = () => game.user === game.users?.activeGM;
export const dragonClouds = scene => Array.from(scene?.regions ?? []).filter(region => cloud(region) && !cloud(region).ignited);
const expired = state => state.combatId && game.combat?.started && state.combatId === game.combat.id
  ? game.combat.round >= state.endRound : (game.time?.worldTime ?? 0) >= state.endTime;
const centre = region => ({ x: region.shapes[0].x, y: region.shapes[0].y });
const metres = (scene,a,b) => Math.hypot(a.x-b.x,a.y-b.y)/scene.grid.size*scene.grid.distance;
export async function createDragonCloud(scene, point, message) {
  if (!scene) throw new Error("Сцена облака недоступна.");
  const previous = Array.from(scene.regions ?? []).find(region => cloud(region)?.sourceMessage === message.uuid);
  if (previous) return previous;
  const roll = await evaluateRoll("1d10",{allowInteractive:false}), combat = game.combat, radius = 8/scene.grid.distance*scene.grid.size;
  const [region] = await scene.createEmbeddedDocuments("Region", [{ name: "Сон дракона: горючий газ", color: "#d1b758", visibility: 2,
    shapes: [{ type: "ellipse", x: point.x, y: point.y, radiusX: radius, radiusY: radius, rotation: 0, hole: false, gridBased: false }],
    flags: { [SYSTEM_ID]: { dragonCloud: { sourceMessage: message.uuid, actor: message.speakerActor?.uuid ?? "", direction: roll.total, drift: 0,
      ignited: false, endTime: (game.time?.worldTime ?? 0) + 3*ROUND_SECONDS,
      ...(combat?.started ? { combatId: combat.id, endRound: combat.round+3, lastRound: combat.round } : {}) } } } }]);
  const burning = Array.from(scene.tokens ?? []).find(token => token.actor?.effects.some(effect => activeEffect(effect) && effect.statuses.has("burning")) && metres(scene,point,tokenCenter(token)) <= 8);
  if (burning) await igniteDragonClouds(scene,tokenCenter(burning));
  return region;
}
export async function setCloudDrift(region, raw) {
  if (!game.user.isGM || !cloud(region)) return;
  const drift = Number(raw);
  if (!Number.isFinite(drift) || drift < 0 || drift > 100) throw new Error("Укажите смещение газа от 0 до 100 м за ход; скорость определяет ведущий.");
  await region.update({ [`flags.${SYSTEM_ID}.dragonCloud.drift`]: drift });
}
export async function advanceDragonCloud(region) {
  const state = cloud(region); if (!game.user.isGM || !state || state.ignited) return;
  if (expired(state)) { await region.delete(); return; }
  if (!state.drift) return;
  const offset = scatterOffset(state.direction,0,1), length = Math.hypot(offset.x,offset.y)||1, pixels=state.drift/region.parent.grid.distance*region.parent.grid.size;
  await region.update({ shapes: Array.from(region.shapes).map(shape=>({...shape.toObject?.()??shape,x:shape.x+offset.x/length*pixels,y:shape.y+offset.y/length*pixels})) });
  for (const token of region.parent.tokens ?? []) if(token.actor?.effects.some(effect=>activeEffect(effect)&&effect.statuses.has("burning")))await igniteDragonClouds(region.parent,tokenCenter(token));
}
const ignitions = new WeakMap();
export async function igniteDragonClouds(scene, point, { radius = 0 } = {}) {
  if (!activeGM() || !scene || !point) return;
  for (const region of dragonClouds(scene)) {
    if (expired(cloud(region)) || metres(scene,centre(region),point) > 8+radius) continue;
    if (ignitions.has(region)) { await ignitions.get(region); continue; }
    const work = (async()=>{
      const { postDeviceBlast, applyBlast } = await import("./bombs.mjs");
      const state=cloud(region);
      // Mark before detonating to prevent gas chains from re-entering the same cloud.
      await region.update({[`flags.${SYSTEM_ID}.dragonCloud.ignited`]:true});
      try {
        const message=(state.blast?globalThis.fromUuidSync?.(state.blast):null)??await postDeviceBlast(globalThis.fromUuidSync?.(state.actor),scene,centre(region),{name:"Сон дракона: воспламенение",profile:{
          radius:8,damage:"5d6",burning:75,poison:0,bleeding:0,stunSave:null,freeze:0,
          traits:{types:["elemental"],piercing:"none",silver:false,silverDice:"",nonLethal:false}}});
        if(!state.blast)await region.update({[`flags.${SYSTEM_ID}.dragonCloud.blast`]:message.uuid});
        await applyBlast(message);
        await region.delete();
      } catch(error) { await region.update({[`flags.${SYSTEM_ID}.dragonCloud.ignited`]:false});throw error; }
    })();
    ignitions.set(region,work); try { await work; } finally { ignitions.delete(region); }
  }
}
export async function tickDragonClouds(scene, { move = false } = {}) {
  for (const region of dragonClouds(scene)) {
    const state=cloud(region);
    if(expired(state)){await region.delete();continue;}
    if(move&&game.combat?.started&&state.lastRound!==game.combat.round){
      await region.update({[`flags.${SYSTEM_ID}.dragonCloud.lastRound`]:game.combat.round});await advanceDragonCloud(region);
    }
  }
}
export function registerDragonClouds() {
  Hooks.on("updateCombat",async(_combat,changes)=>{if(activeGM()&&"round" in changes)for(const scene of game.scenes??[])await tickDragonClouds(scene,{move:true});});
  Hooks.on("updateWorldTime",async()=>{if(activeGM())for(const scene of game.scenes??[])await tickDragonClouds(scene);});
  Hooks.on("createActiveEffect",async effect=>{
    if(!activeGM()||!effect.statuses?.has("burning")||!activeEffect(effect))return;
    const actor=effect.parent,tokens=actor?.isToken?[actor.token]:Array.from(actor?.getActiveTokens?.(false,true)??[]).map(token=>token.document??token);
    for(const token of tokens)await igniteDragonClouds(token.parent,tokenCenter(token));
  });
  Hooks.on("updateToken",async token=>{
    if(activeGM()&&token.actor?.effects.some(effect=>activeEffect(effect)&&effect.statuses.has("burning")))await igniteDragonClouds(token.parent,tokenCenter(token));
  });
}
