import { CORE_EQUIPMENT } from "./core-equipment.mjs";
import { MATERIALS } from "./workshop-materials.mjs";
import { CREATURE_TRAITS } from "./creatures.mjs";
import { defaultItemIcon } from "./item-icons.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { CORE_BESTIARY } from "./bestiary-core.mjs";
import { ALCHEMY } from "./workshop-alchemy.mjs";
import { CORE_AMMUNITION } from "./core-ammunition.mjs";
import { ELDER_EQUIPMENT } from "./elder-equipment.mjs";
import { CORE_MAGIC } from "./spells.mjs";

const asset=name=>`systems/witcher-eliott-system/assets/creatures/${name}.svg`;
const attributes=values=>Object.fromEntries(["intelligence","reflex","dexterity","body","speed","empathy","craft","will","luck"].map((key,i)=>[key,values[i]]));
const gear=(id,overrides={})=>{
  const entry=CORE_EQUIPMENT.find(entry=>entry.id===id);if(!entry)throw new Error(`Missing bestiary equipment: ${id}`);
  return { _id:entry.documentId,name:entry.name,type:entry.type,img:entry.img??defaultItemIcon(entry),system:{...structuredClone(entry.system),ruleId:id,equipped:true,...overrides},flags:{...structuredClone(entry.flags??{}),core:{sourceId:`Compendium.witcher-eliott-system.equipment.Item.${entry.documentId}`}}};
};
const traits=ids=>ids.map(id=>{
  const index=CREATURE_TRAITS.findIndex(entry=>entry.id===`creature.${id}`),entry=CREATURE_TRAITS[index];
  return {_id:`beastA${String(index).padStart(10,"0")}`,name:entry.name,type:"ability",img:"icons/svg/aura.svg",system:{ruleId:entry.id,description:`<p>${entry.description}</p>`}};
});
const base=(id,name,portrait,values,pool)=>({_id:id,name,type:"npc",img:asset(portrait),ownership:{default:0},prototypeToken:{name,texture:{src:asset(portrait)},actorLink:false,disposition:-1,sight:{enabled:false}},system:{attributes:attributes(values),health:{value:pool,max:pool},stamina:{value:pool,max:pool}}});
export function bestiarySources() {
  const bandit=base("bestiaryBandit01","Бандит","bandit",[3,6,5,5,4,3,4,4,0],20);
  bandit.system.skills={swordsmanship:6,crossbow:4,smallBlades:5,brawling:6,dodgeEscape:4,athletics:4,awareness:6,stealth:3,wildernessSurvival:5,resistMagic:4,resistCoercion:5,endurance:5,courage:7};
  bandit.system.creature={category:"humanoid",difficulty:"Простые / обычные",reward:10,size:"Обычный человеческий рост",weight:"Обычный человеческий вес",habitat:"Тракты и окрестности городов",intellect:"Человеческий",group:"Банда из 3–15 разбойников",source:"Базовая книга, стр. 270–271; официальная errata (Борьба +6, точность арбалета +1)",
    description:"Разбойники, дезертиры и наёмники без нанимателя. Опасны числом и подготовленной засадой; способны договариваться и сдаваться.",
    tactics:"Бойцы с мечами давят в ближнем бою, арбалетчики стреляют из укрытия. Потеря товарищей может спровоцировать ярость; тяжёлые потери обычно заставляют отступить. СА каждого оружия — 1. Для смены оружия выберите его хват.",
    lore:[{name:"Общее мнение",skill:"education",dc:8,text:"Война и голод увеличивают число разбойников. Они подстерегают путников и выбирают удобные места для засады."},{name:"Академические знания",skill:"education",dc:10,text:"Большинство — бывшие солдаты и дезертиры. Обычно ими движут безопасность и деньги; переговоры часто возможны."}],
    loot:[{name:"Кроны",formula:"3d10",currency:true},{name:"Обычные предметы",formula:"1d6"}]};
  bandit.items=[gear("weapon.iron-longsword",{damageIncludesBody:true}),gear("weapon.dagger",{damage:"1d6",equipped:false,damageIncludesBody:true,source:"Базовая книга, стр. 271: урон кинжала в блоке разбойника 1d6"}),gear("weapon.hand-crossbow",{equipped:false,damageIncludesBody:true}),
    gear("armor.head.2"),gear("armor.torso.2"),gear("armor.legs.2"),
    {...gear("ammunition.standard",{quantity:20,equipped:false}),_id:"banditBolts00001",name:"Болты"},...traits(["hanged-man-venom"])];
  const drowner=base("bestiaryDrowner1","Утопец","drowner",[1,7,7,6,6,1,1,4,0],25);
  drowner.system.skills={melee:6,brawling:6,dodgeEscape:5,athletics:6,awareness:8,stealth:5,wildernessSurvival:6,resistMagic:4,endurance:6,courage:8};
  drowner.system.creature={category:"necrophage",difficulty:"Простые / обычные",reward:10,size:"Около человеческого роста",weight:"Около человеческого веса",habitat:"Берега рек, озёр и морей",intellect:"Как у рыбы",group:"Стая из 3–6 утопцев",source:"Базовая книга, стр. 276–277",
    description:"Земноводный трупоед, появившийся после Сопряжения сфер. Название обманчиво: это не оживший утопленник. Стаи скрываются у воды и нападают на одиноких путников.",
    tactics:"Окружает добычу вместе со стаей, набрасывается и рвёт когтями. Пока не почуял кровь, может отвлечься на блестящую вещь. Горящий утопец продолжает бой, пока ПЗ не опустятся ниже 10.",
    lore:[{name:"Общее мнение",skill:"education",dc:14,text:"Селяне считают утопцев утонувшими злодеями. Их встречают у воды, и лучше не приближаться к стае в одиночку."},{name:"Знания охотника",skill:"monsterLore",dc:10,text:"Это отдельный вид чудовищ с примитивным разумом. Не тонут, не боятся ядов и магии мыслей. Слабости — огонь и масло против трупоедов."}],
    loot:[]};
  drowner.system.harvest=["drowner-brain","drowner-tongue","water-essence"].map((id,index)=>{
    const material=MATERIALS.find(entry=>entry.id===`material.${id}`);
    return {id:`drownerHarvest${index}`,uuid:`Compendium.witcher-eliott-system.equipment.Item.${material.documentId}`,quantity:index===2?0:1,formula:index===2?"floor(1d6 / 2)":"",skill:"",dc:0,attempted:false};
  });
  drowner.items=[{_id:"drownerClaws0001",name:"Когти",type:"weapon",img:asset("claws"),system:{category:"melee",skill:"melee",damage:"3d6",damageType:"Р",natural:true,damageIncludesBody:true,equipped:true,attackRate:1,description:"<p>Естественное оружие утопца. СА 1; эффектов нет.</p>",source:"Базовая книга, стр. 277"}},...traits(["wild","poison-immunity","amphibian","mindless","fire-vulnerable","necrophage-oil","monster-resistance"])];
  return [bandit,drowner,...coreBestiarySources()];
}

// ── Core pp.270–313: the rest of the bestiary, built from bestiary-core.mjs. ──
const CATEGORY_ICONS = { humanoid: "icons/svg/mystery-man.svg", beast: "icons/svg/pawprint.svg", necrophage: "icons/svg/skull.svg", specter: "icons/svg/terror.svg",
  cursed: "icons/svg/blood.svg", hybrid: "icons/svg/wing.svg", insectoid: "icons/svg/biohazard.svg", elemental: "icons/svg/statue.svg", relict: "icons/svg/oak.svg",
  ogroid: "icons/svg/stoned.svg", draconid: "icons/svg/fire.svg", vampire: "icons/svg/blood.svg" };
const OILS = { "necrophage-oil": "трупоедов", "specter-oil": "духов", "beast-oil": "зверей", "cursed-oil": "проклятых", "hybrid-oil": "гибридов", "insectoid-oil": "инсектоидов",
  "elemental-oil": "духов стихий", "relict-oil": "реликтов", "ogroid-oil": "огров", "draconid-oil": "драконидов", "vampire-oil": "вампиров" };
// Extra creature traits (not in CREATURE_TRAITS); night vision is read by the environment rules.
const EXTRA_TRAITS = {
  "night-vision": ["Ночное зрение", "Действует в зонах со слабым освещением без штрафов."],
  flying: ["Летающее", "Может перемещаться по воздуху; правила сбивания — в способности «Полёт»."],
  fearless: ["Бесстрашие", "Его нельзя запугать, с ним нельзя договориться."],
  construct: ["Конструкция", "Не кровоточит, не горит, невосприимчив к ядам и магии разума."],
  massive: ["Массивный", "Невосприимчив к Аард и эффектам, сбивающим с ног."]
};
// Loot names of the book that differ from the catalog names.
const LOOT_ALIASES = { "Когти гуля": "material.ghoul-claw", "Перо грифона": "material.griffin-feathers", "Глаза беса": "material.fiend-eye", "Когти накера": "material.nekker-claw",
  "Глаза главоглаза": "material.monster-eyes", "Стрелы": "ammunition.standard", "Эльфские ввинчивающиеся боеприпасы": "ammunition.elven-burrowing" };
const lootCatalog = () => [...MATERIALS, ...ALCHEMY, ...CORE_EQUIPMENT, ...CORE_AMMUNITION, ...ELDER_EQUIPMENT];
const normal = text => text.toLocaleLowerCase("ru").replaceAll("ё", "е");
function lootSource(name) {
  const catalog = lootCatalog(), alias = LOOT_ALIASES[name];
  return alias ? catalog.find(entry => entry.id === alias) : catalog.find(entry => normal(entry.name) === normal(name)) ?? null;
}
const WEAPON_ALIASES = { "Метательные ножи": "weapon.throwing-knife" };
function catalogItem(source, id, overrides = {}) {
  return { _id: id, name: source.name, type: source.type, img: source.img ?? defaultItemIcon(source),
    system: { ...structuredClone(source.system), ruleId: source.id, ...overrides },
    flags: { ...structuredClone(source.flags ?? {}), core: { sourceId: `Compendium.${SYSTEM_ID}.equipment.Item.${source.documentId}` } } };
}
function creatureWeapon(weapon, id, page) {
  const source = weapon.natural ? null : CORE_EQUIPMENT.find(entry => entry.id === WEAPON_ALIASES[weapon.name] || entry.name === weapon.name);
  if (!weapon.natural && !source) throw new Error(`Missing bestiary weapon: ${weapon.name}`);
  const system = { category: weapon.category ?? "melee", skill: weapon.skill, damage: weapon.damage, natural: Boolean(weapon.natural), damageIncludesBody: true,
    equipped: true, attackRate: weapon.rate ?? 1, accuracy: weapon.accuracy ?? source?.system.accuracy ?? 0, range: weapon.range ?? source?.system.range ?? 0,
    ...(weapon.range !== undefined ? { rangeBodyMultiplier: 0 } : {}),
    hands: weapon.hands ?? source?.system.hands ?? 1, quantity: 1, carried: true, source: `Базовая книга, стр. ${page + 1}` };
  // Catalog properties keep reach, damage types and durability; the statblock supplies its own damage and rate.
  const properties = [...new Set([source?.system.properties, weapon.properties].filter(Boolean).flatMap(text => text.split(/;\s*/u)))].join("; ");
  system.properties = properties;
  system.description = `<p>${properties || "Эффектов нет."} СА ${system.attackRate}.</p>`;
  return source ? { ...catalogItem(source, id, system), name: weapon.name } : { _id: id, name: weapon.name, type: "weapon", img: asset("claws"), system };
}
function coreCreature(entry, index) {
  const actorId = `bstr${String(index + 1).padStart(12, "0")}`, itemId = (() => { let n = 0; return () => `bst${String(index + 1).padStart(3, "0")}i${String(++n).padStart(9, "0")}`; })();
  const img = CATEGORY_ICONS[entry.category] ?? "icons/svg/mystery-man.svg";
  const actor = { _id: actorId, name: entry.name, type: "npc", img, ownership: { default: 0 },
    prototypeToken: { name: entry.name, texture: { src: img }, actorLink: false, disposition: -1, sight: { enabled: false } },
    system: { attributes: attributes(entry.attrs), health: { value: entry.hp, max: entry.hp }, stamina: { value: entry.sta, max: entry.sta }, vigor: entry.vigor ?? 0, skills: { ...entry.skills },
      ...(entry.id === "mage" ? { details: { profession: "mage" } } : {}) } };
  const loot = [], harvest = [], ammunition = [];
  for (const [name, formula, currency] of entry.loot ?? []) {
    const source = currency ? null : lootSource(name);
    if (!source) { loot.push({ name, formula, currency: Boolean(currency) }); continue; }
    const fixed = /^\d+$/.test(formula);
    // Carried ammunition is available to the creature and looted from its inventory, never awarded a second time as harvest.
    if (source.system.kind === "ammunition" && fixed) { ammunition.push({ source, quantity: Number(formula) }); continue; }
    harvest.push({ id: `${entry.id}-${harvest.length}`.slice(0, 32), uuid: `Compendium.witcher-eliott-system.equipment.Item.${source.documentId}`, quantity: fixed ? Number(formula) : 0,
      formula: fixed ? "" : formula.replace("/", " / "), skill: "", dc: 0, attempted: false });
  }
  actor.system.creature = { category: entry.category, difficulty: entry.difficulty, reward: entry.reward, size: entry.size, weight: entry.weight, habitat: entry.habitat,
    intellect: entry.intellect, group: entry.group, source: `Базовая книга, стр. ${entry.page}–${entry.page + 1}`, description: entry.description, tactics: entry.tactics,
    naturalArmor: entry.armor ?? 0, resistances: entry.resistances ?? "", healthMax: entry.hp, staminaMax: entry.sta, hasTailOrWings: Boolean(entry.hasTailOrWings),
    sizeClass: entry.size_class ?? "medium", lore: (entry.lore ?? []).map(([name, skill, dc, text]) => ({ name, skill, dc, text })), loot, lootGenerated: false };
  actor.system.harvest = harvest;
  const ability = (ruleId, name, description, flags = {}) => ({ _id: itemId(), name, type: "ability", img: "icons/svg/aura.svg", system: { ruleId, description: `<p>${description}</p>` }, flags });
  const items = [];
  for (const weapon of entry.weapons ?? []) items.push(creatureWeapon(weapon, itemId(), entry.page));
  for (const trait of entry.traits ?? []) {
    const [id, value] = trait.split(":"), known = CREATURE_TRAITS.find(row => row.id === `creature.${id}`);
    if (known) items.push(ability(known.id, known.name, id === "wild" && value ? `Внимание и Выживание в дикой природе рассчитываются с Интеллектом ${value} за инстинкты.` : known.description,
      id === "wild" && value ? { [SYSTEM_ID]: { wildIntelligence: Number(value) } } : {}));
    else if (EXTRA_TRAITS[id]) items.push(ability(`creature.${id}`, ...EXTRA_TRAITS[id]));
  }
  for (const [name, text] of entry.abilities ?? []) items.push(ability(`creature.${entry.id}.${items.length}`, name, text,
    name === "Регенерация" && entry.regeneration ? { [SYSTEM_ID]: { regeneration: entry.regeneration,
      ...(entry.regenerationSunlight !== undefined ? { regenerationSunlight: entry.regenerationSunlight } : {}) } } : {}));
  for (const vulnerability of entry.vulnerabilities ?? []) {
    if (OILS[vulnerability]) { if (vulnerability === "necrophage-oil") items.push(ability("creature.necrophage-oil", "Масло против трупоедов", CREATURE_TRAITS.find(row => row.id === "creature.necrophage-oil").description)); else items.push(ability(`creature.${vulnerability}`, `Масло против ${OILS[vulnerability]}`, `Уязвимость: масло против ${OILS[vulnerability]} добавляет свой бонус к урону по этому существу.`)); continue; }
    if (vulnerability === "hanged-man-venom") { items.push(ability("creature.hanged-man-venom", "Яд повешенного", CREATURE_TRAITS.find(row => row.id === "creature.hanged-man-venom").description)); continue; }
    const [title, ...rest] = vulnerability.split(":");
    items.push(ability(`creature.${entry.id}.${items.length}`, `Уязвимость: ${title.trim()}`, rest.length ? rest.join(":").trim() : title));
  }
  for (const name of entry.spells ?? []) {
    const spell = CORE_MAGIC.find(row => row.name === name);
    if (!spell) throw new Error(`Missing bestiary spell: ${name}`);
    items.push({ _id: itemId(), name: spell.name, type: "spell", img: "icons/svg/book.svg", system: structuredClone(spell.system),
      flags: { core: { sourceId: `Compendium.witcher-eliott-system.spells.Item.${spell.documentId}` } } });
  }
  items.push(...ammunition.map(({ source, quantity }) => catalogItem(source, itemId(), { quantity, equipped: false, carried: true })));
  actor.items = items;
  return actor;
}
export const coreBestiarySources = () => CORE_BESTIARY.map(coreCreature);

/** Imported names may change; page references alone are shared by several distinct creatures. */
export function bestiaryPreset(actor) {
  const sources = bestiarySources(), prefix = `Compendium.${SYSTEM_ID}.bestiary.Actor.`;
  const origin = actor._stats?.compendiumSource || actor.flags?.core?.sourceId || "";
  const imported = origin.startsWith(prefix) ? sources.find(source => source._id === origin.slice(prefix.length)) : null;
  return imported ?? sources.find(source => source._id === (actor.id ?? actor._id))
    ?? sources.find(source => source.name === actor.name && source.system.creature.source === actor.system?.creature?.source) ?? null;
}
