import { WitcherReferenceData } from "./witcher-reference-data.mjs";
import { itemText,itemNumber } from "./item-fields.mjs";
import { MAGIC_KINDS,HEX_DANGERS,MAGIC_TRADITIONS,SPELL_ELEMENTS,SPELL_GRADES,SPELL_DEFENSES,SPELL_RANGE_KINDS,SPELL_DURATION_KINDS } from "./spells.mjs";
export class WitcherSpellData extends WitcherReferenceData {
  static defineSchema() {
    const {SchemaField,BooleanField,ArrayField}=foundry.data.fields;
    return {...super.defineSchema(),kind:itemText("spell",{choices:Object.keys(MAGIC_KINDS)}),tradition:itemText("mage",{choices:Object.keys(MAGIC_TRADITIONS)}),deity:itemText(),element:itemText("mixed",{choices:Object.keys(SPELL_ELEMENTS)}),grade:itemText("novice",{choices:Object.keys(SPELL_GRADES)}),
      cost:itemNumber(1,{integer:true}),costStep:itemNumber(1,{integer:true,min:1}),costMax:itemNumber(0,{integer:true}),costHint:itemText(),variableCost:new BooleanField({initial:false}),
      range:new SchemaField({kind:itemText("distance",{choices:Object.keys(SPELL_RANGE_KINDS)}),value:itemNumber()}),
      duration:new SchemaField({kind:itemText("instant",{choices:Object.keys(SPELL_DURATION_KINDS)}),formula:itemText(),maintenance:itemNumber(0,{integer:true}),maintenanceMode:itemText("fixed",{choices:["fixed","fullCost","halfCost"]}),text:itemText()}),
      ritual:new SchemaField({dc:itemNumber(0,{integer:true}),alternateDC:itemNumber(0,{integer:true}),dcHint:itemText(),preparationRounds:itemNumber(0,{integer:true}),requirements:itemText(),
        components:new ArrayField(new SchemaField({name:itemText(),quantity:itemNumber(1,{integer:true,min:1}),consumed:new BooleanField({initial:true})}),{initial:[]})}),
      hex:new SchemaField({danger:itemText("low",{choices:Object.keys(HEX_DANGERS)}),lifting:itemText()}),
      defense:new ArrayField(itemText("none",{choices:Object.keys(SPELL_DEFENSES)}),{initial:["none"]}),damage:itemText(),source:itemText(),page:itemNumber(0,{integer:true})};
  }
}
