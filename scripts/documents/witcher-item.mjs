import { conditionUpdate, isPhysical } from "../data/physical-items.mjs";
import { initialEffectTemplate } from "../data/effect-items.mjs";
import { isTransport, isMount, canHitch, cargoSection } from "../data/transport.mjs";
import { isContainer, canContain, containerParent, isCarried } from "../data/containers.mjs";
import { ammunitionUpdate } from "../migrations/ammunition-data.mjs";
import { toolDescriptionUpdate } from "../migrations/tool-descriptions.mjs";
import { generalGearDescriptionUpdate } from "../migrations/general-gear-descriptions.mjs";
import { specialEquipmentDescriptionUpdate } from "../migrations/special-equipment-descriptions.mjs";
import { alchemyDescriptionUpdate } from "../migrations/alchemy-descriptions.mjs";
import { defaultItemIcon, equipmentIconUpdate } from "../data/item-icons.mjs";
import { requireMemorySlot } from "../data/crafting.mjs";
import { materialDescriptionUpdate } from "../migrations/material-descriptions.mjs";
import { sharedEquipmentUpdate } from "../migrations/shared-equipment.mjs";
export class WitcherItem extends foundry.documents.Item {
  async _preCreate(data, options, user) {
    const result = await super._preCreate(data, options, user);
    if (result === false) return false;
    if(this.type==="effect") {
      if(!data.img)this.updateSource({img:"icons/svg/aura.svg"});
      if(!this.effects.size)this.updateSource({effects:[{...initialEffectTemplate(this),_id:foundry.utils.randomID()}]});
      return;
    }
    this.updateSource({...ammunitionUpdate(this),...toolDescriptionUpdate(this),...generalGearDescriptionUpdate(this),...specialEquipmentDescriptionUpdate(this),...alchemyDescriptionUpdate(this),...materialDescriptionUpdate(this)});
    this.updateSource(sharedEquipmentUpdate(this));
    if (isPhysical(this)) this.updateSource(!data.img && (!this.img || this.img === "icons/svg/item-bag.svg")
      ? { img: defaultItemIcon(this) } : equipmentIconUpdate(this));
    if (isContainer(this)) this.updateSource({ "system.quantity": 1, "system.equipped": false });
    if (isTransport(this)) this.updateSource({ "system.containerId": "", "system.weight": 0 });
    if (this.system.containerId && this.actor) {
      const parent=this.actor.items.get(this.system.containerId);
      if(!parent || !canContain({type:this.type,system:this.system,id:this.id||"new-item"},parent,this.actor.items)) this.updateSource({"system.containerId":"","system.containerSection":""});
      else this.updateSource({"system.containerSection":cargoSection(this,parent)});
    }
  }

  async _preUpdate(changes, options, user) {
    const result = await super._preUpdate(changes, options, user);
    if (result === false) return false;
    if (!isPhysical(this)) return;
    if (this.type === "recipe" && this.actor && (changes["system.recipe.memorized"] ?? changes.system?.recipe?.memorized) === true) {
      try { requireMemorySlot(this.actor, this); }
      catch (error) { ui.notifications.warn(error.message); return false; }
    }
    Object.assign(changes, conditionUpdate(this, changes));
    const kind = changes["system.kind"] ?? changes.system?.kind ?? this.system.kind;
    if (this.type === "equipment" && ["container", "transport"].includes(kind)) {
      if (!isContainer(this) && this.system.quantity > 1) {
        ui.notifications.warn("Контейнер должен быть отдельным предметом. Сначала разделите стопку.");
        return false;
      }
      changes["system.quantity"] = 1;
    }
    if (kind === "transport") {
      changes["system.weight"]=0;changes["system.containerId"]="";
      const data={...this.system.transport,...changes.system?.transport};
      for(const [key,value] of Object.entries(changes)) if(key.startsWith("system.transport.")) data[key.slice(17)]=value;
      const prospective={id:this.id,type:this.type,system:{...this.system,kind,transport:data}};
      if(data.mountId && (!this.actor?.items.get(data.mountId) || !canHitch(prospective,this.actor.items.get(data.mountId),this.actor.items))) {
        ui.notifications.warn("Выберите свободное упряжное животное.");return false;
      }
      const max=Math.max(0,Number(changes["system.transport.health.max"]??data.health?.max??this.system.transport.health.max));
      const value=Number(changes["system.transport.health.value"]??changes.system?.transport?.health?.value??this.system.transport.health.value);
      changes["system.transport.health.value"]=Math.max(0,Math.min(max,value));
    }
    const parentId = changes["system.containerId"] ?? changes.system?.containerId;
    if (parentId) {
      const parent = this.actor?.items.get(parentId);
      if (!parent || !canContain(this, parent, this.actor.items)) {
        ui.notifications.warn("Нельзя поместить контейнер в себя или его содержимое.");
        return false;
      }
      const tackSlot=changes["system.tack.slot"]??changes.system?.tack?.slot??this.system.tack?.slot;
      if(!isMount(parent)||!tackSlot)changes["system.equipped"] = false;
      changes["system.carried"] = true;
      changes["system.containerSection"]=cargoSection({system:{containerSection:changes["system.containerSection"]??changes.system?.containerSection??this.system.containerSection}},parent);
    } else if ((changes["system.equipped"] ?? changes.system?.equipped) === true) {
      if(!this.system.tack?.slot || !isMount(this.actor?.items.get(this.system.containerId)))changes["system.containerId"] = "";
      changes["system.carried"] = true;
    }
    if(parentId==="")changes["system.containerSection"]="";
    if ((changes["system.quantity"] ?? changes.system?.quantity) === 0 || (changes["system.carried"] ?? changes.system?.carried) === false)
      changes["system.equipped"] = false;
    if ((changes["system.carried"] ?? changes.system?.carried) === false) changes["system.containerId"] = "";
  }

  async _preDelete(options, user) {
    const result = await super._preDelete(options, user);
    if (result === false) return false;
    if (!this.actor || !isPhysical(this)) return;
    const parent = containerParent(this, this.actor.items);
    const changes = this.actor.items.filter(item => isPhysical(item) && item.system.containerId === this.id)
      .map(item => ({ _id: item.id, "system.containerId": parent?.id ?? "", "system.carried": isCarried(item, this.actor.items) }));
    for(const item of this.actor.items) if(isTransport(item)&&item.system.transport.mountId===this.id) changes.push({_id:item.id,"system.transport.mountId":""});
    if (changes.length) await this.actor.updateEmbeddedDocuments("Item", changes);
  }
}
