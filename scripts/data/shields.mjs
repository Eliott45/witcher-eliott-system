// Core p.80. Stable rule IDs also identify shields imported before shieldClass existed.
const CLASSES = {
  "weapon.leather-shield":"light", "weapon.buckler":"light", "weapon.temerian-shield":"light",
  "weapon.skellige-shield":"medium", "weapon.kaedwen-shield":"medium", "weapon.kite-shield":"medium",
  "weapon.pavise":"heavy", "weapon.nilfgaard-pavise":"heavy"
};
export const SHIELD_CLASSES = [{id:"",name:"По каталогу"},{id:"light",name:"Лёгкий"},{id:"medium",name:"Средний"},{id:"heavy",name:"Тяжёлый"}];
export const shieldClass = system => system.shieldClass || CLASSES[system.ruleId] || "";
