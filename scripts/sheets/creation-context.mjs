import { RACES } from "../data/races.mjs";
import { ORIGINS, getOrigin } from "../data/origins.mjs";
import { FAMILY_STATUSES } from "../data/family-statuses.mjs";
import { INFLUENTIAL_FRIENDS } from "../data/influential-friends.mjs";
import { PROFESSIONS, getProfession, COMBAT_SKILLS } from "../data/professions.mjs";
import { SKILLS, SKILL_GROUPS } from "../data/skills.mjs";
import { LANGUAGES } from "../data/languages.mjs";
import { backgroundModifiers, modifierTotal } from "../data/background-modifiers.mjs";
import { WITCHER_TABLES, WITCHER_RISKS, witcherTrialModifier } from "../data/witcher-lifepath.mjs";
import { LIFE_KINDS, LIFE_EVENTS } from "../data/life-events.mjs";
import { getEquipment } from "../data/equipment.mjs";
import {
  CREATION_STEPS, REGIONS, HOMELAND_ROWS, FAMILY_FATE, PARENT_FATE, SIBLING_TABLE, SIBLING_COLUMNS, STYLE_TABLES, WITCHER_ROLL_TABLES,
  ATTRIBUTE_ORDER, POINT_LEVELS, ATTRIBUTE_MAX, CREATION_SKILL_MAX, NATIVE_LANGUAGE_LEVEL, PROFESSION_GEAR, PROFESSION_FIXED_GEAR,
  PROFESSION_FIXED_NOTES, WITCHER_FORMULAS, PROFESSION_MAGIC, STARTING_CROWNS, familyGroup, nativeLanguage, regionOfOrigin, professionAllowed,
  attributeState, chosenAttributes, derivedPreview, skillState, stepErrors, lifeEventCount, pendingAges, gearChoiceCount, gearCrowns, lifepathCrowns,
  nameSamples, magicMatches, biographyText, PICKUP_LANGUAGE
} from "../data/character-creation.mjs";

const loc = key => globalThis.game?.i18n?.localize(key) ?? key;
const tableRows = (rows, chosen, rolled) => rows.map((text, index) => ({ index: index + 1, text, chosen: chosen === index + 1, rolled: rolled === index + 1 }));
const attributeLabel = key => loc(`WITCHER.Attributes.${key}.Short`);

function raceStep(state) {
  return RACES.map(race => ({ id: race.id, name: loc(race.label), note: race.note ? loc(race.note) : "", chosen: state.race === race.id,
    icon: { human: "fa-solid fa-user", elf: "fa-solid fa-leaf", dwarf: "fa-solid fa-hammer", witcher: "fa-solid fa-eye" }[race.id],
    perks: race.abilities.map(ability => ({ name: loc(ability.label), text: loc(ability.description) })) }));
}

function originStep(state) {
  const group = familyGroup(state.race, state.origin), family = state.family ?? {}, region = state.region || regionOfOrigin(state.origin);
  const origins = ["north", "nilfgaard", "elder"].map(id => ({ id, name: REGIONS[id], active: region === id,
    entries: ORIGINS.filter(origin => origin.group === id).map(origin => ({ id: origin.id, name: loc(origin.label), bonus: loc(origin.bonus), chosen: state.origin === origin.id,
      roll: id === "north" ? HOMELAND_ROWS.north.indexOf(origin.id) + 1 : id === "nilfgaard" ? (origin.id === "nilfgaard-heartland" ? "1–3" : `4–10 · ${HOMELAND_ROWS.vassal.indexOf(origin.id) + 1}`) : "" })) }));
  const chosenOrigin = getOrigin(state.origin);
  const statuses = FAMILY_STATUSES.filter(entry => entry.group === group).map(entry => ({ id: entry.id, roll: entry.roll, name: loc(entry.label),
    text: loc(entry.description), reward: loc(entry.reward), chosen: family.status === entry.id }));
  const friends = INFLUENTIAL_FRIENDS.filter(entry => entry.group === group).map(entry => ({ id: entry.id, roll: entry.roll, name: loc(entry.label),
    text: loc(entry.description), chosen: family.friend === entry.id }));
  const siblings = (family.siblings ?? []).map((sibling, index) => ({ index, name: sibling.name ?? "",
    columns: SIBLING_COLUMNS.map(([key, title]) => ({ key, title, value: sibling[key] ? SIBLING_TABLE[key][sibling[key] - 1] : "", rows: SIBLING_TABLE[key].map((text, row) => ({ index: row + 1, text, chosen: sibling[key] === row + 1 })) })) }));
  return {
    witcher: state.race === "witcher", group, groupName: REGIONS[group === "elder" ? "elder" : group], region, origins,
    origin: chosenOrigin ? { name: loc(chosenOrigin.label), bonus: loc(chosenOrigin.bonus), language: loc(LANGUAGES.find(language => language.id === nativeLanguage(state.origin))?.name ?? "") } : null,
    nonhuman: ["elf", "dwarf"].includes(state.race),
    family: { alive: family.alive, aliveKnown: family.alive !== null && family.alive !== undefined, fateRows: tableRows(FAMILY_FATE[group], family.fate, family.fateRolled),
      parentsAlive: family.parentsAlive, parentsKnown: family.parentsAlive !== null && family.parentsAlive !== undefined,
      parentRows: tableRows(PARENT_FATE[group], family.parentFate, family.parentFateRolled), whichParent: family.whichParent,
      parentChoices: ["Отец", "Мать", "Оба родителя"].map(name => ({ name, chosen: family.whichParent === name })),
      statuses, friends, siblingCount: family.siblingCount, siblingsKnown: Number.isInteger(family.siblingCount), siblings,
      countChoices: Array.from({ length: 9 }, (_, count) => ({ count, chosen: family.siblingCount === count })),
      chosenStatus: statuses.find(entry => entry.chosen) ?? null, chosenFriend: friends.find(entry => entry.chosen) ?? null },
    witcherTables: WITCHER_ROLL_TABLES.map(table => ({ ...table, rows: WITCHER_TABLES[table.key].map(row => ({ id: row.id, name: row.name, text: row.description, chosen: state.witcher?.[table.key] === row.id })),
      chosen: WITCHER_TABLES[table.key].find(row => row.id === state.witcher?.[table.key])?.name ?? "",
      hint: table.key === "trial" ? `Модификатор Испытания: ${witcherTrialModifier(state.witcher)}${state.witcher?.trialRoll ? ` · бросок ${state.witcher.trialRoll}` : ""}` : table.key === "school" ? "Школу Мантикоры можно выбрать вручную. Бросок d10 использует пять школ Базовой книги." : "" }))
  };
}

const kindName = id => LIFE_KINDS.find(kind => kind.id === id)?.name ?? "Событие";
function eventTitle(event) {
  const detail = event[event.kind] ?? {};
  const result = LIFE_EVENTS[event.kind]?.find(row => row.id === detail.result);
  const person = ["ally", "enemy"].includes(event.kind) ? [detail.gender, detail.occupation].filter(Boolean).join(", ") : "";
  // The second roll of a row: what kind of loss, accusation, tragedy or difficulty.
  const nested = [[detail.result, detail[detail.result]], ["tragic", detail.tragedy], ["difficult", detail.difficulty], ["accident", detail.accident]]
    .map(([table, id]) => id && LIFE_EVENTS[table]?.find(row => row.id === id)).find(Boolean);
  const extra = [detail.amount ? `${detail.amount} крон` : "", detail.months ? `${detail.months} мес.` : "", detail.animal ?? ""].filter(Boolean).join(", ");
  const text = [nested ? [nested.name, nested.description].filter(Boolean).join(": ") : result?.description, extra].filter(Boolean).join(" · ");
  return { title: [kindName(event.kind), result?.name ?? person].filter(Boolean).join(" · "), text: text || [detail.meeting, detail.cause, detail.closeness, detail.pursuit].filter(Boolean).join(" · ") };
}
function decadeTitle(decade) {
  const outcome = { benefit: "Выгода", ally: "Союзник", hunt: "Охота", nothing: "Ничего особенного" }[decade.outcome] ?? "Десятилетие";
  const danger = decade.danger?.kind && decade.danger.kind !== "none" ? { event: "Опасное событие", wound: "Рана", enemy: "Враг" }[decade.danger.kind] : "";
  const detail = decade.outcome === "benefit" ? WITCHER_TABLES.benefit.find(row => row.id === decade.benefit?.result)?.name
    : decade.outcome === "hunt" ? [decade.hunt?.category, decade.hunt?.location].filter(Boolean).join(", ")
    : decade.outcome === "ally" ? [decade.ally?.gender, decade.ally?.occupation].filter(Boolean).join(", ") : "";
  return { title: [outcome, detail].filter(Boolean).join(" · "), text: danger ? `Опасность: ${danger}${decade.danger.kind === "wound" ? ` — ${WITCHER_TABLES.wound.find(row => row.id === decade.danger.wound)?.name ?? ""}` : decade.danger.kind === "event" ? ` — ${WITCHER_TABLES.dangerEvent.find(row => row.id === decade.danger.event)?.name ?? ""}` : ""}` : "Без опасностей" };
}
function eventsStep(state) {
  const witcher = state.race === "witcher", expected = lifeEventCount(state);
  const list = (witcher ? state.decades : state.events) ?? [], pending = pendingAges(state);
  const fallback = state.decadeRisk ?? "normal";
  const riskOptions = chosen => WITCHER_RISKS.map(risk => ({ id: risk.id, name: `${risk.name} · опасность ${risk.danger}%`, chosen: chosen === risk.id }));
  const label = age => witcher ? `${age}–${Number(age) + 9}` : age;
  const entries = list.map((entry, index) => ({ index, sortAge: Number(entry.age), age: label(entry.age), ...(witcher ? decadeTitle(entry) : eventTitle(entry)),
    risk: witcher ? WITCHER_RISKS.find(risk => risk.id === entry.risk)?.name ?? "" : "",
    tone: witcher ? (entry.danger?.kind && entry.danger.kind !== "none" ? "danger" : entry.outcome) : entry.kind }));
  // Empty decades stay in the timeline, each with its own roll and, for a witcher, its own risk.
  const slots = pending.map(age => ({ pending: true, sortAge: age, rollAge: age, age: label(age), risks: witcher ? riskOptions(state.decadeRisks?.[age] ?? fallback) : null }));
  return { witcher, expected, count: list.length, missing: pending.length, extra: list.length > expected,
    pathStartAge: state.witcher?.pathStartAge ?? 20, risks: riskOptions(fallback),
    entries: [...entries, ...slots].sort((a, b) => a.sortAge - b.sortAge) };
}

function styleStep(state) {
  return STYLE_TABLES.map(table => ({ ...table, value: state.style?.[table.key] ? table.rows[state.style[table.key] - 1] : "",
    rows: table.rows.map((text, index) => ({ index: index + 1, text, chosen: state.style?.[table.key] === index + 1 })) }));
}

function professionStep(state) {
  return PROFESSIONS.map(profession => ({ id: profession.id, name: profession.name, chosen: state.profession === profession.id,
    allowed: professionAllowed(state.race, profession.id), defining: profession.abilities[0].name, definingText: profession.abilities[0].description, vigor: profession.vigor,
    magic: profession.magic, skills: [...profession.skills.map(key => key === "language" ? `Язык (выберите ${profession.languageChoices})` : loc(`WITCHER.Skills.Entries.${key}.Label`)),
      ...(profession.id === "man-at-arms" ? ["+ 5 боевых навыков на выбор"] : [])], gear: `Выберите ${profession.equipmentChoices}: ${profession.equipment}`,
    crowns: `${STARTING_CROWNS[profession.id]} × 2d6 крон`,
    icon: { bard: "fa-solid fa-guitar", witcher: "fa-solid fa-eye", "man-at-arms": "fa-solid fa-shield-halved", priest: "fa-solid fa-hands-praying", mage: "fa-solid fa-hat-wizard",
      doctor: "fa-solid fa-staff-snake", criminal: "fa-solid fa-mask", craftsman: "fa-solid fa-hammer", merchant: "fa-solid fa-scale-balanced", peasant: "fa-solid fa-wheat-awn" }[profession.id], source: profession.source, note: profession.note }));
}

function details(state) { return { race: state.race, origin: state.origin, familyStatus: state.race === "witcher" ? "" : state.family?.status }; }
function attributesStep(state) {
  const info = attributeState(state.attributes), values = chosenAttributes(state.attributes), modifiers = backgroundModifiers(details(state));
  const mode = state.attributes?.mode ?? "points", assigned = state.attributes?.assigned ?? {}, taken = new Set(Object.values(assigned));
  const effective = Object.fromEntries(ATTRIBUTE_ORDER.map(key => [key, values[key] + modifierTotal(modifiers, `attributes.${key}`)]));
  return { mode, points: mode === "points", rolled: mode === "roll", budget: info.budget, spent: info.spent, remaining: info.remaining, over: info.remaining < 0,
    levels: POINT_LEVELS.map(level => ({ ...level, chosen: (state.attributes?.level ?? "skilled") === level.id })),
    pool: (state.attributes?.pool ?? []).map((value, index) => ({ index, value, used: taken.has(index), selected: state.attributes?.selected === index })),
    hasPool: (state.attributes?.pool ?? []).length > 0,
    rows: ATTRIBUTE_ORDER.map(key => {
      const bonus = modifierTotal(modifiers, `attributes.${key}`);
      return { key, name: loc(`WITCHER.Attributes.${key}.Label`), short: attributeLabel(key), value: values[key], effective: effective[key], bonus, bonusLabel: bonus ? `${bonus > 0 ? "+" : ""}${bonus}` : "",
        text: loc(`WITCHER.Attributes.${key}.Description`), canIncrease: mode === "points" && values[key] < ATTRIBUTE_MAX, canDecrease: mode === "points" && values[key] > 0,
        assigned: Number.isInteger(assigned[key]), fill: Math.min(100, values[key] * 10) };
    }),
    derived: derivedPreview(effective), errors: info.errors };
}

function skillsStep(state) {
  if (!state.profession) return null;
  const info = skillState(state), ranks = state.skills?.ranks ?? {}, pickup = state.skills?.pickup ?? {};
  const values = chosenAttributes(state.attributes), modifiers = backgroundModifiers(details(state));
  const effective = key => values[key] + modifierTotal(modifiers, `attributes.${key}`);
  const skillName = key => key ? loc(`WITCHER.Skills.Entries.${key}.Label`) : "—";
  // No total until the parameter itself is distributed: a bare rank would look like the final value.
  const total = (key, level) => { const skill = SKILLS.find(entry => entry.key === key); return skill && values[skill.attribute] > 0 ? effective(skill.attribute) + level + modifierTotal(modifiers, `skills.${key}`) : "—"; };
  const native = nativeLanguage(state.origin), professionKeys = new Set(info.slots.map(slot => slot.key));
  const chosenLanguages = Object.values(state.skills?.languages ?? {});
  const languageName = id => loc(LANGUAGES.find(language => language.id === id)?.name ?? "");
  // A language slot shows its tongue; the other non-native tongues not yet taken can replace it.
  const swapOptions = index => LANGUAGES.filter(language => language.id !== native && !chosenLanguages.includes(language.id))
    .map(language => ({ index, id: language.id, name: loc(language.name) }));
  const slots = info.slots.map(slot => {
    const level = Number(ranks[slot.id]) || 0;
    return { ...slot, level, name: slot.defining ? slot.name : slot.language ? languageName(chosenLanguages[slot.index]) || "Язык" : slot.combat ? "Боевой навык" : skillName(slot.key),
      label: slot.defining ? "Определяющий навык" : slot.combat ? skillName(slot.key) : slot.language ? "Язык профессии · ИНТ" : loc(`WITCHER.Attributes.${SKILLS.find(skill => skill.key === slot.key)?.attribute}.Short`),
      total: slot.defining || slot.language || !slot.key ? "" : total(slot.key, level), cost: slot.complex ? "×2" : "",
      canIncrease: level < CREATION_SKILL_MAX && (slot.complex ? 2 : 1) <= info.remaining, canDecrease: level > 1,
      combatOptions: slot.combat ? COMBAT_SKILLS.filter(key => !professionKeys.has(key) || key === slot.key).map(key => ({ key, name: skillName(key), chosen: key === slot.key })) : null,
      swapOptions: slot.language ? swapOptions(slot.index) : null, pips: Array.from({ length: CREATION_SKILL_MAX }, (_, i) => ({ on: i < level })) };
  });
  const groups = SKILL_GROUPS.map(attribute => ({ attribute, name: loc(`WITCHER.Attributes.${attribute}.Label`), value: effective(attribute),
    skills: SKILLS.filter(skill => skill.attribute === attribute && skill.key !== "language" && !professionKeys.has(skill.key)).map(skill => {
      const level = Number(pickup[skill.key]) || 0, step = skill.complex ? 2 : 1;
      return { key: skill.key, name: skillName(skill.key), level, complex: skill.complex, total: total(skill.key, level),
        canIncrease: level < CREATION_SKILL_MAX && step <= info.pickupRemaining, canDecrease: level > 0, pips: Array.from({ length: CREATION_SKILL_MAX }, (_, i) => ({ on: i < level })) };
    }) })).filter(group => group.skills.length);
  // Other tongues take pickup points too (×2, INT); the native one and the profession's are not here.
  const pickupTongues = LANGUAGES.filter(language => language.id !== native && !chosenLanguages.includes(language.id)).map(language => {
    const key = `${PICKUP_LANGUAGE}${language.id}`, level = Number(pickup[key]) || 0;
    return { key, name: loc(language.name), level, complex: true, total: values.intelligence > 0 ? effective("intelligence") + level : "—",
      canIncrease: level < CREATION_SKILL_MAX && 2 <= info.pickupRemaining, canDecrease: level > 0, pips: Array.from({ length: CREATION_SKILL_MAX }, (_, i) => ({ on: i < level })) };
  });
  if (pickupTongues.length) groups.push({ attribute: "language", name: "Языки", value: effective("intelligence"), skills: pickupTongues });
  return { ...info, slots, groups, attributesPending: attributeState(state.attributes).errors.length > 0, nativeLanguage: loc(LANGUAGES.find(language => language.id === native)?.name ?? ""), nativeLevel: NATIVE_LANGUAGE_LEVEL, over: info.remaining < 0, pickupOver: info.pickupRemaining < 0 };
}

function gearStep(state, catalogs) {
  const options = PROFESSION_GEAR[state.profession] ?? [], picks = new Set(state.gear?.picks ?? []), need = gearChoiceCount(state.profession);
  const formulas = state.profession === "witcher" ? WITCHER_FORMULAS.map(group => ({ ...group, slots: Array.from({ length: group.count }, (_, slot) => ({ slot,
    options: (catalogs.formulas ?? []).filter(entry => entry.ruleId.startsWith(group.prefix)).map(entry => ({ ...entry, chosen: state.gear?.formulas?.[group.key]?.[slot] === entry.ruleId })) })) })) : [];
  const magic = (PROFESSION_MAGIC[state.profession] ?? []).map(group => {
    const chosen = new Set(state.gear?.magic?.[group.key] ?? []);
    const entries = (catalogs.magic ?? []).filter(entry => magicMatches(entry, group.filter));
    const picked = group.all ? Math.min(group.count, entries.length) : chosen.size;
    return { ...group, picked, full: picked >= group.count,
      entries: entries.map(entry => ({ ruleId: entry.ruleId, name: entry.name, text: entry.summary, chosen: group.all || chosen.has(entry.ruleId), locked: group.all || (!chosen.has(entry.ruleId) && chosen.size >= group.count) })) };
  });
  const family = state.race === "witcher" ? null : FAMILY_STATUSES.find(entry => entry.id === state.family?.status);
  const friend = state.race === "witcher" ? null : INFLUENTIAL_FRIENDS.find(entry => entry.id === state.family?.friend);
  const keepsake = id => loc(getEquipment(id)?.label ?? id);
  const keepsakes = [...(family ? [{ name: `Семья: ${loc(family.label)}`, text: family.equipment.length ? family.equipment.map(keepsake).join(", ") : loc(family.reward) }] : []),
    ...(friend ? [{ name: `Друг: ${loc(friend.label)}`, text: (friend.equipment ?? []).map(keepsake).join(", ") }] : [])];
  return { need, picked: picks.size, full: picks.size >= need, options: options.map((entry, index) => ({ index, name: entry.name, chosen: picks.has(index), locked: !picks.has(index) && picks.size >= need,
      money: entry.crowns ? `+${entry.crowns} крон` : "" })),
    fixed: (PROFESSION_FIXED_GEAR[state.profession] ?? []).map(entry => catalogs.names?.[entry.ruleId] ?? entry.ruleId), fixedNote: PROFESSION_FIXED_NOTES[state.profession] ?? "",
    formulas, magic, keepsakes, crowns: state.crowns, crownsRolled: Number.isInteger(state.crowns), crownsFormula: `${STARTING_CROWNS[state.profession] ?? 0} × 2d6`,
    bonusCrowns: gearCrowns(state) + lifepathCrowns(state), totalCrowns: (Number(state.crowns) || 0) + gearCrowns(state) + lifepathCrowns(state) };
}

function summaryStep(state) {
  const race = RACES.find(entry => entry.id === state.race), profession = getProfession(state.profession), bio = biographyText(state);
  const values = chosenAttributes(state.attributes), modifiers = backgroundModifiers(details(state));
  const origin = getOrigin(state.origin);
  return { race: race ? loc(race.label) : "—", profession: profession?.name ?? "—", origin: origin ? loc(origin.label) : "—",
    status: loc(FAMILY_STATUSES.find(entry => entry.id === state.family?.status)?.label ?? "") , friend: loc(INFLUENTIAL_FRIENDS.find(entry => entry.id === state.family?.friend)?.label ?? ""),
    attributes: ATTRIBUTE_ORDER.map(key => ({ short: attributeLabel(key), value: values[key] + modifierTotal(modifiers, `attributes.${key}`) })),
    derived: derivedPreview(Object.fromEntries(ATTRIBUTE_ORDER.map(key => [key, values[key] + modifierTotal(modifiers, `attributes.${key}`)]))),
    bio, names: nameSamples(state.race, state.origin), events: (state.race === "witcher" ? state.decades : state.events)?.length ?? 0 };
}

/** Everything the template shows; `catalogs` holds compendium lists loaded by the window. */
export function creationContext(state, catalogs = {}) {
  const steps = CREATION_STEPS.map((step, index) => {
    const errors = stepErrors(state, step.id);
    return { ...step, index: index + 1, active: state.step === step.id, done: !errors.length, errors };
  });
  const current = steps.find(step => step.active) ?? steps[0], position = steps.indexOf(current);
  const ready = steps.every(step => step.done);
  return {
    steps, step: current, stepId: current.id, errors: current.errors, prev: steps[position - 1] ?? null, next: steps[position + 1] ?? null, ready,
    progress: Math.round(steps.filter(step => step.done).length / steps.length * 100),
    is: Object.fromEntries(CREATION_STEPS.map(step => [step.id, step.id === current.id])),
    state, races: raceStep(state), origin: originStep(state), events: eventsStep(state), style: styleStep(state), professions: professionStep(state),
    attributes: attributesStep(state), skills: skillsStep(state), gear: gearStep(state, catalogs), summary: summaryStep(state),
    log: (state.log ?? []).slice(-12).reverse()
  };
}
