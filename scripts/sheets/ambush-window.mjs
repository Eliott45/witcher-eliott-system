import { SYSTEM_ID } from "../config.mjs";
import { attackerToken } from "../combat/attack-target.mjs";
import { combatantForToken } from "../combat/tactics-rules.mjs";
import { prepareAmbush, requestTactic } from "../combat/combat-tactics.mjs";
import { rollWeaponAttack } from "../combat/weapon-rolls.mjs";
import { ambushCandidates, ambushWindowContext, defaultAmbushSelection } from "./ambush-context.mjs";

const windows=new Map();
export class AmbushWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS={
    classes:["witcher-ambush-window"],position:{width:800,height:700},
    window:{title:"Засада",icon:"fa-solid fa-user-ninja",resizable:true},
    actions:{selectEnemies:AmbushWindow.#select,selectAll:AmbushWindow.#select,clearSelection:AmbushWindow.#select,
      checkAmbush:AmbushWindow.#check,ambushStrike:AmbushWindow.#attack,revealTarget:AmbushWindow.#reveal,refreshAmbush:AmbushWindow.#refresh}
  };
  static PARTS={content:{template:`systems/${SYSTEM_ID}/templates/ambush-window.hbs`,scrollable:[".witcher-ambush-roster"]}};

  constructor(actor,attacker){
    super();this.actor=actor;this.attacker=attacker;
    this.selection=defaultAmbushSelection(attacker,ambushCandidates(attacker));
    this.query="";this.weaponId="";this.mode="";this.busy=false;this.notice="";
    const refresh=()=>{if(!this.busy)this.render({force:true});};
    this.visibleTokens=ambushCandidates(attacker).map(row=>row.uuid).join("|");
    this.hooks=[
      ...["createCombatant","updateCombatant","deleteCombatant","updateCombat","deleteCombat","canvasReady"].map(event=>[event,Hooks.on(event,refresh)]),
      ["sightRefresh",Hooks.on("sightRefresh",()=>{const visible=ambushCandidates(attacker).map(row=>row.uuid).join("|");if(visible!==this.visibleTokens){this.visibleTokens=visible;refresh();}})],
      ...["createToken","updateToken","deleteToken"].map(event=>[event,Hooks.on(event,token=>{if(token.parent.id===attacker.parent.id)refresh();})]),
      ...["updateActor","createItem","updateItem","deleteItem","createActiveEffect","updateActiveEffect","deleteActiveEffect"].map(event=>[event,Hooks.on(event,doc=>{
        if(doc.uuid===actor.uuid||doc.parent?.uuid===actor.uuid)refresh();
      })])
    ];
  }

  async _prepareContext(){
    const view=ambushWindowContext(this.actor,this.attacker,this);
    this.weaponId=view.weaponId;this.mode=view.mode;
    return {...view,query:this.query,notice:this.notice};
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const search=this.element.querySelector("[data-ambush-search]");
    const filter=()=>{
      this.query=search.value;let count=0;
      for(const row of this.element.querySelectorAll("[data-ambush-row]")){
        row.hidden=!row.dataset.search.includes(this.query.trim().toLocaleLowerCase());if(!row.hidden)count++;
      }
      this.element.querySelector("[data-ambush-empty]").hidden=count>0;
    };
    search.addEventListener("input",filter);filter();
    for(const checkbox of this.element.querySelectorAll("[data-ambush-select]"))checkbox.addEventListener("change",()=>{
      if(!context.canSelect)return;
      if(checkbox.checked)this.selection.add(checkbox.value);else this.selection.delete(checkbox.value);
      this.render({force:true});
    });
    this.element.querySelector("[data-ambush-weapon]").addEventListener("change",event=>{
      [this.weaponId,this.mode]=event.target.value.split(":");this.render({force:true});
    });
  }

  async runWrite(work){
    if(this.busy||!this.actor.isOwner)return;
    this.busy=true;this.notice="";await this.render({force:true});
    try{await work();}catch(error){this.notice=error.message;ui.notifications.warn(error.message);}
    finally{this.busy=false;await this.render({force:true});}
  }
  async close(options){
    if(this.busy)return this;
    for(const [event,id] of this.hooks)Hooks.off(event,id);
    windows.delete(this.attacker.uuid);
    return super.close(options);
  }

  static #select(_event,button){
    const view=ambushWindowContext(this.actor,this.attacker,this);if(!view.canSelect)return;
    this.selection=new Set(view.rows.filter(row=>button.dataset.action==="selectAll"||(button.dataset.action==="selectEnemies"&&row.enemy)).map(row=>row.uuid));
    return this.render({force:true});
  }
  static #refresh(){return this.render({force:true});}
  static #check(){
    const view=ambushWindowContext(this.actor,this.attacker,this);if(!view.canCheck)return;
    const targets=view.rows.filter(row=>row.selected).map(row=>row.uuid);
    return this.runWrite(()=>prepareAmbush(this.actor,{attackerUuid:this.attacker.uuid,targetUuids:targets}));
  }
  static #attack(_event,button){
    const view=ambushWindowContext(this.actor,this.attacker,this),row=view.rows.find(row=>row.uuid===button.dataset.targetUuid);
    if(!row||row.attackDisabled)return;
    return this.runWrite(()=>rollWeaponAttack(this.actor,view.weaponId,{mode:view.mode,attackerUuid:this.attacker.uuid,targetUuid:row.uuid}));
  }
  static #reveal(_event,button){
    const row=ambushWindowContext(this.actor,this.attacker,this).rows.find(row=>row.uuid===button.dataset.targetUuid);
    if(!row?.canReveal)return;
    return this.runWrite(()=>requestTactic(combatantForToken(game.combat,this.attacker),"reveal",{target:row.uuid}));
  }
}

export async function openAmbushWindow(actor){
  if(!actor.isOwner)return;
  const attacker=attackerToken(actor);
  let app=windows.get(attacker.uuid);
  if(!app){app=new AmbushWindow(actor,attacker);windows.set(attacker.uuid,app);}
  await app.render({force:true});app.bringToFront();return app;
}
