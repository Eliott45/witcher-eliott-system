/** Crossbow modifications have their own capacity, independent of runes. */
export const hasCrossbowMod = (item, id) => (item.system.installations ?? []).some(entry => entry.category === "crossbow" && entry.ruleId === `radolf.crossbow.${id}`);
export const crossbowCapacity = item => item.type === "weapon" && item.system.skill === "crossbow" ? (item.system.hands === 1 ? 1 : 2) : 0;
export const crossbowSlots = item => Math.max(0,crossbowCapacity(item)-(item.system.installations??[]).filter(entry=>entry.category==="crossbow").length);
export const crossbowModFits = (target,source) => crossbowSlots(target)>0 && !(target.system.installations??[]).some(entry=>entry.category==="crossbow"&&entry.ruleId===source.system.ruleId);
