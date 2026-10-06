import { SYSTEM_ID } from "../config.mjs";
import { createGroupAmbush, cancelGroupAmbush, groupAmbush, publishGroupCard, startGroupCombat } from "../combat/group-ambush.mjs";
import { tacticsWrite } from "../combat/combat-tactics.mjs";
import { ambushCandidates, ambushWindowContext } from "./ambush-context.mjs";
import { bindGroupCard } from "../chat/group-ambush.mjs";

const windows = new Map();
export class AmbushWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes:["witcher-ambush-window"],position:{width:830,height:730},
    window:{title:"Групповая засада",icon:"fa-solid fa-user-ninja",resizable:true},
    actions:{publishAmbush:AmbushWindow.#publish,cancelAmbush:AmbushWindow.#cancel,repeatCard:AmbushWindow.#card,
      startBattle:AmbushWindow.#start,defaultRoles:AmbushWindow.#defaults}
  };
  static PARTS = {content:{template:`systems/${SYSTEM_ID}/templates/ambush-window.hbs`,scrollable:[".witcher-ambush-body"]}};
  constructor(scene) {
    super(); this.scene = scene; this.roles = new Map(); this.busy = false; this.notice = "";
    this.query = "";
    const existing = game.combats.find(combat => combat.scene?.id === scene.id && groupAmbush(combat));
    for (const row of groupAmbush(existing)?.entries ?? []) {
      const token = scene.tokens.find(token => token.uuid === row.token); if (token) this.roles.set(token.id,row.role);
    }
    if (!this.roles.size) this.setDefaults();
    this.hooks = ["updateCombat","createCombatant","updateCombatant","deleteCombatant","deleteCombat","createToken","updateToken","deleteToken"].map(event =>
      [event,Hooks.on(event,() => {if (!this.busy) this.render({force:true});})]);
  }
  setDefaults() {
    this.roles = new Map(ambushCandidates(this.scene).map(token => [token.id,token.disposition === 1 ? "stealth" : token.disposition === -1 ? "awareness" : "none"]));
  }
  async _prepareContext() {
    const view = ambushWindowContext(this.scene,this);
    return {...view,query:this.query,notice:this.notice};
  }
  async _onRender(context, options) {
    await super._onRender(context,options);
    for (const select of this.element.querySelectorAll("[data-ambush-role]")) select.addEventListener("change",() => {
      this.roles.set(select.dataset.ambushRole,select.value); this.render({force:true});
    });
    const search = this.element.querySelector("[data-ambush-search]");
    if (search) {
      const filter = () => {
        this.query = search.value;
        for (const row of this.element.querySelectorAll("[data-search]")) row.hidden = !row.dataset.search.includes(this.query.trim().toLocaleLowerCase());
      };
      search.addEventListener("input",filter); filter();
    }
    if (context.locked) bindGroupCard(this.element,game.combats.get(context.combatId),context.sessionId);
  }
  async runWrite(work) {
    if (this.busy || !game.user.isGM) return;
    this.busy = true; this.notice = ""; await this.render({force:true});
    try { await work(); } catch (error) { this.notice = error.message; ui.notifications.warn(error.message); }
    finally { this.busy = false; await this.render({force:true}); }
  }
  async close(options) {
    if (this.busy) return this;
    for (const [event,id] of this.hooks) Hooks.off(event,id);
    windows.delete(this.scene.id); return super.close(options);
  }
  static #defaults() {this.setDefaults();return this.render({force:true});}
  static #publish() {return this.runWrite(() => createGroupAmbush(this.scene,[...this.roles].filter(([,role]) => role !== "none").map(([tokenId,role]) => ({tokenId,role}))));}
  static #cancel() {const view = ambushWindowContext(this.scene,this), combat = game.combats.get(view.combatId); if(view.canCancel) return this.runWrite(() => tacticsWrite(combat,() => cancelGroupAmbush(combat)));}
  static #card() {const view = ambushWindowContext(this.scene,this); return this.runWrite(() => publishGroupCard(game.combats.get(view.combatId)));}
  static #start() {const view = ambushWindowContext(this.scene,this), combat = game.combats.get(view.combatId); if(view.canStart) return this.runWrite(() => tacticsWrite(combat,() => startGroupCombat(combat)));}

}
export async function openAmbushWindow(sceneId = globalThis.canvas?.scene?.id) {
  if (!game.user.isGM) throw new Error("Настраивать засаду может только мастер.");
  const scene = game.scenes.get(sceneId);
  if (!scene || canvas.scene?.id !== sceneId) throw new Error("Откройте сцену, на которой готовится засада.");
  let app = windows.get(scene.id);
  if (!app) {app = new AmbushWindow(scene);windows.set(scene.id,app);}
  await app.render({force:true});app.bringToFront();return app;
}
