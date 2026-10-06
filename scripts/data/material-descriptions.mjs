import { SUBSTANCES } from "./workshop.mjs";

const prose = {
  ashes: "Мелкий остаток сгоревшего дерева и других материалов. Его собирают из остывшего кострища и очищают от крупных обломков.",
  coal: "Куски угля для ремесленных работ. Искать их можно среди прогоревшего топлива или в природных залежах.",
  cotton: "Мягкие растительные волокна, из которых прядут нити и делают набивку. Сырьё собирают с хлопковых растений.",
  "double-linen": "Плотное полотно для изделий, которым требуется несколько прочных слоёв ткани.",
  glass: "Стекло для ремесленных изделий. Готовый материал приобретают у торговцев.",
  "hardened-timber": "Обработанная древесина для прочных деревянных деталей. Это готовый ремесленный материал, а не обычные ветки из леса.",
  linen: "Тканое полотно для одежды, подкладок и других ремесленных работ.",
  oil: "Масло, используемое как компонент при изготовлении и обработке вещей.",
  resin: "Густая древесная смола. Её собирают с деревьев, затем очищают от коры и лесного мусора.",
  silk: "Тонкая шёлковая ткань для ремесленных изделий. Материал приобретают у торговцев.",
  thread: "Прядёные нити для шитья и изготовления тканей. Их покупают готовыми или изготавливают по чертежу.",
  timber: "Древесина для рукоятей, древков и других деталей. При сборе отбирают пригодные для работы куски дерева.",
  wax: "Воск для ремесленной обработки. В дикой местности его ищут там, где можно найти пчелиные соты.",
  "beast-bones": "Кости, полученные от животных и чудовищ. Количество пригодного материала зависит от конкретной добычи.",
  "cow-hide": "Коровья шкура — сырьё для последующей выделки и кожевенных работ.",
  "draconid-leather": "Обработанная кожа драконида. Используется в ремесленных рецептах как отдельный материал.",
  "draconid-scales": "Прочные чешуйки, извлечённые из останков виверны. Подходящие для работы части отделяют от повреждённых.",
  feathers: "Перья птиц, пригодные для ремесла. В работу идут сохранившие форму и неповреждённые перья.",
  "hardened-leather": "Укреплённая обработкой кожа для прочных деталей снаряжения.",
  leather: "Выделанная кожа для ремней, обмоток и других кожаных изделий.",
  "lyrian-leather": "Особый сорт готовой кожи, необходимый для некоторых ремесленных рецептов.",
  "wolf-hide": "Волчья шкура, снятая с добытого зверя. Её сохраняют как сырьё для дальнейшей обработки."
};
const escape = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
export function materialProse(item) {
  const system = item.system ?? {};
  const key = (system.ruleId || item.id || "").replace(/^material\./, "");
  const substance = SUBSTANCES.find(entry => entry.id === system.material?.substance)?.name ?? system.material?.substance;
  return `<p>${escape(prose[key] ?? (substance ? `Алхимический ингредиент, содержащий субстанцию «${substance}».` : "Материал для изготовления ремесленных изделий."))}</p>`;
}
export const materialAcquisition = system => /^Покупается/i.test(system.material?.location ?? "") ? "trade" : system.material?.forageDC > 0 ? "forage" : "harvest";

/** Facts are read from current fields so editing a DC or location never leaves stale prose. */
export function materialDescriptionDetails(system) {
  if (system.kind !== "material") return "";
  const material = system.material ?? {}, trade = materialAcquisition(system) === "trade";
  const facts = [["Где найти", material.location || "Определяет ведущий"]];
  if (!trade) {
    facts.push(["Сложность сбора", material.forageDC > 0 ? `СЛ ${material.forageDC}` : "Не задана"],
      ["Количество из источника", material.quantityFormula ? `${material.quantityFormula} ед.` : "Определяет ведущий"]);
    if (material.forageDC > 0) facts.push(["Проверка", "ИНТ + Выживание + 1d10"]);
  }
  return `<section class="witcher-material-guide"><h3>${trade ? "Получение материала" : material.forageDC > 0 ? "Поиск и сбор" : "Источник добычи"}</h3><dl>${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>${trade ? "" : `<p>${material.forageDC > 0 ? "Искать можно только в подходящей местности." : "Нужен доступ к указанному источнику. Ведущий определяет условия извлечения и необходимость проверки."}</p>`}<small>Вес и цена указаны за одну единицу материала.</small></section>`;
}

// Only these shipped defaults were incorrect in the original catalog (core pp. 128–129).
export const MATERIAL_LOCATION_CORRECTIONS = {
  "material.glass": "Покупается", "material.silk": "Покупается", "material.cow-hide": "Покупается", "material.lyrian-leather": "Покупается",
  "material.beast-bones": "Чудовища и животные", "material.fifth-essence": "Места силы, маги и бесы"
};

export function legacyMaterialProse(system) {
  const { substance, location } = system.material ?? {};
  const name = SUBSTANCES.find(entry => entry.id === substance)?.name ?? substance;
  const lead = substance ? `Алхимический ингредиент, содержащий субстанцию «${name}».` : "Сырьё для ремесленников: кузнецов, портных и оружейников.";
  return `<p>${location ? `${lead} Где искать: ${location.toLocaleLowerCase("ru")}.` : lead}</p>`;
}
