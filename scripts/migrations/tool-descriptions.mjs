import { TOOL_RULES, TOOL_SOURCE, LEGACY_TOOL_SOURCE, toolContent } from "../data/tool-rules.mjs";

/** Enrich stock copies in place. Names, quantity, cost, art, custom prose/properties remain user-owned. */
export function toolDescriptionUpdate(item) {
  const entry=TOOL_RULES[item.system?.ruleId];
  if(item.type!=="equipment" || !entry)return {};
  const content=toolContent(item.system.ruleId), update={};
  const plain=String(item.system.description??"").replace(/<[^>]*>/g,"").trim();
  if(!plain || [TOOL_SOURCE,LEGACY_TOOL_SOURCE].includes(plain)) {
    update["system.description"]=content.description;
    // Legacy kits all inherited the default Large concealment rather than the book table.
    if(!item.system.concealment || item.system.concealment==="large")update["system.concealment"]=content.concealment;
  }
  if((!item.system.properties || item.system.properties===entry.legacyProperties) && item.system.properties!==content.properties)update["system.properties"]=content.properties;
  if(!item.system.source || item.system.source===LEGACY_TOOL_SOURCE)update["system.source"]=TOOL_SOURCE;
  return update;
}
