/** Requirements can describe unique reagents without creating duplicate physical Items. */
export const ritualComponentActions={
  async addRitualComponent() {
    if(!this.isEditable||this.item.type!=="spell"||this.item.system.kind!=="ritual")return;
    const answer=await foundry.applications.api.DialogV2.prompt({window:{title:"Ингредиент ритуала"},content:'<label>Название<input name="name" type="text" required></label><label>Количество<input name="quantity" type="number" min="1" step="1" value="1" required></label><label><input name="consumed" type="checkbox" checked> Расходуется</label>',
      ok:{label:"Добавить",callback:(_e,b)=>({name:b.form.elements.name.value.trim(),quantity:Number(b.form.elements.quantity.value),consumed:b.form.elements.consumed.checked})},rejectClose:false});
    if(!answer)return;
    if(!answer.name||!Number.isInteger(answer.quantity)||answer.quantity<1){ui.notifications.warn("Укажите название и целое положительное количество.");return;}
    await this.item.update({"system.ritual.components":[...this.item.system.ritual.components,answer]});
  },
  async removeRitualComponent(_e,target) {
    if(this.isEditable&&this.item.type==="spell"&&this.item.system.kind==="ritual")await this.item.update({"system.ritual.components":this.item.system.ritual.components.filter((_c,i)=>i!==Number(target.dataset.index))});
  }
};
