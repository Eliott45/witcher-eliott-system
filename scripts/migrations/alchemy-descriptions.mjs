import { ALCHEMY } from "../data/workshop-alchemy.mjs";

/** Replace only empty/source-only stock descriptions. Player notes and custom rules survive. */
export function alchemyDescriptionUpdate(item) {
  const source=ALCHEMY.find(entry=>entry.id===item.system?.ruleId);
  if(!source)return {};
  const plain=String(item.system.description??"").replace(/<[^>]*>/g,"").trim();
  if(plain&&plain!==source.system.source)return {};
  return {"system.description":source.system.description};
}
