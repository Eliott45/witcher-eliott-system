import { itemNumber as num, itemText as str, itemCondition } from "./item-fields.mjs";
import { TRANSPORT_TYPES, TACK_SLOTS } from "./transport.mjs";
export function transportFields() {
  const {SchemaField}=foundry.data.fields;
  return {
    containerSection:str(),
    transport:new SchemaField({type:str("mount",{choices:TRANSPORT_TYPES.map(t=>t.id)}),athletics:num(),handling:num(0,{min:-100}),speed:num(),speedModifier:num(0,{min:-100}),health:itemCondition(),mountId:str()}),
    tack:new SchemaField({slot:str("",{choices:["",...TACK_SLOTS.map(t=>t.id)]}),compartments:num(0,{integer:true,max:2}),externalSlots:num(0,{integer:true}),speedBonus:num(),stoppingPower:itemCondition()})
  };
}
