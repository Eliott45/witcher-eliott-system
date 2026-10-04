import { SYSTEM_ID, COMBAT_ACTOR_TYPES } from "../config.mjs";
import { SERVICE_GROUPS, SERVICE_PRESETS, SEA_ROUTES, getServiceRule, applyServicePreset } from "../data/core-services.mjs";
import { serviceQuote, validateServiceEntries, crowns } from "../services/quotes.mjs";
import { requestService, serviceOrder, resolveServiceOrder, canResolveServices, ORDER_STATES } from "../services/orders.mjs";

const guarded = action => async function(...args) {
  try{return await action.apply(this,args);}catch(error){ui.notifications.error(error.message);console.error(`${SYSTEM_ID} | Services`,error);}
};
const ruleText = entry => {
  const rules=getServiceRule(entry)?.rules;
  if(!rules)return "";
  const details=[];
  if(rules.skillBases)details.push(`Основа ${rules.skillChoice?"по специализации: ":"навыка: "}${rules.skillBases.map(skill=>`${skill.name??game.i18n.localize(`WITCHER.Skills.Entries.${skill.skill}.Label`)} ${skill.value}`).join(rules.skillChoice?" или ":", ")}`);
  if(rules.duration)details.push(`Срок: ${rules.duration}`);
  if(rules.lockDC)details.push(`Взлом дверного замка: СЛ ${rules.lockDC}`);
  return details.join(" · ");
};

export class WitcherServicesSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  selectedServiceId="";
  customerUuid="";
  draft={quantity:1};
  note="";
  static DEFAULT_OPTIONS={
    classes:["witcher-eliott","services-sheet"],position:{width:900,height:740},window:{resizable:true},
    form:{submitOnChange:false,closeOnSubmit:false},
    actions:{
      selectService:guarded(async function(_e,target){this.selectedServiceId=target.dataset.serviceId;this.draft={quantity:1};this.note="";await this.render();}),
      sendServiceOrder:guarded(async function(_e,target){
        const {customer,parameters,note}=this.readOrder();target.disabled=true;
        try{await requestService(this.actor,customer,this.selectedServiceId,parameters,note);ui.notifications.info("Заказ отправлен мастеру. Оплата — после его подтверждения.");}
        finally{target.disabled=false;}
      }),
      resolveServiceOrder:guarded(async function(_e,target){
        target.disabled=true;
        try{await resolveServiceOrder(game.messages.get(target.dataset.messageId),target.dataset.accept==="true");}
        finally{target.disabled=false;await this.render();}
      }),
      saveServiceSettings:guarded(async function(){await this.saveSettings();}),
      applyServicePreset:guarded(async function(){
        if(!this.isEditable)return;
        const settings=this.readSettings();settings["system.services"]=applyServicePreset(settings["system.services"],this.element.querySelector('[data-preset]').value);
        await this.actor.update(settings);
      }),
      addCustomService:guarded(async function(){
        if(!this.isEditable)return;
        const settings=this.readSettings();settings["system.services"].push({id:foundry.utils.randomID(),ruleId:"",name:"Новая услуга",description:"",price:0,pricing:"fixed",unit:"услуга",group:"services",enabled:true});
        await this.actor.update(settings);
      }),
      removeCustomService:guarded(async function(_e,target){
        if(!this.isEditable)return;
        const settings=this.readSettings();settings["system.services"]=settings["system.services"].filter(entry=>entry.ruleId||entry.id!==target.dataset.serviceId);
        await this.actor.update(settings);
      }),
      servicePortrait:guarded(async function(){
        if(!this.isEditable)return;
        await new foundry.applications.apps.FilePicker.implementation({type:"image",current:this.actor.img,document:this.actor,callback:path=>this.actor.update({img:path,"prototypeToken.texture.src":path})}).browse();
      })
    }
  };
  static PARTS={content:{template:`systems/${SYSTEM_ID}/templates/services-sheet.hbs`,scrollable:[".witcher-service-catalog",".witcher-service-settings-list",".witcher-service-orders"]}};
  static TABS={services:{initial:"catalog",tabs:[{id:"catalog",label:"Ассортимент",icon:"fa-solid fa-store"},{id:"orders",label:"Заказы",icon:"fa-solid fa-receipt"},{id:"manage",label:"Настройка",icon:"fa-solid fa-sliders"}]}};

  get isEditable(){return game.user.isGM && super.isEditable;}
  _canDragDrop(){return false;}
  async _onDrop(){return false;}

  async _prepareContext(options) {
    if(!this.isEditable&&this.tabGroups.services==="manage")this.tabGroups.services="catalog";
    const context=await super._prepareContext(options);
    const entries=this.actor.system.services.filter(entry=>entry.enabled);
    if(!entries.some(entry=>entry.id===this.selectedServiceId))this.selectedServiceId=entries[0]?.id??"";
    const selected=entries.find(entry=>entry.id===this.selectedServiceId);
    const customers=Array.from(game.actors).filter(actor=>COMBAT_ACTOR_TYPES.includes(actor.type)&&actor.testUserPermission(game.user,"OWNER"));
    if(!customers.some(actor=>actor.uuid===this.customerUuid))this.customerUuid=customers.find(actor=>actor.id===game.user.character?.id)?.uuid??customers[0]?.uuid??"";
    const extra=getServiceRule(selected??{})?.rules.extra;
    const orderList=Array.from(game.messages).filter(message=>message.isContentVisible&&serviceOrder(message)?.providerUuid===this.actor.uuid)
      .filter(message=>game.user.isGM||message.author?.id===game.user.id).reverse().map(message=>{
        const order=serviceOrder(message);
        return {id:message.id,...order,totalLabel:crowns(order.total),statusLabel:ORDER_STATES[order.status]??"Неизвестный статус",canResolve:order.status==="pending"&&canResolveServices()};
      });
    return {...context,actor:this.actor,system:this.actor.system,isGM:this.isEditable,
      serviceTabs:Object.values(context.tabs).filter(tab=>tab.id!=="manage"||this.isEditable),
      groups:SERVICE_GROUPS.map(group=>({...group,entries:entries.filter(entry=>entry.group===group.id).map(entry=>({...entry,selected:entry.id===this.selectedServiceId,priceLabel:entry.pricing==="percent"?`${entry.price}% от выручки`:`${crowns(entry.price)} / ${entry.unit}`,rulesText:ruleText(entry)}))})),
      availableCount:entries.length, selected:selected?{...selected,rulesText:ruleText(selected)}:null,
      customers:customers.map(actor=>({uuid:actor.uuid,name:actor.name,selected:actor.uuid===this.customerUuid,crowns:crowns(actor.system.crowns)})),
      parameters:{quantity:1,revenue:0,craftValue:0,wounds:{simple:0,complex:0,difficult:0,deadly:0},...this.draft},note:this.note,
      isPercent:selected?.pricing==="percent",isMedic:extra==="criticalWounds",isCraft:extra==="craftValue",isSea:extra==="seaRoute",
      routes:SEA_ROUTES.map(route=>({...route,selected:route.id===(this.draft.route??"coast")})),
      orders:orderList,pendingCount:orderList.filter(order=>order.status==="pending").length,
      presets:SERVICE_PRESETS,settingsEntries:this.actor.system.services.map(entry=>({...entry,custom:!entry.ruleId,percent:entry.pricing==="percent",lodging:entry.group==="lodging"}))};
  }

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    for(const element of this.element.querySelectorAll('[data-player-control], [data-action="tab"], [data-action="selectService"]')) {
      element.disabled=false;
      if(element.hasAttribute("readonly"))element.removeAttribute("readonly");
    }
  }

  readOrder() {
    const get=key=>this.element.querySelector(`[data-order-field="${key}"]`)?.value;
    const parameters={quantity:Number(get("quantity")??1),revenue:Number(get("revenue")??0),craftValue:Number(get("craftValue")??0),route:get("route")??"coast",
      wounds:Object.fromEntries(["simple","complex","difficult","deadly"].map(key=>[key,Number(get(key)??0)]))};
    this.draft=parameters;this.customerUuid=get("customer")??"";this.note=get("note")??"";
    return {customer:game.actors.find(actor=>actor.uuid===this.customerUuid),parameters,note:this.note};
  }
  updateQuote() {
    const output=this.element.querySelector("[data-order-total]"), detail=this.element.querySelector("[data-order-detail]"), button=this.element.querySelector('[data-action="sendServiceOrder"]');
    if(!button)return;
    try {
      const {customer,parameters}=this.readOrder();
      const quote=serviceQuote(this.actor.system.services.find(entry=>entry.id===this.selectedServiceId),parameters);
      output.textContent=crowns(quote.total); detail.textContent=quote.detail;
      const reason=this.actor.system.closed?"Заведение закрыто":!customer?"Нет доступного персонажа":customer.system.crowns<quote.total?"Недостаточно крон":"";
      button.disabled=Boolean(reason);button.textContent=reason||"Отправить заказ мастеру";
    } catch(error){output.textContent="—";detail.textContent=error.message;button.disabled=true;}
  }
  async _onRender(context,options) {
    await super._onRender(context,options);
    for(const field of this.element.querySelectorAll("[data-order-field]"))field.addEventListener("input",()=>this.updateQuote());
    this.updateQuote();
    this.element.querySelector("[data-service-search]")?.addEventListener("input",event=>{
      const query=event.target.value.toLocaleLowerCase("ru");
      for(const card of this.element.querySelectorAll("[data-service-card]"))card.hidden=!card.textContent.toLocaleLowerCase("ru").includes(query);
    });
  }
  readSettings() {
    if(!this.isEditable)throw new Error("Настройки услуг доступны только мастеру.");
    const services=this.actor.system.services.map(entry=>{
      const row=Array.from(this.element.querySelectorAll("[data-service-settings]")).find(row=>row.dataset.serviceSettings===entry.id);
      const get=key=>row.querySelector(`[data-setting="${key}"]`);
      return {...entry,enabled:get("enabled").checked,name:get("name").value.trim(),price:Number(get("price").value),
        pricing:get("pricing").value,unit:get("unit").value.trim(),description:get("description").value,group:get("group").value};
    });
    return {name:this.element.querySelector("[data-provider-name]").value.trim()||this.actor.name,
      "system.closed":this.element.querySelector("[data-provider-closed]").checked,
      "system.greeting":this.element.querySelector("[data-provider-greeting]").value,"system.services":validateServiceEntries(services)};
  }
  async saveSettings() {
    if(!this.isEditable)return;
    await this.actor.update(this.readSettings());ui.notifications.info("Ассортимент и цены сохранены.");
  }
  async _processSubmitData(){return this.saveSettings();}
}
