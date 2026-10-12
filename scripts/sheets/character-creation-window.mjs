import { evaluateRoll } from "../dice/minimum-roll.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { getProfession } from "../data/professions.mjs";
import { SKILLS } from "../data/skills.mjs";
import { getLanguage } from "../data/languages.mjs";
import { generateLifeEvent } from "../data/life-event-generator.mjs";
import { generateDecade } from "../data/witcher-decades.mjs";
import { LIFE_EVENT_FIELDS, LIFE_EVENT_GROUPS, validateLifeEvent } from "../data/life-event-fields.mjs";
import { DECADE_FIELDS, DECADE_GROUPS } from "../data/lifepath-fields.mjs";
import { editStructuredRecord } from "./lifepath-context.mjs";
import { creationContext } from "./creation-context.mjs";
import {
  CREATION_STEPS, STYLE_TABLES, SIBLING_COLUMNS, WITCHER_ROLL_TABLES, ATTRIBUTE_ORDER, ATTRIBUTE_ROLL, ATTRIBUTE_MAX, CREATION_SKILL_MAX, PROFESSION_MAGIC,
  blankCreation, regionForRoll, homelandForRoll, regionOfOrigin, familyGroup, evenAlive, whichParent, familyStatusForRoll, friendForRoll, siblingCount,
  witcherRow, professionAllowed, gearChoiceCount, crownsFormula, pendingAges, withMinimumRanks, creationErrors, creationUpdate, creationItems, magicRuleIds, nameSamples
} from "../data/character-creation.mjs";

const windows = new Map();
const FLAG = "creationDraft";
const plain = html => String(html ?? "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const setPath = (object, path, value) => foundry.utils.setProperty(object, path, value);
/** Dice So Nice for everyone; a stalled animation (hidden tab) never holds the wizard for more than a few seconds. */
const showDice = roll => game.dice3d ? Promise.race([game.dice3d.showForRoll(roll, game.user, true).catch(() => {}), new Promise(resolve => setTimeout(resolve, 4000))]) : Promise.resolve();

/** The character creation wizard: every table can be rolled or chosen by hand, and the draft is kept on the actor. */
export class CharacterCreationWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-creation"],
    window: { title: "Создание персонажа", resizable: true, icon: "fa-solid fa-feather-pointed" },
    position: { width: 1120, height: 820 },
    actions: {
      goStep: CharacterCreationWindow.#goStep, prevStep: CharacterCreationWindow.#prevStep, nextStep: CharacterCreationWindow.#nextStep,
      pickRace: CharacterCreationWindow.#pickRace, rollHomeland: CharacterCreationWindow.#rollHomeland, pickOrigin: CharacterCreationWindow.#pickOrigin,
      rollFamily: CharacterCreationWindow.#rollFamily, pickFamily: CharacterCreationWindow.#pickFamily, rollFamilyAll: CharacterCreationWindow.#rollFamilyAll,
      rollSibling: CharacterCreationWindow.#rollSibling, pickSibling: CharacterCreationWindow.#pickSibling,
      rollWitcher: CharacterCreationWindow.#rollWitcher, pickWitcher: CharacterCreationWindow.#pickWitcher, rollWitcherAll: CharacterCreationWindow.#rollWitcherAll,
      rollEvents: CharacterCreationWindow.#rollEvents, rollEvent: CharacterCreationWindow.#rollEvent, rerollEvent: CharacterCreationWindow.#rerollEvent, editEvent: CharacterCreationWindow.#editEvent, removeEvent: CharacterCreationWindow.#removeEvent,
      rollStyle: CharacterCreationWindow.#rollStyle, rollStyleAll: CharacterCreationWindow.#rollStyleAll, pickStyle: CharacterCreationWindow.#pickStyle,
      pickProfession: CharacterCreationWindow.#pickProfession,
      attrMode: CharacterCreationWindow.#attrMode, attrChange: CharacterCreationWindow.#attrChange, rollAttributes: CharacterCreationWindow.#rollAttributes,
      pickPool: CharacterCreationWindow.#pickPool, assignAttr: CharacterCreationWindow.#assignAttr, autoAssign: CharacterCreationWindow.#autoAssign,
      skillChange: CharacterCreationWindow.#skillChange, pickLanguage: CharacterCreationWindow.#pickLanguage, pickupChange: CharacterCreationWindow.#pickupChange,
      gearToggle: CharacterCreationWindow.#gearToggle, magicToggle: CharacterCreationWindow.#magicToggle, rollCrowns: CharacterCreationWindow.#rollCrowns,
      randomName: CharacterCreationWindow.#randomName, finish: CharacterCreationWindow.#finish, restart: CharacterCreationWindow.#restart
    }
  };
  static PARTS = { content: { template: `systems/${SYSTEM_ID}/templates/character-creation.hbs`, scrollable: [".witcher-creation-body", ".witcher-creation-log"] } };

  constructor(actor) {
    super();
    this.actor = actor;
    this.draft = foundry.utils.mergeObject(blankCreation(), actor.getFlag(SYSTEM_ID, FLAG) ?? {}, { inplace: false });
    if (!actor.getFlag(SYSTEM_ID, FLAG)) Object.assign(this.draft, { name: actor.name === game.i18n.localize("DOCUMENT.Actor") ? "" : actor.name });
    this.save = foundry.utils.debounce(() => this.actor.isOwner && this.actor.setFlag(SYSTEM_ID, FLAG, this.draft).catch(error => console.warn("Witcher | Creation draft", error)), 500);
  }

  get title() { return `Создание персонажа — ${this.actor.name}`; }

  /** Spells and witcher formulas come from the world's compendiums, which may carry the GM's edits. */
  async catalogs() {
    this.catalogLoad ??= (async () => {
      const spells = game.packs.get(`${SYSTEM_ID}.spells`), equipment = game.packs.get(`${SYSTEM_ID}.equipment`);
      const magic = spells ? (await spells.getDocuments()).map(doc => ({ ruleId: doc.system.ruleId, name: doc.name, system: doc.system, summary: plain(doc.system.description).slice(0, 220) })) : [];
      const index = equipment ? await equipment.getIndex({ fields: ["system.ruleId"] }) : [];
      const formulas = Array.from(index).filter(entry => /^formula\.(potion|oil|decoction)\./u.test(entry.system?.ruleId ?? ""))
        .map(entry => ({ ruleId: entry.system.ruleId, name: entry.name.replace(/^Формула:\s*/u, "") })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
      const names = Object.fromEntries(Array.from(index).map(entry => [entry.system?.ruleId, entry.name]));
      return { magic: magic.sort((a, b) => a.name.localeCompare(b.name, "ru")), formulas, names };
    })();
    return this.catalogLoad;
  }

  async _prepareContext() {
    withMinimumRanks(this.draft);
    const context = creationContext(this.draft, await this.catalogs());
    return { ...context, flash: this.flash ?? null, busy: Boolean(this.busy), editable: this.actor.isOwner };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const input of this.element.querySelectorAll("[data-field]")) input.addEventListener("change", () => {
      const raw = input.type === "checkbox" ? input.checked : input.value;
      const value = input.dataset.type === "number" ? Math.max(0, Math.trunc(Number(raw) || 0)) : raw;
      setPath(this.draft, input.dataset.field, value);
      if (input.dataset.field === "attributes.level" || input.dataset.rerender !== undefined) this.commit(); else this.save();
    });
    // A rolled result flares once, then settles.
    if (this.flash) {
      for (const node of this.element.querySelectorAll(`[data-flash="${CSS.escape(this.flash)}"]`)) node.classList.add("is-flaring");
      this.flash = null;
    }
    this.element.querySelector(".witcher-creation-body")?.classList.toggle("is-entering", this.entering === true);
    this.entering = false;
  }

  /** Persist the draft and redraw. */
  commit(flash = null) {
    if (flash) this.flash = flash;
    this.save();
    return this.render();
  }

  /** One die roll, shown to everyone through Dice So Nice and kept in the creation log. */
  async roll(formula, label, { show = true } = {}) {
    const roll = await evaluateRoll(formula,{ allowInteractive: false });
    if (show) await showDice(roll);
    const dice = roll.dice.flatMap(die => die.results.filter(result => result.active).map(result => result.result));
    this.draft.log.push({ label, formula, total: roll.total, dice: dice.length > 1 ? dice.join(", ") : "" });
    if (this.draft.log.length > 80) this.draft.log.splice(0, this.draft.log.length - 80);
    return roll.total;
  }
  d10(label) { return this.roll("1d10", label); }

  /* -------------------------------------------- */
  /*  Navigation                                  */
  /* -------------------------------------------- */

  go(step) {
    if (!CREATION_STEPS.some(entry => entry.id === step)) return;
    this.draft.step = step;
    this.entering = true;
    return this.commit();
  }
  static #goStep(_event, target) { return this.go(target.dataset.step); }
  static #prevStep() { const index = CREATION_STEPS.findIndex(step => step.id === this.draft.step); return this.go(CREATION_STEPS[Math.max(0, index - 1)].id); }
  static #nextStep() { const index = CREATION_STEPS.findIndex(step => step.id === this.draft.step); return this.go(CREATION_STEPS[Math.min(CREATION_STEPS.length - 1, index + 1)].id); }

  /* -------------------------------------------- */
  /*  Race, homeland and family                   */
  /* -------------------------------------------- */

  static #pickRace(_event, target) {
    const race = target.dataset.race;
    if (this.draft.race === race) return;
    this.draft.race = race;
    if (["elf", "dwarf"].includes(race)) { this.draft.region = "elder"; this.draft.origin = race === "dwarf" ? "mahakam" : "dol-blathanna"; }
    else if (regionOfOrigin(this.draft.origin) === "elder") { this.draft.origin = ""; this.draft.region = ""; }
    if (race === "witcher") this.draft.profession = "witcher";
    else if (!professionAllowed(race, this.draft.profession)) this.draft.profession = "";
    // Another family column: earlier family rows no longer match.
    this.draft.family = blankCreation().family;
    return this.commit(`race:${race}`);
  }
  static async #rollHomeland() {
    const race = this.draft.race;
    let region = "elder";
    if (!["elf", "dwarf"].includes(race)) region = regionForRoll(race, await this.d10("Регион: нечёт — Север, чёт — Нильфгаард"));
    let origin = homelandForRoll(region, 1, 1, race);
    if (region === "north") origin = homelandForRoll(region, await this.d10("Королевства Севера"));
    if (region === "nilfgaard") {
      const heart = await this.d10("Нильфгаард: 1–3 — Сердце, 4–10 — вассальные государства");
      origin = homelandForRoll(region, heart, heart > 3 ? await this.d10("Вассальные государства") : 1);
    }
    this.draft.region = region;
    this.setOrigin(origin);
    return this.commit(`origin:${origin}`);
  }
  setOrigin(origin) {
    const before = familyGroup(this.draft.race, this.draft.origin);
    this.draft.origin = origin;
    this.draft.region = regionOfOrigin(origin);
    if (familyGroup(this.draft.race, origin) !== before) Object.assign(this.draft.family, { status: "", friend: "", fate: 0, parentFate: 0 });
  }
  static #pickOrigin(_event, target) { this.setOrigin(target.dataset.origin); return this.commit(`origin:${target.dataset.origin}`); }

  async rollFamilyField(field) {
    const family = this.draft.family, group = familyGroup(this.draft.race, this.draft.origin);
    if (field === "alive") family.alive = evenAlive(await this.d10("Семья: чёт — кто-то жив, нечёт — что-то случилось"));
    if (field === "fate") family.fate = family.fateRolled = await this.d10("Судьба семьи");
    if (field === "parents") family.parentsAlive = evenAlive(await this.d10("Родители: чёт — живы, нечёт — что-то случилось"));
    if (field === "parentFate") family.parentFate = family.parentFateRolled = await this.d10("Судьба родителей");
    if (field === "whichParent") family.whichParent = whichParent(await this.d10("Кто из родителей: 1–4 отец, 5–8 мать, 9–10 оба"));
    if (field === "status") family.status = familyStatusForRoll(group, await this.d10("Положение семьи"));
    if (field === "friend") family.friend = friendForRoll(group, await this.d10("Друг, оказавший влияние"));
    if (field === "siblings") this.setSiblings(siblingCount(this.draft.race, group, await this.d10("Братья и сёстры")));
    return field;
  }
  setSiblings(count) {
    const family = this.draft.family;
    family.siblingCount = count;
    family.siblings = Array.from({ length: count }, (_, index) => family.siblings?.[index] ?? {});
  }
  static async #rollFamily(_event, target) { const field = await this.rollFamilyField(target.dataset.roll); return this.commit(`family:${field}`); }
  static #pickFamily(_event, target) {
    const { field, value } = target.dataset, family = this.draft.family;
    if (["alive", "parentsAlive"].includes(field)) family[field] = value === "true";
    else if (["fate", "parentFate"].includes(field)) family[field] = Number(value);
    else if (field === "siblingCount") this.setSiblings(Number(value));
    else family[field] = value;
    return this.commit();
  }
  /** Rolls every family table that is still empty, in the book's order. */
  static async #rollFamilyAll() {
    const family = this.draft.family;
    if (!this.draft.origin && this.draft.race !== "witcher") await CharacterCreationWindow.#rollHomeland.call(this);
    if (family.alive === null || family.alive === undefined) await this.rollFamilyField("alive");
    if (family.alive === false && !family.fate) await this.rollFamilyField("fate");
    if (family.parentsAlive === null || family.parentsAlive === undefined) await this.rollFamilyField("parents");
    if (family.parentsAlive === false && !family.parentFate) { await this.rollFamilyField("parentFate"); await this.rollFamilyField("whichParent"); }
    if (!family.status) await this.rollFamilyField("status");
    if (!family.friend) await this.rollFamilyField("friend");
    if (!Number.isInteger(family.siblingCount)) await this.rollFamilyField("siblings");
    for (const [index, sibling] of family.siblings.entries()) for (const [column, title] of SIBLING_COLUMNS)
      if (!sibling[column]) sibling[column] = await this.roll("1d10", `Брат/сестра ${index + 1}: ${title}`, { show: false });
    return this.commit("family:all");
  }
  static async #rollSibling(_event, target) {
    const index = Number(target.dataset.index), sibling = this.draft.family.siblings[index];
    if (!sibling) return;
    for (const [column, title] of SIBLING_COLUMNS) if (!target.dataset.column || target.dataset.column === column)
      sibling[column] = await this.roll("1d10", `Брат/сестра ${index + 1}: ${title}`, { show: !target.dataset.column ? column === "gender" : true });
    return this.commit(`sibling:${index}`);
  }
  static #pickSibling(_event, target) {
    const sibling = this.draft.family.siblings[Number(target.dataset.index)];
    if (sibling) sibling[target.dataset.column] = Number(target.dataset.row);
    return this.commit();
  }

  /* -------------------------------------------- */
  /*  Witcher path                                */
  /* -------------------------------------------- */

  async rollWitcherTable(table) {
    const name = WITCHER_ROLL_TABLES.find(entry => entry.key === table)?.name ?? table;
    const roll = await this.d10(`Ведьмак: ${name}`);
    if (table === "trial") this.draft.witcher.trialRoll = roll;
    this.draft.witcher[table] = witcherRow(table, roll, this.draft.witcher);
  }
  static async #rollWitcher(_event, target) { await this.rollWitcherTable(target.dataset.table); return this.commit(`witcher:${target.dataset.table}`); }
  static #pickWitcher(_event, target) { this.draft.witcher[target.dataset.table] = target.dataset.id; return this.commit(); }
  static async #rollWitcherAll() {
    for (const table of WITCHER_ROLL_TABLES) if (!this.draft.witcher[table.key]) await this.rollWitcherTable(table.key);
    return this.commit("witcher:all");
  }

  /* -------------------------------------------- */
  /*  Life events                                 */
  /* -------------------------------------------- */

  /** Rolls every missing decade: an event each 10 years, or a witcher's decade on the Path. */
  static async #rollEvents() {
    const ages = pendingAges(this.draft);
    if (!ages.length) return ui.notifications.info("Все десятилетия уже определены.");
    for (const age of ages) this.lifeList().push(await this.generateEntry(age));
    this.lifeList().sort((a, b) => a.age - b.age);
    return this.commit("events");
  }
  lifeList() { return this.draft.race === "witcher" ? this.draft.decades : this.draft.events; }
  /** One decade: an important event, or a witcher's decade at the risk chosen for it. */
  async generateEntry(age, risk = null) {
    const witcher = this.draft.race === "witcher", rolls = [];
    const draw = async faces => { const roll = await evaluateRoll(`1d${faces}`,{ allowInteractive: false }); rolls.push(roll); return roll.total; };
    const entry = witcher ? await generateDecade(age, risk ?? this.draft.decadeRisks?.[age] ?? this.draft.decadeRisk ?? "normal", draw) : await generateLifeEvent(age, draw);
    if (rolls[0]) await showDice(rolls[0]);
    this.draft.log.push({ label: witcher ? `Десятилетие ${age}–${age + 9}` : `Событие в ${age} лет`, formula: `${rolls.length}×d10`, total: rolls[0]?.total ?? 0,
      dice: rolls.map(roll => roll.total).join(", ") });
    return { ...entry, id: foundry.utils.randomID() };
  }
  static async #rollEvent(_event, target) {
    const age = Number(target.dataset.age), list = this.lifeList();
    if (list.some(entry => Number(entry.age) === age)) return;
    list.push(await this.generateEntry(age));
    list.sort((a, b) => a.age - b.age);
    return this.commit(`event:${age}`);
  }
  static async #rerollEvent(_event, target) {
    const list = this.lifeList(), index = Number(target.dataset.index), old = list[index];
    if (!old) return;
    const age = Number(old.age);
    list[index] = { ...await this.generateEntry(age, this.draft.decadeRisks?.[age] ?? old.risk), id: old.id };
    return this.commit(`event:${age}`);
  }
  static async #editEvent(_event, target) {
    const witcher = this.draft.race === "witcher", list = witcher ? this.draft.decades : this.draft.events, index = Number(target.dataset.index);
    const previous = list[index];
    let data = previous ?? (witcher ? { age: (Number(this.draft.witcher.pathStartAge) || 20) + list.length * 10, risk: "normal", outcome: "nothing", danger: { kind: "none" } }
      : { age: (list.length + 1) * 10, kind: "fortune" });
    while (true) {
      data = witcher ? await editStructuredRecord("Десятилетие на Пути", DECADE_FIELDS, DECADE_GROUPS, data)
        : await editStructuredRecord("Жизненное событие", LIFE_EVENT_FIELDS, LIFE_EVENT_GROUPS, data);
      if (!data) return;
      const error = witcher ? "" : validateLifeEvent(data);
      if (!error) break;
      ui.notifications.warn(error);
    }
    const entry = { ...data, id: previous?.id ?? foundry.utils.randomID() };
    if (previous) list[index] = entry; else list.push(entry);
    list.sort((a, b) => a.age - b.age);
    return this.commit();
  }
  static #removeEvent(_event, target) {
    const list = this.draft.race === "witcher" ? this.draft.decades : this.draft.events;
    list.splice(Number(target.dataset.index), 1);
    return this.commit();
  }

  /* -------------------------------------------- */
  /*  Style                                       */
  /* -------------------------------------------- */

  static async #rollStyle(_event, target) {
    const table = STYLE_TABLES.find(entry => entry.key === target.dataset.table);
    if (!table) return;
    this.draft.style[table.key] = await this.d10(`Стиль: ${table.name}`);
    return this.commit(`style:${table.key}`);
  }
  static async #rollStyleAll() {
    const roll = await evaluateRoll(`${STYLE_TABLES.length}d10`,{ allowInteractive: false });
    await showDice(roll);
    const results = roll.dice[0].results.map(result => result.result);
    STYLE_TABLES.forEach((table, index) => { this.draft.style[table.key] = results[index]; });
    this.draft.log.push({ label: "Стиль и ценности", formula: roll.formula, total: roll.total, dice: results.join(", ") });
    return this.commit("style:all");
  }
  static #pickStyle(_event, target) { this.draft.style[target.dataset.table] = Number(target.dataset.row); return this.commit(); }

  /* -------------------------------------------- */
  /*  Profession, attributes and skills           */
  /* -------------------------------------------- */

  static #pickProfession(_event, target) {
    const id = target.dataset.profession;
    if (!professionAllowed(this.draft.race, id)) return ui.notifications.warn(this.draft.race === "witcher" || id === "witcher"
      ? "Раса и профессия ведьмака неразделимы." : "Магами и жрецами могут быть только люди и эльфы.");
    if (this.draft.profession !== id) {
      this.draft.profession = id;
      this.draft.skills = { ...this.draft.skills, ranks: {}, combat: [], languages: [] };
      this.draft.gear = { picks: [], formulas: {}, magic: {} };
      this.draft.crowns = null;
    }
    return this.commit(`profession:${id}`);
  }
  static #attrMode(_event, target) {
    this.draft.attributes.mode = target.dataset.mode;
    return this.commit();
  }
  static #attrChange(_event, target) {
    const values = this.draft.attributes.values, key = target.dataset.key;
    values[key] = Math.max(0, Math.min(ATTRIBUTE_MAX, (Number(values[key]) || 0) + Number(target.dataset.delta)));
    return this.commit();
  }
  static async #rollAttributes() {
    const roll = await evaluateRoll(ATTRIBUTE_ROLL,{ allowInteractive: false });
    await showDice(roll);
    const pool = roll.dice[0].results.filter(result => result.active).map(result => result.result);
    Object.assign(this.draft.attributes, { mode: "roll", pool, assigned: {}, selected: null });
    this.draft.log.push({ label: "Параметры: 9d10, 1 и 2 перебрасываются", formula: ATTRIBUTE_ROLL, total: roll.total, dice: pool.join(", ") });
    return this.commit("attributes:pool");
  }
  static #pickPool(_event, target) {
    const index = Number(target.dataset.index), attributes = this.draft.attributes;
    attributes.selected = attributes.selected === index ? null : index;
    return this.commit();
  }
  static #assignAttr(_event, target) {
    const attributes = this.draft.attributes, key = target.dataset.key;
    if (Number.isInteger(attributes.selected)) {
      for (const [other, index] of Object.entries(attributes.assigned)) if (index === attributes.selected) delete attributes.assigned[other];
      attributes.assigned[key] = attributes.selected;
      attributes.selected = null;
    } else delete attributes.assigned[key];
    return this.commit(`attr:${key}`);
  }
  /** Highest rolls to the parameters the profession leans on, the rest in order. */
  static #autoAssign() {
    const attributes = this.draft.attributes, profession = getProfession(this.draft.profession);
    // Weight: the defining skill counts double, then each profession skill adds to its parameter.
    const weight = Object.fromEntries(ATTRIBUTE_ORDER.map(key => [key, key === "luck" ? -1 : 0]));
    if (profession?.abilities[0].attribute) weight[profession.abilities[0].attribute] += 2;
    for (const key of profession?.skills ?? []) { const attribute = SKILLS.find(skill => skill.key === key)?.attribute; if (attribute) weight[attribute] += 1; }
    const priority = ATTRIBUTE_ORDER.toSorted((a, b) => weight[b] - weight[a]);
    const order = attributes.pool.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value);
    attributes.assigned = Object.fromEntries(priority.map((key, i) => [key, order[i].index]));
    attributes.selected = null;
    return this.commit("attributes:auto");
  }
  static #skillChange(_event, target) {
    const ranks = this.draft.skills.ranks, slot = target.dataset.slot, delta = Number(target.dataset.delta);
    // A profession skill never drops below its minimum of 1.
    ranks[slot] = Math.max(1, Math.min(CREATION_SKILL_MAX, (Number(ranks[slot]) || 0) + delta));
    return this.commit(`slot:${slot}`);
  }
  static #pickLanguage(_event, target) {
    this.draft.skills.languages[Number(target.dataset.index)] = target.dataset.id;
    return this.commit(`slot:language${target.dataset.index}`);
  }
  static #pickupChange(_event, target) {
    const pickup = this.draft.skills.pickup, key = target.dataset.key;
    pickup[key] = Math.max(0, Math.min(CREATION_SKILL_MAX, (Number(pickup[key]) || 0) + Number(target.dataset.delta)));
    if (!pickup[key]) delete pickup[key];
    return this.commit(`pickup:${key}`);
  }

  /* -------------------------------------------- */
  /*  Gear and money                              */
  /* -------------------------------------------- */

  static #gearToggle(_event, target) {
    const picks = this.draft.gear.picks, index = Number(target.dataset.index), at = picks.indexOf(index);
    if (at >= 0) picks.splice(at, 1);
    else if (picks.length < gearChoiceCount(this.draft.profession)) picks.push(index);
    return this.commit();
  }
  static #magicToggle(_event, target) {
    const group = PROFESSION_MAGIC[this.draft.profession]?.find(entry => entry.key === target.dataset.group);
    if (!group || group.all) return;
    const list = (this.draft.gear.magic[group.key] ??= []), at = list.indexOf(target.dataset.rule);
    if (at >= 0) list.splice(at, 1); else if (list.length < group.count) list.push(target.dataset.rule);
    return this.commit();
  }
  static async #rollCrowns() {
    this.draft.crowns = await this.roll(crownsFormula(this.draft.profession), "Стартовый капитал");
    return this.commit("crowns");
  }

  /* -------------------------------------------- */
  /*  Summary                                     */
  /* -------------------------------------------- */

  static #randomName() {
    const names = nameSamples(this.draft.race, this.draft.origin);
    this.draft.name = names[Math.floor(Math.random() * names.length)];
    return this.commit("name");
  }
  static async #restart() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Начать заново?" }, content: "<p>Черновик создания будет очищен. Персонаж не изменится.</p>" });
    if (!ok) return;
    this.draft = blankCreation();
    this.draft.name = this.actor.name;
    return this.commit();
  }

  /** Writes the draft to the actor: details, parameters, skills, lifepath, biography, money and the starting kit. */
  static async #finish() {
    const errors = creationErrors(this.draft);
    if (errors.length) { ui.notifications.warn(errors[0].message); return this.go(errors[0].step); }
    const actor = this.actor;
    if (!actor.isOwner || this.busy) return;
    const filled = actor.items.some(item => !item.getFlag(SYSTEM_ID, "creation")) || Object.values(actor.system.attributes ?? {}).some(value => value !== null);
    if (filled && !await foundry.applications.api.DialogV2.confirm({ window: { title: "Перезаписать персонажа?" },
      content: "<p>Параметры, навыки, детали и жизненный путь будут заменены. Предметы, выданные прошлым созданием, заменятся новыми; остальные предметы останутся.</p>" })) return;
    this.busy = true;
    await this.render();
    try {
      const update = creationUpdate(this.draft, id => game.i18n.localize(getLanguage(id)?.name ?? id));
      // A life-event teacher of a language needs that language on the sheet.
      for (const event of this.draft.events) {
        const language = event.kind === "fortune" && event.fortune?.result === "teacher" && getLanguage(event.fortune.skill);
        if (language && !update["system.languages"].some(entry => entry.id === language.id))
          update["system.languages"].push({ id: language.id, name: game.i18n.localize(language.name), level: 0 });
      }
      await actor.update(update);
      const old = actor.items.filter(item => item.getFlag(SYSTEM_ID, "creation")).map(item => item.id);
      if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
      this.links = [];
      const items = await this.buildItems();
      if (items.length) await actor.createEmbeddedDocuments("Item", items, { keepId: true });
      if (this.links.length) await actor.updateEmbeddedDocuments("Item", this.links);
      await actor.update({ "system.health.value": actor.system.health.max, "system.stamina.value": actor.system.stamina.max, "system.resolve.value": actor.system.resolve.max,
        [`flags.${SYSTEM_ID}.-=${FLAG}`]: null });
      await this.postSummary(items.length);
      ui.notifications.info(`${actor.name}: персонаж создан.`);
      windows.delete(actor.uuid);
      await this.close();
      actor.sheet?.render(true);
    } catch (error) {
      console.error("Witcher | Character creation", error);
      ui.notifications.error(`Не удалось создать персонажа: ${error.message}`);
    } finally { this.busy = false; if (this.rendered) this.render(); }
  }

  /** Embedded items from the world's compendiums, marked so a second run replaces them. */
  async buildItems() {
    const state = this.draft, flags = { [SYSTEM_ID]: { creation: true } }, items = [];
    const fromPack = async (packId, ruleIds) => {
      const pack = game.packs.get(`${SYSTEM_ID}.${packId}`);
      if (!pack) return new Map();
      const index = await pack.getIndex({ fields: ["system.ruleId"] }), found = new Map();
      for (const ruleId of new Set(ruleIds)) {
        const entry = Array.from(index).find(row => row.system?.ruleId === ruleId);
        if (!entry) { console.warn(`Witcher | Creation: ${packId}/${ruleId} not found`); continue; }
        found.set(ruleId, game.items.fromCompendium(await pack.getDocument(entry._id), { clearFolder: true, keepId: false }));
      }
      return found;
    };
    const profession = getProfession(state.profession), defining = profession?.abilities[0];
    const ranks = Number(state.skills.ranks.defining) || 0;
    const abilities = defining ? await fromPack("abilities", [defining.id]) : new Map();
    if (abilities.has(defining?.id)) items.push({ ...abilities.get(defining.id), _id: foundry.utils.randomID(), system: { ...abilities.get(defining.id).system, level: ranks }, flags });
    const catalog = (await this.catalogs()).magic;
    const magic = await fromPack("spells", magicRuleIds(state, catalog));
    for (const data of magic.values()) items.push({ ...data, _id: foundry.utils.randomID(), flags });
    const specs = creationItems(state).filter(spec => !spec.custom);
    const gear = await fromPack("equipment", specs.map(spec => spec.ruleId));
    let mount = null;
    for (const spec of creationItems(state)) {
      if (spec.custom) { items.push({ _id: foundry.utils.randomID(), name: spec.name, type: "equipment", system: { kind: "gear", quantity: spec.quantity }, flags }); continue; }
      const source = gear.get(spec.ruleId);
      if (!source) continue;
      const data = { ...foundry.utils.deepClone(source), _id: foundry.utils.randomID(), flags: { ...source.flags, ...flags } };
      data.system.quantity = spec.quantity;
      if (spec.name) data.name = spec.name;
      if (spec.equipped) data.system.equipped = true;
      if (["transport.horse", "transport.mule"].includes(spec.ruleId)) mount = data._id;
      // A saddle on the horse, a cart behind the mule: linked once both exist on the actor.
      if (spec.mount && mount) this.links.push({ _id: data._id, "system.containerId": mount, "system.equipped": true });
      if (spec.cart && mount) this.links.push({ _id: data._id, "system.transport.mountId": mount });
      items.push(data);
    }
    return items;
  }

  async postSummary(count) {
    const context = creationContext(this.draft, await this.catalogs()), summary = context.summary;
    const rows = [["Раса", summary.race], ["Родина", summary.origin], ["Профессия", summary.profession], ["Возраст", this.draft.age]].filter(([, value]) => value && value !== "—");
    const content = `<section class="witcher-creation-card"><h3><i class="fa-solid fa-feather-pointed"></i> ${foundry.utils.escapeHTML(this.actor.name)}: персонаж создан</h3>`
      + `<p>${rows.map(([label, value]) => `${label}: <b>${foundry.utils.escapeHTML(String(value))}</b>`).join(" · ")}</p>`
      + `<p>${summary.attributes.map(entry => `${entry.short} ${entry.value}`).join(" · ")}</p>`
      + `<p>Бросков при создании: ${this.draft.log.length}. Предметов выдано: ${count}. Крон: ${this.actor.system.crowns}.</p></section>`;
    await foundry.documents.ChatMessage.create({ speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this.actor }), content, flags: { [SYSTEM_ID]: { skipLuck: true } } });
  }

  async close(options) {
    this.save.flush?.();
    windows.delete(this.actor.uuid);
    return super.close(options);
  }
}

/** Sheet action: open (or bring forward) the wizard for this actor. */
export async function openCharacterCreation() {
  const actor = this.actor ?? this.document;
  if (!actor?.isOwner) return;
  let app = windows.get(actor.uuid);
  if (!app) { app = new CharacterCreationWindow(actor); windows.set(actor.uuid, app); }
  await app.render({ force: true });
  app.bringToFront();
}

/** Macro and directory entry: pick one of your characters or start a new one. */
export async function createCharacter(actor = null) {
  if (actor) return openCharacterCreation.call({ actor });
  const own = game.actors.filter(entry => entry.type === "character" && entry.isOwner).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const canCreate = game.user.can("ACTOR_CREATE");
  if (!own.length && !canCreate) return ui.notifications.warn("Нет своих персонажей, а создавать новых вам не разрешено — попросите ведущего.");
  const esc = foundry.utils.escapeHTML;
  const choice = await foundry.applications.api.DialogV2.prompt({ window: { title: "Создание персонажа", icon: "fa-solid fa-feather-pointed" },
    content: `<label>Для кого<select name="actor">${canCreate ? `<option value="">Новый персонаж</option>` : ""}${own.map(entry =>
      `<option value="${entry.id}" ${entry.id === game.user.character?.id && !canCreate ? "selected" : ""}>${esc(entry.name)}</option>`).join("")}</select></label>`,
    ok: { label: "Открыть", callback: (_event, button) => button.form.elements.actor.value }, rejectClose: false });
  if (choice === null || choice === undefined) return;
  const target = choice ? game.actors.get(choice) : await Actor.implementation.create({ name: "Новый герой", type: "character" });
  if (target) return openCharacterCreation.call({ actor: target });
}

export function registerCharacterCreation() {
  game.system.api = { ...game.system.api, createCharacter };
  Hooks.on("renderActorDirectory", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    const actions = root?.querySelector(".header-actions");
    if (!actions || actions.querySelector("[data-witcher-creation]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.witcherCreation = "";
    button.innerHTML = `<i class="fa-solid fa-feather-pointed" aria-hidden="true"></i> Создать персонажа`;
    button.addEventListener("click", event => { event.preventDefault(); createCharacter().catch(error => ui.notifications.error(error.message)); });
    actions.append(button);
  });
}
