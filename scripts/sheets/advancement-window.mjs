import { SYSTEM_ID } from "../config.mjs";
import { advancementCost, advancementFingerprint, advancementPlan } from "../data/advancement.mjs";
import { purchaseAdvancement, setExperience } from "../data/advancement-purchase.mjs";
import { escapeTooltip } from "./statistics-tooltips.mjs";
import { getProfession } from "../data/professions.mjs";
import { viewSheetItem } from "./sheet-items.mjs";

const windows = new Map();
const categories = { skills: "fa-solid fa-graduation-cap", languages: "fa-solid fa-language", profession: "fa-solid fa-diagram-project", attributes: "fa-solid fa-person" };
const t = key => game.i18n.localize(`WITCHER.Advancement.${key}`);

export function advancementContext(actor, selection = {}, category = "skills") {
  const localize = key => game.i18n.localize(key);
  const plan = advancementPlan(actor, selection, localize);
  const rows = plan.entries.filter(row => row.kind === category).map(row => {
    const target = selection[row.id] ?? row.base;
    const to = target === null ? null : target + row.ranks;
    const predecessor = plan.entries.find(entry => entry.key === row.prerequisite);
    const locked = predecessor && (selection[predecessor.id] ?? predecessor.base) + predecessor.ranks < 5;
    const maxed = to !== null && to >= 10;
    const unset = row.base === null || (row.kind === "attributes" && row.base === 0);
    const full = maxed || unset ? 0 : advancementCost(to, to + 1, row.multiplier)[0];
    // Lesson points count only toward the rank right after the current one.
    const invested = to === row.level ? Math.min(row.progress, full) : 0, price = full - invested;
    return { ...row, displayLevel: row.level ?? "—", displayTarget: to ?? "—", price,
      unlocked: !locked, prerequisiteName: predecessor?.name ?? "",
      selected: target > row.base, cannotIncrease: Boolean(locked || maxed || unset || !actor.isOwner), cannotDecrease: !(target > row.base) || !actor.isOwner,
      hint: unset ? t("Unset") : locked ? `${t("Requires")} ${predecessor.name} 5` : maxed ? t("Maximum") : `${price} ${t("Unit")} · ${t("NextRank")}${invested ? ` · вложено ${invested} из ${full}` : ""}`,
      ruleHint: row.multiplier === 10 ? t("AttributeRule") : row.multiplier === 2 ? t("ComplexRule") : t("SkillRule"),
      ranksHint: row.ranks ? `${t("LifepathRanks")}: +${row.ranks}` : "",
      badge: row.multiplier === 2 ? "×2" : row.multiplier === 10 ? "×10" : "",
      search: `${row.name} ${row.detail}`.toLocaleLowerCase() };
  });
  const definition = category === "profession" ? getProfession(actor.system.details.profession) : null;
  const nodes = definition ? rows.map(row => ({ ...row.definition, ...row,
    uuid: `Compendium.${SYSTEM_ID}.abilities.Item.${row.definition.documentId}`,
    attributeLabel: row.definition.attribute ? localize(`WITCHER.Attributes.${row.definition.attribute}.Short`) : localize("WITCHER.Professions.Passive"),
    progress: Array.from({ length: 10 }, (_, i) => ({ filled: i < row.level, planned: i >= row.level && i < row.displayTarget }))
  })) : [];
  const profession = definition ? { name: definition.name, defining: nodes[0], branches: definition.branches.map((name, index) => ({
    name, entries: nodes.filter(node => node.branch === String(index))
  })) } : null;
  return { ...plan, rows, profession, isProfession: category === "profession", actorName: actor.name, editable: actor.isOwner, canTrain: Boolean(game.user?.isGM),
    changes: plan.changes.map(row => ({ ...row, calculation: `${row.steps.join(" + ")} = ${row.cost} ${t("Unit")}` })),
    error: plan.errors.length ? t(plan.errors[0]) : "",
    categories: Object.entries(categories).map(([id, icon]) => ({ id, icon, label: `WITCHER.Advancement.Categories.${id}`, active: id === category })),
    rules: t(category === "attributes" ? "AttributeRule" : category === "profession" ? "ProfessionRule" : "SkillRule") };
}

export class AdvancementWindow extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-advancement"],
    window: { title: "WITCHER.Advancement.Title", resizable: true, icon: "fa-solid fa-arrow-trend-up" },
    position: { width: 960, height: 780 },
    actions: {
      category: AdvancementWindow.#category,
      increase: AdvancementWindow.#change,
      decrease: AdvancementWindow.#change,
      reset: AdvancementWindow.#reset,
      purchase: AdvancementWindow.#purchase,
      savePoints: AdvancementWindow.#savePoints,
      training: AdvancementWindow.#training,
      viewSheetItem
    }
  };
  static PARTS = { content: { template: `systems/${SYSTEM_ID}/templates/advancement.hbs`, scrollable: [".witcher-advancement-list", ".witcher-advancement-cart"] } };

  constructor(actor) {
    super();
    this.actor = actor;
    this.selection = {};
    this.category = "skills";
    this.query = "";
    this.snapshot = advancementFingerprint(actor);
    this.hooks = ["updateActor", "createItem", "updateItem", "deleteItem"].map(name => [name, Hooks.on(name, document => {
      if ((document.uuid === actor.uuid || document.parent?.uuid === actor.uuid) && !this.busy) this.render({ force: true });
    })]);
  }

  async _prepareContext() {
    const snapshot = advancementFingerprint(this.actor);
    if (snapshot !== this.snapshot) {
      if (Object.keys(this.selection).length) this.notice = t("Stale");
      this.selection = {};
      this.snapshot = snapshot;
    }
    return { ...advancementContext(this.actor, this.selection, this.category), query: this.query, notice: this.notice ?? "" };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const search = this.element.querySelector("[data-advancement-search]");
    const filter = () => {
      this.query = search.value;
      let count = 0;
      for (const row of this.element.querySelectorAll("[data-search]")) {
        const matches = row.dataset.search.includes(this.query.trim().toLocaleLowerCase());
        // Keep the profession's ancestors and connectors in place during a search.
        row.hidden = this.category !== "profession" && !matches;
        row.classList.toggle("search-muted", this.category === "profession" && !matches);
        if (matches) count++;
      }
      this.element.querySelector("[data-no-results]").hidden = count > 0 || (this.category === "profession" && !context.profession);
    };
    search.addEventListener("input", filter);
    filter();
    this.animateChanges(context);
  }

  animateChanges(context) {
    const nodes = [...this.element.querySelectorAll("[data-node-id]")];
    const unlocked = new Set(nodes.filter(node => !node.classList.contains("locked")).map(node => node.dataset.nodeId));
    if (!globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const animate = (element, frames, duration = 240) => element?.animate(frames, { duration, easing: "ease-out" });
      if (this.renderedCategory !== this.category) animate(this.element.querySelector(".witcher-advancement-list"),
        [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }]);
      for (const node of nodes) if (node.dataset.nodeId === this.changedEntry ||
        (this.renderedCategory === this.category && unlocked.has(node.dataset.nodeId) && !this.unlockedNodes.has(node.dataset.nodeId))) {
        animate(node, [{ boxShadow: "0 0 0 2px #bc974c, 0 0 22px #c4a15d80" }, { boxShadow: "0 2px 5px #39251612" }], 450);
      }
      if (this.lastPoints !== undefined && this.lastPoints !== context.points) animate(this.element.querySelector(".witcher-advancement-balance strong"),
        [{ transform: "scale(1.15)", color: "#fff" }, { transform: "scale(1)", color: "#ead19c" }], 360);
      if (this.purchaseSucceeded) animate(this.element.querySelector(".witcher-advancement-notice"),
        [{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], 360);
    }
    this.renderedCategory = this.category;
    this.unlockedNodes = unlocked;
    this.lastPoints = context.points;
    this.changedEntry = null;
    this.purchaseSucceeded = false;
  }

  async close(options) {
    if (this.busy) return this;
    for (const [name, id] of this.hooks) Hooks.off(name, id);
    windows.delete(this.actor.uuid);
    return super.close(options);
  }

  static #category(_event, button) {
    if (this.busy) return;
    this.category = button.dataset.category;
    this.query = "";
    return this.render({ force: true });
  }

  static #change(_event, button) {
    if (this.busy || !this.actor.isOwner) return;
    if (advancementFingerprint(this.actor) !== this.snapshot) return this.render({ force: true });
    const row = advancementContext(this.actor, this.selection, this.category).rows.find(row => row.id === button.dataset.entry);
    const increasing = button.dataset.action === "increase";
    if (!row || (increasing ? row.cannotIncrease : row.cannotDecrease)) return;
    const target = (this.selection[row.id] ?? row.base) + (increasing ? 1 : -1);
    if (target === row.base) delete this.selection[row.id];
    else this.selection[row.id] = target;
    this.changedEntry = row.id;
    this.notice = "";
    return this.render({ force: true });
  }

  static #reset() {
    if (this.busy) return;
    this.selection = {};
    this.notice = "";
    return this.render({ force: true });
  }

  async runWrite(callback) {
    if (this.busy || !this.actor.isOwner) return;
    this.busy = true;
    for (const control of this.element.querySelectorAll(".window-content button, .window-content input")) control.disabled = true;
    try { await callback(); }
    catch (error) { this.notice = error.message; ui.notifications.error(error.message); }
    finally { this.busy = false; await this.render({ force: true }); }
  }

  static async #purchase() {
    const plan = advancementPlan(this.actor, this.selection, key => game.i18n.localize(key));
    if (!plan.valid) return;
    return this.runWrite(async () => {
      const approved = await foundry.applications.api.DialogV2.confirm({
        window: { title: t("ConfirmTitle") }, modal: true,
        content: `<p>${game.i18n.format("WITCHER.Advancement.Confirm", { cost: plan.cost, remaining: plan.remaining })}</p><ul>${plan.changes.map(row => `<li>${escapeTooltip(row.name)}: ${row.level} → ${row.to} (${row.cost} ${t("Unit")})</li>`).join("")}</ul>`
      });
      if (!approved) return;
      await purchaseAdvancement(this.actor, { ...this.selection }, this.snapshot, key => game.i18n.localize(key));
      this.selection = {};
      this.snapshot = advancementFingerprint(this.actor);
      this.notice = game.i18n.format("WITCHER.Advancement.Purchased", { cost: plan.cost });
      this.purchaseSucceeded = true;
    });
  }

  static async #training() {
    if (this.busy || !game.user.isGM) return;
    await game.system.api.train({ student: this.actor });
  }

  static #savePoints() {
    const input = this.element.querySelector("[data-experience-value]");
    if (!input.reportValidity() || input.value.trim() === "") return;
    const points = Number(input.value);
    const expected = this.actor.system.experience ?? 0;
    return this.runWrite(async () => {
      await setExperience(this.actor, points, expected, key => game.i18n.localize(key));
      this.snapshot = advancementFingerprint(this.actor);
      this.notice = t("PointsSaved");
    });
  }
}

export async function openAdvancement() {
  try {
    let app = windows.get(this.actor.uuid);
    if (!app) { app = new AdvancementWindow(this.actor); windows.set(this.actor.uuid, app); }
    await app.render({ force: true });
    app.bringToFront();
  } catch (error) {
    console.error("Witcher | Advancement window", error);
    ui.notifications.error(error.message);
  }
}
