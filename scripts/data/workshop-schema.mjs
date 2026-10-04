import { itemNumber as number, itemText as text } from "./item-fields.mjs";
// Functions defer field construction until Foundry initializes its data models.
export function bonusFields() { return new foundry.data.fields.ArrayField(new foundry.data.fields.SchemaField({ target: text(), value: number(0, { min: -100 }) })); }
export function installationFields(extra = {}) { return new foundry.data.fields.ArrayField(new foundry.data.fields.SchemaField({ id: text(), name: text(), sourceUuid: text(), category: text(), properties: text(), bonuses: bonusFields(), weight: number(), zone: text(), ...extra })); }
export function workshopEquipmentFields() {
  const { SchemaField, BooleanField, ArrayField } = foundry.data.fields;
  return {
    material: new SchemaField({ substance: text(), location: text(), forageDC: number(), quantityFormula: text() }),
    alchemy: new SchemaField({ category: text(), target: text(), duration: number(), toxicity: number(), bonus: number() }),
    mutagen: new SchemaField({ prepared: new BooleanField({ initial: false }), dc: number(), color: text(), monster: text(), mutation: text(), bonuses: bonusFields() }),
    upgrade: new SchemaField({ category: text(), target: text(), bonuses: bonusFields(), zones: new ArrayField(text(), { initial: ["head", "torso", "legs"] }) }),
    installations: installationFields(),
    oil: new SchemaField({ sourceUuid: text(), name: text(), target: text(), bonus: number(), expiresAt: number() })
  };
}
export function workshopActorFields() {
  const { ArrayField, SchemaField, BooleanField } = foundry.data.fields;
  return { mutations: installationFields({ monster: text() }), harvest: new ArrayField(new SchemaField({ id: text(), uuid: text(), quantity: number(1, { integer: true }), formula: text(), skill: text(), dc: number(), attempted: new BooleanField({ initial: false }) })) };
}
