import { weaponRecord } from "./equipment-records.mjs";
import { PEASANT_SOURCE } from "./peasant-profession.mjs";

// The shovel is already radolf.shovel: reuse it instead of creating another copy.
export const PEASANT_WEAPONS = [
  ["pitchfork","Вилы","staffSpear","К",-2,"e","2d6+2",15,2,0,0,"none",0,2,115,"Кровопускающее (15%)"],
  ["quarterstaff","Короткий посох","staffSpear","Д",0,"e","2d6",10,2,0,0,"none",0,3,96,"Длинное; Несмертельное"],
  ["scythe","Коса","staffSpear","Р/К",-3,"e","3d6",10,2,0,0,"none",0,3.5,126,"Длинное; Захватное"],
  ["shepherd-staff","Пастуший посох","melee","Д",0,"e","1d6-2",10,1,0,2,"large",0,1,14,"Несмертельное"],
  ["sickle","Серп","smallBlades","Р/К",0,"e","1d6+2",10,1,0,0,"small",0,1,76,"Захватное"]
].map((row,index)=>{
  const entry=weaponRecord(`pswp${String(index+1).padStart(12,"0")}`,row,PEASANT_SOURCE);
  return {...entry,id:`peasant.weapon.${row[0]}`,source:"radolf",system:{...entry.system,description:`<p>Крестьянское оружие. ${row[15] || ""}.</p><p><small>${PEASANT_SOURCE}</small></p>`}};
});
