import { ALCHEMY_EFFECT_KEYS, EFFECT_TEMPLATES, effectUuid } from "./condition-definitions.mjs";
import { formatEffectDuration } from "./effect-duration.mjs";

const INTRO = {
  adda:"Средство для сохранения пищи и останков от разложения.", alkali:"Порошок для нейтрализации кислоты.",
  clotting:"Порошок для временной остановки кровотечения.",hallucinogen:"Состав, искажающий восприятие. Его можно подмешать в питьё или бросить в лицо с расстояния до 3 метров.",
  "invisible-ink":"Чернила для скрытой переписки: запись становится видна при нагревании.", numbing:"Смесь трав, притупляющая боль.",
  "poisoners-friend":"Добавка, маскирующая примесь яда.","smelling-salts":"Резко пахнущая соль для приведения пострадавшего в чувство.",
  sterilizing:"Жидкость для очистки и обработки ран.","succubus-breath":"Ароматный состав для нанесения на кожу или добавления в напиток; способы применения дают разные эффекты.",
  "wives-tears":"Средство, быстро прекращающее опьянение.", acid:"Едкая жидкость, опасная как для живой ткани, так и для снаряжения.",
  adhesive:"Быстро затвердевающий состав для склеивания предметов и поверхностей.","black-venom":"Яд для отравления пищи или покрытия оружия. Обнаружение примеси: Внимание СЛ 16.",
  chloroform:"Усыпляющая жидкость. Чтобы прижать пропитанную ткань к лицу противника, требуется атака навыком Ближний бой.",
  "quick-fire":"Покрытие, повышающее горючесть поверхности; для воспламенения нужен контакт с огнём.","bredans-fury":"Нестабильная смесь, взрывающаяся при контакте с воздухом.",
  fisstech:"Сильный стимулятор с риском потери сознания и зависимости.",pantagran:"Эйфорическое зелье, ослабляющее сопротивление убеждению.",
  perfume:"Ароматное зелье, вызывающее продолжительное опьянение.","talgar-tears":"Состав, быстро замораживающий поражённые поверхности.","zerrikanian-fire":"Зажигательная смесь, воспламеняющая цель при попадании."
};
export function alchemyDescription(entry) {
  const id=entry.id.split(".")[1], keys=entry.id.startsWith("alchemy.") ? ALCHEMY_EFFECT_KEYS[id]??[] : [];
  const intro=INTRO[id]??({potion:"Ведьмачий эликсир.",oil:"Покрытие для оружия против определённой категории противников.",decoction:"Ведьмачий отвар на основе мутагена."})[entry.system.alchemy.category];
  return `<p>${intro}</p><h3>Действие состава</h3><p>${entry.system.properties}</p>`
    +(keys.length?`<p><strong>Эффекты:</strong> ${keys.map(key=>`@UUID[${effectUuid(key)}]{${EFFECT_TEMPLATES.find(entry=>entry.key===key).name}}`).join(" · ")}</p>`:"");
}

/** Description details use current Item fields, never a second stored copy of duration/toxicity. */
export function alchemyDescriptionDetails(system) {
  if (system.kind !== "alchemy") return "";
  const alchemy = system.alchemy ?? {}, facts = [];
  if (Number.isFinite(alchemy.duration) && (["potion", "oil", "decoction"].includes(alchemy.category) || alchemy.duration > 0)) {
    const duration = alchemy.duration === 0 ? "Мгновенно" : formatEffectDuration(alchemy.duration);
    facts.push(`<strong>Длительность:</strong> ${duration}`);
  }
  if (["potion", "decoction"].includes(alchemy.category) || alchemy.toxicity > 0) {
    const toxicity = Number(alchemy.toxicity);
    if (Number.isFinite(toxicity)) facts.push(`<strong>Токсичность:</strong> ${toxicity}%`);
  }
  return facts.length ? `<p class="witcher-alchemy-details">${facts.join(" · ")}</p>` : "";
}
