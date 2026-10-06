import { creatureDetailsHidden } from "./concealment.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { SKILLS } from "../data/skills.mjs";
import { escapeTooltip as esc } from "../sheets/statistics-tooltips.mjs";

const signed = value => `${value < 0 ? "−" : "+"}${Math.abs(value)}`;
const faces = die => `${die.number > 1 ? die.number : ""}к${die.faces}`;

/** Die line: a Witcher critical chain is shown as its separate throws. */
function dieRow(die) {
  const chain = die.options?.[SYSTEM_ID]?.criticalChains?.[0];
  if (chain) {
    const [first, ...rest] = chain.results, sign = chain.kind === "fumble" ? "−" : "+";
    return {label:`${faces(die)} · ${chain.kind === "fumble" ? "провал" : "крит"}`, detail:`${first}${rest.map(value => ` ${sign} ${value}`).join("")}`,
      value:die.total, kind:chain.kind};
  }
  const results = die.results.filter(result => result.active).map(result => result.result);
  return {label:faces(die), detail:results.length > 1 ? results.join(", ") : "", value:die.total, kind:"die"};
}

/** Known modifier sources recorded by the system when it built the roll. */
function knownParts(flags, index) {
  const parts = [];
  if (flags.weaponAttack?.parts) {
    for (const part of flags.weaponAttack.parts) if (part.value) parts.push({label:part.label, value:part.value});
  } else if (flags.skillCheck || flags.professionCheck) {
    const check = flags.skillCheck ?? flags.professionCheck, skill = SKILLS.find(entry => entry.key === check.key);
    const attribute = skill ? game.i18n.localize(`WITCHER.Attributes.${skill.attribute}.Short`) : "Атрибут";
    parts.push({label:attribute, detail:"атрибут", value:check.attribute ?? 0}, {label:skill ? game.i18n.localize(skill.label) : "Навык", detail:"навык", value:check.level ?? 0});
    if (check.bonus) parts.push({label:"Бонусы и штрафы", value:check.bonus});
    if (flags.action?.penalty) parts.push({label:"Дополнительное действие", value:flags.action.penalty});
  } else if (flags.action?.penalty) parts.push({label:"Дополнительное действие", value:flags.action.penalty});
  if (flags.luck && flags.luck.rollIndex === index && flags.luck.target !== "death") parts.push({label:"Удача", value:flags.luck.bonus, kind:"luck"});
  return parts;
}

export function rollBreakdown(message, roll, index = 0) {
  if (!roll?.dice?.length || !Number.isFinite(roll.total)) return null;
  const dice = roll.dice.map(dieRow), flags = message.flags?.[SYSTEM_ID] ?? {};
  const parts = knownParts(flags, index).filter(part => part.value);
  const modifier = roll.total - dice.reduce((sum, row) => sum + row.value, 0);
  // Anything the flags do not explain (manual formula edits, older messages) stays visible as one line.
  const rest = modifier - parts.reduce((sum, part) => sum + part.value, 0);
  if (rest) parts.push({label:parts.length ? "Прочее" : "Модификатор", value:rest});
  return {dice, parts, total:roll.total};
}

export function breakdownHTML({dice, parts, total}) {
  const row = (label, detail, value, kind = "") => `<li class="${kind ? `is-${kind}` : ""}"><span>${esc(label)}${detail ? ` <small>${esc(detail)}</small>` : ""}</span><b>${value}</b></li>`;
  return `<ul class="witcher-roll-breakdown">${dice.map(die => row(die.label, die.detail, die.value, die.kind)).join("")}`
    + parts.map(part => row(part.label, part.detail, signed(part.value), part.kind ?? (part.value < 0 ? "penalty" : "bonus"))).join("")
    + `<li class="is-total"><span>Итог</span><b>${total}</b></li></ul>`;
}

export function renderRollBreakdown(message, html) {
  if (!message.isContentVisible || !message.rolls?.length) return;
  if (creatureDetailsHidden(message.speakerActor)) {
    html.querySelectorAll(".flavor-text [data-tooltip], .message-header .flavor-text [data-tooltip]").forEach(element => element.removeAttribute("data-tooltip"));
    return;
  }
  html.querySelectorAll(".dice-roll").forEach((element, index) => {
    const breakdown = rollBreakdown(message, message.rolls[index], index), total = element.querySelector(".dice-total");
    if (!breakdown || !total) return;
    total.dataset.tooltip = breakdownHTML(breakdown);
    total.dataset.tooltipClass = "witcher-roll-tooltip";
    total.dataset.tooltipDirection = "LEFT";
    total.classList.add("witcher-roll-total");
    const kind = breakdown.dice.find(die => die.kind === "critical" || die.kind === "fumble")?.kind;
    if (kind) total.classList.add(`is-${kind}`);
  });
}

export const registerRollBreakdown = () => Hooks.on("renderChatMessageHTML", renderRollBreakdown);
