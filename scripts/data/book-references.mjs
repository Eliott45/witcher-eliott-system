const pages = String.raw`[Сс]тр\.\s*\d+(?:\s*[–—,\-/]\s*\d+)*`;

/** Remove citations from prose without changing HTML attributes, document links or dice rolls. */
export function withoutBookPages(value = "") {
  return String(value).split(/(<[^>]*>|@UUID\[[^\]]*\]|\[\[[\s\S]*?\]\])/g).map((text, index) => {
    if (index % 2 || !/[Сс]тр\.\s*\d/.test(text)) return text;
    return text
      .replace(/Источник: базовая книга, стр\. 12\. Снаряжение: стр\. 247–248, 254–255, 258, 263–264; официальная errata R\. Talsorian v4\./g, "Источник: Базовая книга.")
      .replace(new RegExp(`Базовая книга: ${pages}, дерево: ${pages}`, "g"), "Базовая книга")
      .replace(new RegExp(` ?\\((?:таблица на |боковая колонка на )?${pages}\\)`, "g"), "")
      .replace(new RegExp(`\\(${pages},\\s*`, "g"), "(")
      .replace(new RegExp(` Свойство описано на ${pages}\\.`, "g"), "")
      .replace(new RegExp(`; правила зависимости — ${pages}`, "g"), "")
      .replace(new RegExp(`(таблиц[а-яё]*) на ${pages}`, "g"), "$1")
      .replace(new RegExp(` на ${pages}`, "g"), " в книге")
      .replace(new RegExp(`(?:[, ·]\\s*)?${pages}`, "g"), "")
      .replace(/(?:;| ·)\s*официальная errata(?: R\. Talsorian)?(?: v\d+)?/g, "");
  }).join("");
}

/** Source fields show the book title; rules and corrections live in the description. */
export function bookSource(value = "") {
  const text = String(value);
  if (/^[Бб]азовая книга(?:$|[,;:. ·])/.test(text)) return "Базовая книга";
  return withoutBookPages(text);
}
