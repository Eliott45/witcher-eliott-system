import { defaultServices, SERVICE_GROUPS } from "./core-services.mjs";
import { itemText, itemNumber } from "./item-fields.mjs";

/** A provider's catalogue is separate from character statistics and physical inventory. */
export class WitcherServicesData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const {ArrayField,SchemaField,BooleanField} = foundry.data.fields;
    return {
      greeting:itemText("Выберите услугу и отправьте заказ мастеру."),
      closed:new BooleanField({initial:false}),
      services:new ArrayField(new SchemaField({
        id:itemText("",{blank:false}), ruleId:itemText(), name:itemText("Новая услуга",{blank:false}),
        description:itemText(), price:itemNumber(), unit:itemText("услуга"),
        group:itemText("services",{choices:SERVICE_GROUPS.map(group=>group.id)}),
        pricing:itemText("fixed",{choices:["fixed","percent"]}), enabled:new BooleanField({initial:true})
      }),{initial:defaultServices})
    };
  }
}
