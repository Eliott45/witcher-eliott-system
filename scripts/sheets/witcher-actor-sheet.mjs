import { workshopActorContext, workshopActorActions } from "./workshop-actor-context.mjs";
import { getProfession as selectionProfession } from "../data/professions.mjs";
import { inventoryContext, bindInventory, equipItem, createInventoryItem, browseEquipment, addCatalogItem, changeInventoryQuantity, toggleCarried, toggleInventoryGroup } from "./inventory-context.mjs";
import { lifepathContext, editWitcherPath, editDecade, removeDecade, rollDecade, editLifeEvent, removeLifeEvent, rollLifeEvent } from "./lifepath-context.mjs";
import { professionContext, setProfessionLevel, rollProfessionAbility, professionSelectionUpdate } from "./profession-context.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { getRace } from "../data/races.mjs";
import { getOrigin } from "../data/origins.mjs";
import { raceUuid, originUuid, familyStatusUuid, influentialFriendUuid } from "../data/compendiums.mjs";
import { getFamilyStatus, suggestedFamilyGroup } from "../data/family-statuses.mjs";
import { getInfluentialFriend } from "../data/influential-friends.mjs";
import { chooseReference } from "./reference-picker.mjs";
import { statisticsContext } from "./statistics-context.mjs";
import { rollStun } from "../combat/stun-roll.mjs";
import { rollAttribute } from "../combat/attribute-roll.mjs";
import { selectLuckPoints } from "../data/luck.mjs";
import { STATUS_DEFINITIONS, DYING, DEAD, EXHAUSTED_STUN, UNCONSCIOUS } from "../combat/status-effects.mjs";
import { conditionRules } from "../combat/condition-rules.mjs";
import { recoverStamina } from "../combat/exhaustion.mjs";
import { rollDeath } from "../combat/death-state.mjs";
import { rollSkill } from "../combat/skill-roll.mjs";
import { skillsContext } from "./skills-context.mjs";
import { abilitiesContext } from "./abilities-context.mjs";
import { hasAbility, adjustStubbornness } from "../data/abilities.mjs";
import { viewSheetItem, createAbility, browseAbilities, browseLanguages, removeSheetItem } from "./sheet-items.mjs";
import { addLanguageFromItem, updateLanguages } from "../data/languages.mjs";
import { SHEET_TABS, sheetPreferences, visibleSheetTabs, updateSheetPreferences, chooseVisibleTabs, reportPreferencesError } from "./sheet-preferences.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class WitcherActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "actor-sheet"],
    position: { width: 800, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      ...workshopActorActions,
      equipItem, createInventoryItem, browseEquipment, addCatalogItem,
      changeInventoryQuantity, toggleCarried, toggleInventoryGroup,
      editWitcherPath, editDecade, removeDecade, rollDecade, editLifeEvent, removeLifeEvent, rollLifeEvent,
      rollProfessionAbility,
      toggleProfession: WitcherActorSheet.#onToggleProfession,
      viewRace: WitcherActorSheet.#onViewReference,
      viewOrigin: WitcherActorSheet.#onViewReference,
      viewFamilyStatus: WitcherActorSheet.#onViewReference,
      viewFriend: WitcherActorSheet.#onViewReference,
      chooseReference: WitcherActorSheet.#onChooseReference,
      configureTabs: WitcherActorSheet.#onConfigureTabs,
      rollStun: WitcherActorSheet.#onRollStun,
      recoverStamina: WitcherActorSheet.#onRecoverStamina,
      rollDeath: WitcherActorSheet.#onRollDeath,
      rollAttribute: WitcherActorSheet.#onRollAttribute,
      rollSkill: WitcherActorSheet.#onRollSkill,
      toggleSkills: WitcherActorSheet.#onToggleSkills,
      toggleTrust: WitcherActorSheet.#onTrust,
      stubbornness: WitcherActorSheet.#onStubbornness,
      addLanguage: WitcherActorSheet.#onAddLanguage,
      removeLanguage: WitcherActorSheet.#onRemoveLanguage,
      viewSheetItem, createAbility, browseAbilities, browseLanguages, removeSheetItem,
      toggleLuck: WitcherActorSheet.#onLuck,
      resetLuck: WitcherActorSheet.#onLuck,
      toggleAttributes: WitcherActorSheet.#onToggleAttributes,
      removeEffect: WitcherActorSheet.#onRemoveEffect,
      editPortrait: WitcherActorSheet.#onEditPortrait
    }
  };

  static PARTS = {
    content: {
      template: `systems/${SYSTEM_ID}/templates/actor-sheet.hbs`,
      scrollable: [".witcher-character-content[data-tab=main]", ".witcher-character-content[data-tab=skills]", ".witcher-character-content[data-tab=profession]", ".witcher-character-content[data-tab=inventory]", ".witcher-character-content[data-tab=actions]", ".witcher-character-content[data-tab=effects]", ".witcher-biography[data-tab=biography]", ".witcher-biography[data-tab=family]", ".witcher-character-sidebar"]
    }
  };

  static TABS = {
    character: {
      initial: "main",
      tabs: SHEET_TABS
    }
  };

  async _prepareContext(options) {
    const preferences = sheetPreferences(this.actor.uuid);
    const visible = visibleSheetTabs(preferences.hiddenTabs);
    if (!visible.some(tab => tab.id === this.tabGroups.character)) this.tabGroups.character = visible[0].id;
    const context = await super._prepareContext(options);
    const conditions = conditionRules(this.actor);
    const stats = statisticsContext(this.actor.system, {
      localize: key => game.i18n.localize(key), format: (key, data) => game.i18n.format(key, data)
    });
    for (const attribute of [...stats.attributes, stats.luck]) attribute.rollUnavailable = attribute.unset || !conditions.canAct;
    conditions.stunUnavailable = stats.stunUnavailable || !conditions.canStunSave;
    conditions.recoveryUnavailable = !conditions.canRecover || this.actor.system.statistics.recovery === null
      || this.actor.system.statistics.recovery <= 0 || this.actor.system.stamina.value >= this.actor.system.stamina.max;
    conditions.recoveryHint = game.i18n.format("WITCHER.Conditions.RecoverAmount", { value: this.actor.system.statistics.recovery ?? "—" });
    conditions.staminaHint = game.i18n.format(conditions.ready ? "WITCHER.Conditions.StaminaReady" : "WITCHER.Conditions.StaminaProgress",
      { current: this.actor.system.stamina.value, required: conditions.required, remaining: conditions.remaining });
    const section = (id, path, label, rows = 3) => ({
      id, path, label: `WITCHER.Sheet.${label}`, rows,
      value: foundry.utils.getProperty(this.actor.system, path), open: !preferences.collapsed?.[id]
    });
    return Object.assign(context, {
      conditions,
      lifepath: lifepathContext(this.actor),
      profession: professionContext(this.actor),
      editingProfession: this.isEditable && this.#editingProfession,
      skills: skillsContext(this.actor, {
        localize: key => game.i18n.localize(key), format: (key, values) => game.i18n.format(key, values)
      }, { query: this.#skillQuery, editing: this.isEditable && this.#editingSkills }),
      abilities: await abilitiesContext(this.actor),
      inventory: inventoryContext(this.actor, preferences),
      workshop: await workshopActorContext(this.actor),
      abilitiesOpen: !preferences.collapsed?.abilities,
      editingAttributes: this.isEditable && this.#editingAttributes,
      effects: await Promise.all(this.actor.effects.map(async effect => {
        const definition = Object.values(STATUS_DEFINITIONS).find(status => effect.statuses.has(status.id));
        return {
          id: effect.id, name: definition ? game.i18n.localize(definition.name) : effect.name,
          img: definition ? definition.img : effect.img, inactive: effect.disabled || effect.isSuppressed,
          canRemove: this.isEditable && (game.user.isGM || ![DYING, DEAD, EXHAUSTED_STUN, UNCONSCIOUS].some(status => effect.statuses.has(status))),
          description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            definition ? game.i18n.localize(`${definition.name}Description`) : effect.description,
            { secrets: this.actor.isOwner, relativeTo: effect }
          )
        };
      })),
      stats,
      visibleTabs: visible.map(tab => context.tabs[tab.id]),
      actor: this.actor,
      system: this.actor.system,
      selectedRace: getRace(this.actor.system.details.race),
      selectedOrigin: getOrigin(this.actor.system.details.origin),
      showFamilyStatus: this.actor.system.details.race !== "witcher",
      selectedFamilyStatus: getFamilyStatus(this.actor.system.details.familyStatus),
      selectedFriend: getInfluentialFriend(this.actor.system.details.influentialFriend),
      friendSectionOpen: !preferences.collapsed?.["influential-friend"],
      biographySections: [
        section("appearance", "biography.appearance", "Appearance"),
        section("personality", "biography.personality", "Personality"),
        section("allies", "biography.allies", "Allies"),
        section("enemies", "biography.enemies", "Enemies"),
        section("backstory", "biography.backstory", "Backstory", 5),
        section("session-notes", "biography.sessionNotes", "SessionNotes", 5)
      ],
      familySections: [
        section("family-history", "biography.family.history", "FamilyHistory", 5),
        section("parents", "biography.family.parents", "Parents", 5),
        section("siblings", "biography.family.siblings", "Siblings", 5)
      ],
      originExcluded: this.actor.system.details.race === "witcher" && Boolean(this.actor.system.details.origin),
      typeLabel: `TYPES.Actor.${this.actor.type}`
    });
  }

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    // Foundry disables every form button for observers, including read-only actions.
    for (const button of this.element.querySelectorAll("[data-action=viewRace], [data-action=viewOrigin], [data-action=viewFamilyStatus], [data-action=viewFriend], [data-action=showPortraitArtwork], [data-action=tab], [data-action=configureTabs], [data-action=viewSheetItem], [data-action=browseAbilities], [data-action=browseLanguages]")) {
      button.disabled = false;
    }
    for (const search of this.element.querySelectorAll("[data-skill-search], [data-inventory-search], [data-action=toggleInventoryGroup], [data-action=browseEquipment]")) search.disabled = false;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    bindInventory(this);
    for (const input of this.element.querySelectorAll("[data-profession-level]")) input.addEventListener("change", () => {
      if (this.isEditable && this.#editingProfession) setProfessionLevel(this.actor, input.dataset.professionLevel, input.value).catch(reportPreferencesError);
    });
    this.element.querySelector("[data-skill-search]").addEventListener("input", event => {
      this.#skillQuery = event.target.value;
      const query = this.#skillQuery.trim().toLocaleLowerCase();
      let matches = 0;
      for (const group of this.element.querySelectorAll("[data-skill-group]")) {
        let visible = 0;
        for (const row of group.querySelectorAll("[data-skill-name]")) {
          row.hidden = !row.dataset.skillName.toLocaleLowerCase().includes(query);
          if (!row.hidden) visible++;
        }
        group.hidden = !visible;
        matches += visible;
      }
      this.element.querySelector("[data-no-skills]").hidden = matches > 0;
    });
    for (const input of this.element.querySelectorAll("[data-language-field]")) input.addEventListener("change", () => {
      if (!this.isEditable || !this.#editingSkills) return;
      const { languageId, languageField } = input.dataset;
      const value = languageField === "level" ? Math.max(0, Math.trunc(Number(input.value) || 0)) : input.value.trim();
      if (languageField === "name" && !value) { input.value = this.actor.system.languages.find(entry => entry.id === languageId).name; return; }
      this.#languageWrites = updateLanguages(this.actor, entries => entries.map(entry => entry.id === languageId
        ? { ...entry, [languageField]: value } : entry)).catch(reportPreferencesError);
    });
    for (const details of this.element.querySelectorAll("details[data-biography-section]")) {
      let wasOpen = details.open;
      details.addEventListener("toggle", () => {
        if (wasOpen === details.open) return;
        wasOpen = details.open;
        updateSheetPreferences(this.actor.uuid, { collapsed: { [details.dataset.biographySection]: !details.open } })
          .catch(reportPreferencesError);
      });
    }
  }

  async _onDropItem(event, item) {
    if (!this.isEditable) return null;
    if (item.type === "profession") {
      if (!item.system.ruleId || !selectionProfession(item.system.ruleId)) return null;
      await this.actor.update(professionSelectionUpdate(this.actor, item.system.ruleId));
      return null;
    }
    if (item.type === "language") {
      const work = addLanguageFromItem(this.actor, item);
      this.#languageWrites = work.catch(() => {});
      try {
        if (!await work) ui.notifications.info(game.i18n.localize("WITCHER.Languages.Duplicate"));
      } catch (error) { reportPreferencesError(error); }
      return null;
    }
    if (item.type === "ability" && this.actor.uuid !== item.parent?.uuid && item.system.ruleId
      && hasAbility(this.actor, item.system.ruleId)) {
      ui.notifications.info(game.i18n.localize("WITCHER.Abilities.Duplicate"));
      return null;
    }
    return super._onDropItem(event, item);
  }

  #skillQuery = "";
  #editingSkills = false;
  #editingProfession = false;

  static async #onToggleProfession() {
    if (!this.isEditable) return;
    this.#editingProfession = !this.#editingProfession;
    await this.render({ force: true });
  }
  #languageWrites = Promise.resolve();

  static async #onToggleSkills() {
    if (!this.isEditable) return;
    await this.submit();
    await this.#languageWrites;
    this.#editingSkills = !this.#editingSkills;
    await this.render({ force: true });
  }

  static async #onRollSkill(_event, target) {
    if (!this.isEditable || target.disabled) return;
    target.disabled = true;
    try {
      await this.submit();
      await this.#languageWrites;
      await this.#luckWrites;
      await rollSkill(this.actor, target.dataset.skill, target.dataset.languageId);
    } catch (error) {
      console.error(`${SYSTEM_ID} | Skill roll failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Statistics.AttributeRollError"));
    } finally { target.disabled = !this.isEditable || !conditionRules(this.actor).canAct; }
  }

  static async #onTrust() {
    if (!this.isEditable || !hasAbility(this.actor, "human.trust")) return;
    await this.actor.update({ "system.abilityState.trustEnabled": !this.actor.system.abilityState.trustEnabled });
  }

  static async #onStubbornness(_event, target) {
    if (!this.isEditable) return;
    try { await adjustStubbornness(this.actor, Number(target.dataset.change)); }
    catch (error) {
      console.error(`${SYSTEM_ID} | Ability counter update failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Abilities.Error"));
    }
  }

  static async #onAddLanguage() {
    if (!this.isEditable) return;
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: "WITCHER.Skills.AddLanguage" },
      content: `<label>${game.i18n.localize("WITCHER.Skills.LanguageName")}<input name="languageName" type="text" required autofocus></label>`,
      ok: { label: "WITCHER.Skills.AddLanguage", callback: (_event, button) => button.form.elements.languageName.value.trim() },
      rejectClose: false
    });
    if (!name || !this.isEditable) return;
    this.#languageWrites = updateLanguages(this.actor, entries => [...entries, { id: foundry.utils.randomID(), name, level: 0 }]);
    await this.#languageWrites;
  }

  static async #onRemoveLanguage(_event, target) {
    if (!this.isEditable || !this.#editingSkills) return;
    this.#languageWrites = updateLanguages(this.actor, entries => entries.filter(entry => entry.id !== target.dataset.languageId));
    await this.#languageWrites;
  }

  static async #onConfigureTabs() {
    const hiddenTabs = await chooseVisibleTabs(this.actor.uuid);
    if (hiddenTabs === null) return;
    try {
      await updateSheetPreferences(this.actor.uuid, { hiddenTabs });
      await this.render({ force: true });
    } catch (error) { reportPreferencesError(error); }
  }

  static async #onRollStun(_event, target) {
    if (!this.isEditable || target.disabled) return;
    target.disabled = true;
    try { await this.submit(); await rollStun(this.actor); }
    catch (error) {
      console.error(`${SYSTEM_ID} | Stun roll failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Statistics.RollError"));
    } finally { target.disabled = !this.isEditable || this.actor.system.statistics.stun === null || !conditionRules(this.actor).canStunSave; }
  }

  static async #onRecoverStamina(_event, target) {
    if (!this.isEditable || target.disabled) return;
    target.disabled = true;
    try { await this.submit(); await recoverStamina(this.actor); }
    catch (error) {
      console.error(`${SYSTEM_ID} | Recovery failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Conditions.RecoveryError"));
    } finally { target.disabled = !this.isEditable || !conditionRules(this.actor).canRecover; }
  }

  static async #onRollAttribute(_event, target) {
    if (!this.isEditable || target.disabled) return;
    target.disabled = true;
    try { await rollAttribute(this.actor, target.dataset.attribute); }
    catch (error) {
      console.error(`${SYSTEM_ID} | Attribute roll failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Statistics.AttributeRollError"));
    } finally { target.disabled = !this.isEditable; }
  }

  static async #onRollDeath(_event, target) {
    if (!this.isEditable || target.disabled) return;
    target.disabled = true;
    try {
      await this.submit();
      await this.#luckWrites;
      await rollDeath(this.actor);
    } catch (error) {
      console.error(`${SYSTEM_ID} | Death save failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Death.RollError"));
    } finally { target.disabled = !this.isEditable || !this.actor.system.statistics.dying; }
  }

  #editingAttributes = false;
  #luckWrites = Promise.resolve();

  static async #onToggleAttributes() {
    if (!this.isEditable) return;
    // Commit any focused base input before replacing the form with read-only totals.
    await this.submit();
    this.#editingAttributes = !this.#editingAttributes;
    await this.render({ force: true });
  }

  static async #onLuck(_event, target) {
    if (!this.isEditable) return;
    const number = Number(target.dataset.point);
    const reset = target.dataset.action === "resetLuck";
    const work = this.#luckWrites.then(async () => {
      if (!this.isEditable) return;
      const { statistics, luckSpent, luckPending } = this.actor.system;
      const pending = reset ? 0 : selectLuckPoints(statistics.effective.luck, luckSpent, luckPending, number);
      if (pending !== null) await this.actor.update({ "system.luckPending": pending, ...(reset ? { "system.luckSpent": [] } : {}) });
    });
    this.#luckWrites = work.catch(() => {});
    try { await work; }
    catch (error) {
      console.error(`${SYSTEM_ID} | Luck update failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Luck.UpdateError"));
    }
  }

  static async #onRemoveEffect(_event, target) {
    if (!this.isEditable || target.disabled) return;
    target.disabled = true;
    try {
      const effect = this.actor.effects.get(target.dataset.effectId);
      if (effect && (game.user.isGM || ![DYING, DEAD, EXHAUSTED_STUN, UNCONSCIOUS].some(status => effect.statuses.has(status)))) await effect.delete();
    } catch (error) {
      console.error(`${SYSTEM_ID} | Effect action failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Effects.UpdateError"));
    } finally { target.disabled = !this.isEditable; }
  }

  static async #onViewReference(_event, target) {
    const action = target?.dataset.action ?? "viewRace";
    if (action === "viewFamilyStatus" && this.actor.system.details.race === "witcher") return;
    const details = this.actor.system.details;
    const uuid = {
      viewRace: raceUuid(details.race), viewOrigin: originUuid(details.origin),
      viewFamilyStatus: familyStatusUuid(details.familyStatus), viewFriend: influentialFriendUuid(details.influentialFriend)
    }[action];
    if (!uuid) return;
    try {
      const reference = await foundry.utils.fromUuid(uuid);
      if (!reference) throw new Error(`Missing reference document: ${uuid}`);
      await reference.sheet.render({ force: true });
    } catch (error) {
      console.error(`${SYSTEM_ID} | Could not open reference`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Sheet.ReferenceUnavailable"));
    }
  }

  static async #onChooseReference(_event, target) {
    if (!this.isEditable) return;
    const kind = target.dataset.kind;
    if (!["race", "origin", "familyStatus", "influentialFriend", "profession"].includes(kind)) return;
    if (kind === "familyStatus" && this.actor.system.details.race === "witcher") return;
    const value = await chooseReference(kind, this.actor.system.details[kind], {
      isWitcher: this.actor.system.details.race === "witcher",
      initialGroup: ["familyStatus", "influentialFriend"].includes(kind) ? suggestedFamilyGroup(this.actor.system.details.race, this.actor.system.details.origin) : ""
    });
    if (kind === "familyStatus" && this.actor.system.details.race === "witcher") return;
    if (value !== null && this.isEditable) await this.actor.update(kind === "profession" ? professionSelectionUpdate(this.actor, value) : { [`system.details.${kind}`]: value });
  }

  static async #onEditPortrait() {
    if (!this.isEditable) return;
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.actor.img,
      document: this.actor,
      callback: path => this.actor.update({ img: path })
    });
    await picker.browse();
  }
}
