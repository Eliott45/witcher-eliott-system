import { CORE_EQUIPMENT } from "./core-equipment.mjs";
import { MATERIALS } from "./workshop-materials.mjs";
import { AMMUNITION_ICON } from "./core-ammunition.mjs";
import { CREATURE_TRAITS } from "./creatures.mjs";
import { defaultItemIcon } from "./item-icons.mjs";

const asset=name=>`systems/witcher-eliott-system/assets/creatures/${name}.svg`;
const attributes=values=>Object.fromEntries(["intelligence","reflex","dexterity","body","speed","empathy","craft","will","luck"].map((key,i)=>[key,values[i]]));
const gear=(id,overrides={})=>{
  const entry=CORE_EQUIPMENT.find(entry=>entry.id===id);if(!entry)throw new Error(`Missing bestiary equipment: ${id}`);
  return { _id:entry.documentId,name:entry.name,type:entry.type,img:entry.img??defaultItemIcon(entry),system:{...structuredClone(entry.system),ruleId:id,equipped:true,...overrides},flags:{core:{sourceId:`Compendium.witcher-eliott-system.equipment.Item.${entry.documentId}`}}};
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
    {_id:"banditBolts00001",name:"Болты",type:"equipment",img:AMMUNITION_ICON,system:{kind:"ammunition",quantity:20,weight:0.05,price:1,description:"<p>Стандартные арбалетные болты. Добыча разбойника: 20 штук.</p>"}},...traits(["hanged-man-venom"])];
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
  return [bandit,drowner];
}
