import { CORE_EQUIPMENT } from "./core-equipment.mjs";
import { MATERIALS, materialUuid } from "./workshop-materials.mjs";
import { ALCHEMY, SUBSTANCE_CODES } from "./workshop-alchemy.mjs";
import { UPGRADES } from "./workshop-upgrades.mjs";
import { equipmentUuid } from "./workshop.mjs";
import { DIAGRAM_INVESTMENTS } from "./diagram-investments.mjs";
import { WITCHER_SPECIAL_EQUIPMENT } from "./witcher-special-equipment.mjs";
import { EXPERIMENTAL_RECIPES } from "./experimental-devices.mjs";

// Core pp. 130–139. Result references point to existing canonical equipment.
// Append new rows: the array positions form persistent compendium document IDs.
const diagrams = [
 ["material.double-linen",14,30,30,"linen:1 thread:2"], ["material.hardened-timber",12,30,21,"timber:2 resin:4"],
 // Follow the supplied Russian book, p. 130: leather and wax, not the ambiguous errata label.
 ["material.hardened-leather",14,30,64,"leather:1 wax:2"], ["material.leather",12,60,38,"cow-hide:1 tanning-herbs:3"],
 ["material.linen",10,15,12,"thread:2"], ["material.thread",10,15,4,"cotton:2"],
 ["material.dark-steel",17,60,110,"dark-iron:1 coal:3","journeyman"], ["material.lyrian-leather",17,60,80,"leather:1 ogre-wax:1 coal:2","journeyman"],
 ["material.steel",15,60,70,"iron:1 coal:5","journeyman"], ["material.tretogor-steel",16,60,86,"iron:1 coal:5 feathers:2","journeyman"],
 ["material.dimeritium",20,60,320,"glowing-ore:2","master"], ["material.draconid-leather",18,60,78,"draconid-scales:1 tanning-herbs:3","master"],
 ["material.mahakaman-dimeritium",24,60,402,"glowing-ore:2 river-clay:3 ashes:2 beast-bones:3","master"],
 ["material.mahakaman-steel",22,60,152,"iron:1 coal:5 ashes:2 river-clay:3 beast-bones:3","master"],
 ["weapon.arming-sword",13,420,404,"timber:2 thread:1 hardened-leather:2 steel:2"],
 ["weapon.brass-knuckles",10,120,125,"steel:1 hardened-timber:1 resin:3 wax:1"], ["weapon.dagger",8,120,74,"timber:1 iron:1"],
 ["weapon.gleddyf",14,420,426,"timber:1 hardened-leather:1 leather:1 iron:1 steel:2 oil:1 resin:1"],
 ["weapon.axe",10,180,306,"hardened-timber:1 steel:1 hardened-leather:1 leather:1 resin:4"],
 ["weapon.falchion",14,420,486,"hardened-timber:1 hardened-leather:2 steel:2 ester-grease:4"],
 ["weapon.iron-longsword",10,300,240,"timber:1 iron:2 leather:2"], ["weapon.orion",12,60,125,"steel:1 oil:2 river-clay:1 ashes:3","novice",3],
 ["weapon.short-bow",15,480,434,"hardened-timber:5 thread:4 wax:2 resin:2 ester-grease:3 iron:1 leather:2"],
 ["weapon.spear",12,360,562,"hardened-timber:5 steel:2 resin:2 leather:3 thread:4"],
 ["weapon.throwing-axe",10,60,116,"timber:1 steel:1","novice",3], ["weapon.throwing-knife",8,60,74,"steel:1","novice",3],
 ["weapon.battle-axe",17,540,786,"hardened-timber:4 steel:3 leather:3 ester-grease:4 ogre-wax:4 river-clay:5","journeyman"],
 ["weapon.crossbow",17,540,682,"hardened-timber:4 thread:5 wax:1 resin:2 steel:3 hardened-leather:1 ester-grease:2 ogre-wax:2 iron:1","journeyman"],
 ["weapon.esboda",17,540,974,"hardened-timber:2 steel:3 dark-steel:2 hardened-leather:2 drake-oil:1","journeyman"],
 ["weapon.hand-crossbow",15,480,426,"hardened-timber:2 thread:4 wax:2 resin:2 steel:1 hardened-leather:1 ester-grease:2 ogre-wax:2 iron:1","journeyman"],
 ["weapon.hooked-staff",18,540,824,"timber:6 steel:3 fifth-essence:2 ester-grease:2 wax:3 etching-acid:2 hardened-leather:1 thread:4","journeyman"],
 ["weapon.krigsverd",16,480,854,"hardened-timber:2 dark-steel:3 hardened-leather:2 resin:4 beast-bones:7 steel:3 ashes:2","journeyman"],
 ["weapon.long-bow",16,480,712,"hardened-timber:6 thread:8 wax:4 resin:2 ester-grease:3 steel:1 hardened-leather:1","journeyman"],
 ["weapon.mace",16,480,786,"hardened-timber:2 steel:3 iron:2 hardened-leather:2 ogre-wax:5 resin:1","journeyman"],
 ["weapon.poleaxe",16,480,690,"hardened-timber:5 dark-steel:2 leather:2 sharpening-grit:1 ester-grease:1 linen:1","journeyman"],
 ["weapon.short-dagger",18,240,534,"hardened-timber:1 dark-steel:1 hardened-leather:1 sharpening-grit:2 etching-acid:4 beast-bones:4","journeyman"],
 ["weapon.staff",18,540,502,"timber:6 steel:1 fifth-essence:2 ester-grease:2 wax:2","journeyman"],
 ["weapon.stiletto",16,240,412,"timber:1 resin:1 dark-steel:1 wax:2 darkening-oil:1 sharpening-grit:2 coal:5","journeyman"],
 ["weapon.berserker-axe",25,780,1440,"mahakaman-steel:4 hardened-timber:5 hardened-leather:1 steel:2 resin:1 sharpening-grit:1 ester-grease:1","master"],
 ["weapon.crystal-staff",25,780,1296,"timber:6 steel:2 fifth-essence:4 ester-grease:3 wax:2 gemstone:1 etching-acid:4 drake-oil:1","master"],
 ["weapon.hammer",25,780,1440,"dark-iron:5 dark-steel:1 hardened-timber:10 hardened-leather:1 etching-acid:6 beast-bones:10 ester-grease:4 meteorite:1","master"],
 ["weapon.iron-staff",20,600,1012,"dark-iron:4 fifth-essence:2 dark-steel:1 leather:1 etching-acid:4 hardened-timber:1","master"],
 ["weapon.jambiya",20,300,660,"hardened-timber:1 draconid-leather:1 dark-steel:1 steel:2 sharpening-grit:2 resin:1 darkening-oil:1","master"],
 ["weapon.kord",22,660,1012,"hardened-timber:1 dark-steel:3 dark-iron:1 hardened-leather:2 resin:4 beast-bones:7 silk:1 coal:1","master"],
 ["weapon.monster-crossbow",24,720,1686,"hardened-timber:6 thread:6 wax:3 resin:4 dark-steel:4 hardened-leather:3 ester-grease:2 ogre-wax:4 dark-iron:3 beast-bones:4","master"],
 ["weapon.halberd",22,660,1296,"hardened-timber:6 dark-steel:3 tretogor-steel:2 hardened-leather:2 sharpening-grit:2 ester-grease:2","master"],
 ["weapon.torrwr",25,780,1462,"hardened-timber:3 dark-steel:5 steel:2 hardened-leather:3 resin:5 ashes:4 beast-bones:2 sharpening-grit:1","master"],
 ["weapon.vicovaro",24,720,1282,"hardened-timber:3 dark-steel:4 dark-iron:2 hardened-leather:3 resin:4 ashes:4 beast-bones:3","master"],
 ["weapon.war-bow",22,660,1296,"hardened-timber:6 thread:8 wax:4 resin:4 ester-grease:3 dark-steel:4 hardened-leather:1 drake-oil:2","master"],
 ["armor.head.1",10,180,150,"linen:2 leather:1 thread:6 wax:3"], ["armor.head.2",13,240,262,"double-linen:2 leather:2 thread:7 wax:4"],
 ["armor.head.3",15,240,300,"steel:3 beast-bones:1"], ["armor.head.4",16,240,374,"steel:4","journeyman"],
 ["armor.head.5",17,300,524,"leather:1 hardened-leather:3 double-linen:3 thread:4 ogre-wax:1","journeyman"],
 ["armor.head.6",18,300,712,"steel:4 leather:2 hardened-leather:2 ester-grease:1","journeyman"],
 ["armor.head.7",19,300,862,"steel:5 hardened-leather:3 thread:6 ogre-wax:2 linen:1","master"],
 ["armor.head.8",22,360,1050,"dark-steel:4 thread:6 hardened-leather:2 beast-bones:5 drake-oil:1","master"],
 ["armor.head.9",24,360,1200,"dark-steel:5 oil:5 hardened-leather:1 darkening-oil:1 drake-oil:1 ashes:10","master",1,135],
 ["armor.torso.1",10,300,150,"linen:6 thread:7"], ["armor.torso.2",12,360,362,"linen:6 thread:6 leather:2 oil:1"],
 ["armor.torso.3",15,480,374,"double-linen:5 thread:6 tanning-herbs:4 linen:4 cotton:11"],
 ["armor.torso.4",16,480,450,"leather:3 hardened-leather:3","journeyman"], ["armor.torso.5",17,540,600,"thread:5 leather:2 steel:2 tretogor-steel:2","journeyman"],
 ["armor.torso.6",18,540,786,"lyrian-leather:4 thread:4 leather:2 linen:4 steel:1","journeyman"],
 ["armor.torso.7",19,600,937,"steel:5 hardened-leather:3 thread:7 etching-acid:4 drake-oil:1 ogre-wax:1","master"],
 ["armor.torso.8",22,660,1124,"thread:6 beast-bones:5 hardened-leather:1 drake-oil:3 dark-steel:4","master"],
 ["armor.torso.9",24,720,1274,"dark-steel:5 hardened-leather:1 leather:1 darkening-oil:1 drake-oil:2 linen:3 ashes:10","master"],
 ["armor.legs.1",13,420,112,"linen:5 thread:4"], ["armor.legs.2",14,420,186,"linen:5 thread:4 cotton:9 leather:1"],
 ["armor.legs.3",15,480,336,"double-linen:6 thread:6 cotton:6 linen:1"], ["armor.legs.4",16,480,374,"hardened-leather:2 steel:1 leather:1 thread:5","journeyman"],
 ["armor.legs.5",17,540,600,"hardened-leather:1 leather:1 tretogor-steel:3 thread:5 tanning-herbs:3 cotton:3","journeyman"],
 ["armor.legs.6",18,540,786,"lyrian-leather:4 thread:4 leather:2 linen:4 steel:1","journeyman"],
 ["armor.legs.7",19,600,798,"steel:5 hardened-leather:3 thread:7 etching-acid:4 drake-oil:1 ogre-wax:1","master"],
 ["armor.legs.8",22,660,1124,"thread:8 beast-bones:5 hardened-leather:2 leather:1 drake-oil:1 dark-steel:4","master"],
 ["armor.legs.9",24,720,1274,"dark-steel:5 hardened-leather:1 leather:1 darkening-oil:1 drake-oil:2 linen:1 ashes:10 oil:4","master"],
 ["weapon.leather-shield",12,180,74,"leather:1 timber:2 tanning-herbs:1"], ["weapon.buckler",15,240,224,"steel:1 hardened-timber:1 hardened-leather:1"],
 ["weapon.temerian-shield",16,240,342,"hardened-timber:4 iron:1 hardened-leather:1 ogre-wax:3"],
 ["weapon.kaedwen-shield",19,300,600,"hardened-timber:5 dark-steel:1 beast-bones:7 leather:1 ogre-wax:5 wax:2","journeyman"],
 ["weapon.kite-shield",17,300,600,"steel:4 dark-steel:1 leather:1","journeyman"], ["weapon.skellige-shield",18,300,486,"hardened-timber:5 dark-steel:1 ogre-wax:1 beast-bones:5 leather:1","journeyman"],
 ["weapon.pavise",19,300,750,"hardened-timber:10 steel:1 hardened-leather:3 ogre-wax:1 ester-grease:2","master"],
 ["weapon.nilfgaard-pavise",22,360,900,"hardened-timber:10 hardened-leather:3 ogre-wax:1 dark-steel:1 ester-grease:2 darkening-oil:1 ashes:10 etching-acid:2","master"],
 ["armor-upgrade.cloth",14,180,60,"double-linen:1 thread:2"], ["armor-upgrade.studded-leather",14,180,120,"leather:1 iron:1 thread:1"],
 ["armor-upgrade.mail",17,300,187,"steel:2","journeyman"], ["armor-upgrade.hardened-leather",16,240,195,"hardened-leather:1 leather:1 thread:5 wax:3","journeyman"],
 ["armor-upgrade.steel",18,300,217,"steel:2 thread:3 etching-acid:2","journeyman"], ["armor-upgrade.elven",24,360,300,"dark-steel:1 thread:5 hardened-leather:1 feathers:1","master"],
 ["armor-upgrade.dwarven",24,360,292,"mahakaman-steel:1 wolf-hide:1 thread:5 coal:1","master"],
 // Ammunition, p. 132: one attempt produces the complete printed batch.
 ["ammunition.armor-piercing",16,60,224,"hardened-timber:1 steel:1 feathers:1 sharpening-grit:1 ogre-wax:1","journeyman",10,132],
 ["ammunition.broadhead",15,60,125,"timber:1 iron:1 feathers:1 sharpening-grit:1","journeyman",10,132],
 // Elder Folk weapons, p. 136.
 ["weapon.dwarven-axe",24,720,1110,"mahakaman-steel:3 hardened-timber:4 hardened-leather:2 etching-acid:4 sharpening-grit:1 river-clay:2 coal:3","master",1,136],
 ["weapon.dwarven-cleaver",19,600,750,"mahakaman-steel:2 hardened-timber:1 leather:1 sharpening-grit:1 drake-oil:1 river-clay:5","master",1,136],
 ["weapon.dwarven-heavy-crossbow",24,720,1274,"hardened-timber:5 mahakaman-steel:3 hardened-leather:2 thread:4 ogre-wax:5 dark-iron:1","master",1,136],
 ["weapon.elven-glaive",19,600,1386,"hardened-timber:6 dark-steel:4 steel:1 leather:4 feathers:3 sharpening-grit:2 ester-grease:4","master",1,136],
 ["weapon.elven-messer",19,600,892,"hardened-timber:2 leather:3 dark-steel:3 silk:1 sharpening-grit:1 etching-acid:1","master",1,136],
 ["weapon.elven-travel-bow",22,660,862,"hardened-timber:4 thread:4 wax:4 fifth-essence:1 leather:1 dark-steel:2 feathers:3 beast-bones:2 ester-grease:5 etching-acid:3","master",1,136],
 ["weapon.gnomish-staff",22,660,1364,"hardened-timber:6 fifth-essence:5 dark-steel:1 darkening-oil:3 double-linen:1","master",1,136],
 ["weapon.halfling-rondel",19,600,726,"dark-steel:2 hardened-timber:1 hardened-leather:1 sharpening-grit:3 darkening-oil:1 ester-grease:2","master",1,136],
 ["weapon.mahakam-martell",22,660,1350,"mahakaman-steel:3 hardened-timber:3 hardened-leather:2 wolf-hide:1 sharpening-grit:1 ester-grease:3 drake-oil:2 river-clay:4 linen:1","master",1,136],
 ["weapon.meteorite-sword",20,600,1312,"hardened-timber:2 leather:2 sharpening-grit:1 etching-acid:4 ester-grease:4 meteorite:5","master",1,136],
 ["weapon.vrihedd-blade",24,720,1117,"hardened-timber:2 silk:1 dark-steel:4 sharpening-grit:3 ester-grease:4 river-clay:4","master",1,136],
 // Grandmaster weapons and master ammunition, p. 137.
 ["weapon.dwarven-pole-hammer",25,780,1248,"hardened-timber:6 mahakaman-steel:3 hardened-leather:3 ogre-wax:1 sharpening-grit:1","grandmaster",1,137],
 ["weapon.elven-travel-staff",25,780,1470,"hardened-timber:6 gold:1 ester-grease:6 silk:1 wolf-hide:2 dark-steel:1 fifth-essence:3 gemstone:1","grandmaster",1,137],
 ["weapon.elven-zefar",25,780,1660,"hardened-timber:8 thread:8 ogre-wax:8 fifth-essence:2 beast-bones:4 feathers:4 dark-steel:3 leather:2 ester-grease:9 etching-acid:6","grandmaster",1,137],
 ["weapon.gnomish-black-axe",25,780,1376,"hardened-timber:4 hardened-leather:2 dimeritium:1 dark-steel:3 ogre-wax:1 sharpening-grit:1","grandmaster",1,137],
 ["weapon.gnomish-gwyhyr",25,780,1628,"hardened-timber:2 hardened-leather:1 dimeritium:2 dark-steel:1 ester-grease:3 sharpening-grit:4 darkening-oil:1","grandmaster",1,137],
 ["weapon.gnomish-hand-crossbow",25,780,634,"hardened-timber:2 thread:4 dark-steel:2 ester-grease:1 darkening-oil:2 resin:2 drake-oil:1 wax:2","grandmaster",1,137],
 ["weapon.meteorite-flail",25,780,1352,"meteorite:5 ester-grease:1 hardened-timber:1 hardened-leather:1 dark-steel:1 sharpening-grit:1","grandmaster",1,137],
 ["weapon.tir-tochair-blade",26,780,1776,"hardened-timber:2 ashes:4 hardened-leather:1 mahakaman-dimeritium:2 dark-steel:1 ester-grease:4 sharpening-grit:1 draconid-leather:1","grandmaster",1,137],
 ["ammunition.dwarven-impact",20,30,100,"mahakaman-steel:1 hardened-timber:1 feathers:1 ogre-wax:2 iron:1","master",5,137],
 ["ammunition.elven-burrowing",20,30,100,"dark-steel:1 resin:1 hardened-timber:1 feathers:2 sharpening-grit:2 ogre-wax:1 thread:1","master",5,137],
 // Elder Folk armor and shields, p. 138.
 ["armor.dwarven-cloak",18,540,2100,"hardened-leather:12 ogre-wax:10 resin:10 drake-oil:2 leather:6 ester-grease:7 thread:10 cow-hide:1","master",1,138],
 ["weapon.elven-shield",20,300,1050,"hardened-timber:5 hardened-leather:5 dark-steel:2 ester-grease:2 etching-acid:4 ogre-wax:2","master",1,138],
 ["weapon.gnomish-buckler",22,360,674,"dark-steel:3 leather:1 ester-grease:1 etching-acid:4 drake-oil:1","master",1,138],
 ["armor.halfling-doublet",18,540,562,"silk:4 thread:10 cotton:7 double-linen:2","master",1,138],
 ["armor.scoiatael-armor",20,1200,3486,"dark-steel:12 wolf-hide:3 ester-grease:10 etching-acid:12 ashes:11 double-linen:8 darkening-oil:4 hardened-timber:13 drake-oil:2 thread:9","master",1,138],
 ["armor.gnomish-chain",24,1440,1462,"dark-steel:8 leather:2 darkening-oil:1","grandmaster",1,138],
 ["armor.gnomish-dragoon",25,1500,4274,"dark-steel:12 meteorite:1 mahakaman-dimeritium:2 ester-grease:10 etching-acid:14 double-linen:5 darkening-oil:4 drake-oil:2 thread:15","grandmaster",1,138],
 ["weapon.mahakam-pavise",26,420,1574,"hardened-timber:10 hardened-leather:5 ogre-wax:11 ester-grease:2 mahakaman-steel:2 etching-acid:3 leather:4","grandmaster",1,138],
 ["armor.mahakam-plate",28,1680,5286,"mahakaman-steel:12 mahakaman-dimeritium:2 ester-grease:8 etching-acid:12 hardened-leather:5 darkening-oil:2 drake-oil:1 meteorite:2 ogre-wax:3 thread:10","grandmaster",1,138],
 // Witcher gear, p. 249: the book prints no diagram price (they are rewards or found on dead witchers), only the supplement.
 ["gear.witcher-medallion",15,240,null,"silver:1 etching-acid:5","journeyman",1,249],
 ["weapon.witcher-steel-sword",18,540,null,"hardened-timber:2 leather:2 meteorite:2 steel:3 sharpening-grit:2 etching-acid:2 ester-grease:1 thread:1","master",1,249],
 ["weapon.witcher-silver-sword",19,600,null,"hardened-timber:2 leather:2 silver:4 steel:1 sharpening-grit:2 etching-acid:1 ester-grease:1","master",1,249]
];
// Core p.249 sidebar: a mage casts the medallion from silver, then it must spend an hour in a place of power.
const DIAGRAM_NOTES = { "gear.witcher-medallion": "Медальон отливает маг. Затем заготовку нужно на час отнести в место силы, чтобы она напиталась энергией; в этот час место силы не даёт других бонусов." };
const catalog = [...CORE_EQUIPMENT,...MATERIALS,...UPGRADES,...WITCHER_SPECIAL_EQUIPMENT];
export const RECIPES = diagrams.map(([id,dc,minutes,price,components,grade="novice",quantity=1,page],i)=>{
 const result = catalog.find(item=>item.id===id);
 const materials = components.split(" ").map(token=>{const [material,q]=token.split(":"); return {uuid:materialUuid(material),substance:"",quantity:Number(q)};});
 const forge = components.split(" ").some(token=>/^(iron|steel|dark-iron|dark-steel|silver|gold|dimeritium|mahakaman-steel|mahakaman-dimeritium|tretogor-steel|meteorite):/.test(token));
 return {id:`diagram.${id}`,documentId:`recp${String(i+1).padStart(12,"0")}`,name:`Чертёж: ${result.name}`,type:"recipe",source:"recipes",
  ...(price === null ? { flags: { "witcher-eliott-system": { priceUnavailable: true } } } : {}),system:{...(DIAGRAM_NOTES[id] ? { description: `<p>${DIAGRAM_NOTES[id]}</p>` } : {}),price:price??0,source:"Базовая книга",recipe:{category:"diagram",resultUuid:equipmentUuid(result.documentId),quantity,dc,time:minutes*60,investment:DIAGRAM_INVESTMENTS[id],grade,forge,tools:["gear.crafting-tools"],components:materials}}};
});
RECIPES.push(...ALCHEMY.map((result,i)=>{
 const recipe = result.formula;
 const counts = [...recipe.substances].reduce((map,letter)=>(map[SUBSTANCE_CODES[letter]]=(map[SUBSTANCE_CODES[letter]]??0)+1,map),{});
 const components = Object.entries(counts).map(([substance,quantity])=>({substance,quantity,uuid:""}));
 if(recipe.dogTallow) components.push({uuid:materialUuid("dog-tallow"),quantity:1,substance:""});
 if(recipe.mutagenUuid) components.push({uuid:recipe.mutagenUuid,quantity:1,substance:""},{uuid:equipmentUuid(CORE_EQUIPMENT.find(item=>item.id==="gear.spirits").documentId),quantity:1,substance:""});
 return {id:`formula.${result.id}`,documentId:`recp${String(i+501).padStart(12,"0")}`,type:"recipe",source:"recipes",name:`Формула: ${result.name}`,flags:recipe.price === undefined ? structuredClone(result.flags) : {},system:{price:recipe.price??0,source:result.system.source,recipe:{category:"formula",resultUuid:equipmentUuid(result.documentId),dc:recipe.dc,time:recipe.time,quantity:1,grade:recipe.grade??"novice",tools:["gear.alchemy-tools"],components}}};
}));
RECIPES.push(...EXPERIMENTAL_RECIPES);
