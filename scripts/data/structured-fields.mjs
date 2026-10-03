export const textField = (key, label) => ({ key, label, type: "text" });
export const numberField = (key, label, min = 0) => ({ key, label, type: "number", min });
export const choiceField = (key, label, choices) => ({ key, label, type: "choice", choices: choices.map(entry => typeof entry === "string" ? { id: entry, name: entry } : entry) });

export function schemaFromFields(fields) {
  const { NumberField, StringField } = foundry.data.fields;
  return Object.fromEntries(fields.map(field => [field.key, field.type === "number"
    ? new NumberField({ required: true, nullable: false, initial: field.min, integer: true, min: field.min })
    : new StringField({ required: true, nullable: false, blank: true, initial: "", ...(field.type === "choice" ? { choices: ["", ...field.choices.map(entry => entry.id)] } : {}) })]));
}
export function formFields(fields, data, prefix = "") {
  return fields.map(field => ({ ...field, name: `${prefix}${field.key}`, value: data?.[field.key] ?? (field.type === "number" ? field.min : ""),
    isChoice: field.type === "choice", isNumber: field.type === "number",
    choices: (field.choices ?? []).map(option => ({ ...option, selected: option.id === data?.[field.key] })),
    description: field.choices?.find(option => option.id === data?.[field.key])?.description ?? ""
  }));
}
