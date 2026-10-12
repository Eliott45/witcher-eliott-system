import test from "node:test";
import assert from "node:assert/strict";
import { registerSystemSettings,ensureSystemLanguage,automaticCriticalDice } from "../scripts/settings.mjs";

test("automatic critical rolls are enabled by default and language preference is per client",async()=>{
  const registered=new Map();
  globalThis.game={settings:{register:(_scope,key,data)=>registered.set(key,data),get:(_scope,key)=>key==="systemLanguage"?"ru":false},i18n:{translations:{CORE:{label:"Keep"}}}};
  globalThis.fetch=async url=>{assert.match(url,/\/lang\/ru.json$/);return {ok:true,json:async()=>({WITCHER:{Test:"Привет"}})};};
  globalThis.foundry={utils:{mergeObject:(target,source)=>Object.assign(target,source)}};
  registerSystemSettings();await ensureSystemLanguage();
  assert.equal(registered.get("automaticCriticalDice").default,true);
  assert.equal(registered.get("automaticCriticalDice").scope,"world");
  assert.equal(registered.get("bookMonsters").default,false);
  assert.equal(registered.get("bookMonsters").scope,"world");
  assert.equal(registered.get("systemLanguage").scope,"client");
  assert.equal(registered.get("systemLanguage").requiresReload,true);
  assert.equal(game.i18n.translations.WITCHER.Test,"Привет");assert.equal(game.i18n.translations.CORE.label,"Keep");
  assert.equal(automaticCriticalDice(),false);
  game.settings.get=()=>true;assert.equal(automaticCriticalDice(),true);
});
