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
import { hasStunned, setStunned, STATUS_DEFINITIONS, DYING, DEAD } from "../combat/status-effects.mjs";
import { rollDeath } from "../combat/death-state.mjs";
import { SHEET_TABS, sheetPreferences, visibleSheetTabs, updateSheetPreferences, chooseVisibleTabs, reportPreferencesError } from "./sheet-preferences.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class WitcherActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "actor-sheet"],
    position: { width: 800, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      viewRace: WitcherActorSheet.#onViewReference,
      viewOrigin: WitcherActorSheet.#onViewReference,
      viewFamilyStatus: WitcherActorSheet.#onViewReference,
      viewFriend: WitcherActorSheet.#onViewReference,
      chooseReference: WitcherActorSheet.#onChooseReference,
      configureTabs: WitcherActorSheet.#onConfigureTabs,
      rollStun: WitcherActorSheet.#onRollStun,
      rollDeath: WitcherActorSheet.#onRollDeath,
      rollAttribute: WitcherActorSheet.#onRollAttribute,
      toggleLuck: WitcherActorSheet.#onLuck,
      resetLuck: WitcherActorSheet.#onLuck,
      toggleAttributes: WitcherActorSheet.#onToggleAttributes,
      addStunned: WitcherActorSheet.#onEffect,
      removeEffect: WitcherActorSheet.#onEffect,
      editPortrait: WitcherActorSheet.#onEditPortrait
    }
  };

  static PARTS = {
    content: {
      template: `systems/${SYSTEM_ID}/templates/actor-sheet.hbs`,
      scrollable: [".witcher-character-content[data-tab=main]", ".witcher-character-content[data-tab=effects]", ".witcher-biography[data-tab=biography]", ".witcher-biography[data-tab=family]", ".witcher-character-sidebar"]
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
    const section = (id, path, label, rows = 3) => ({
      id, path, label: `WITCHER.Sheet.${label}`, rows,
      value: foundry.utils.getProperty(this.actor.system, path), open: !preferences.collapsed?.[id]
    });
    return Object.assign(context, {
      editingAttributes: this.isEditable && this.#editingAttributes,
      canEditDeathPenalty: this.isEditable && game.user.isGM,
      stunned: hasStunned(this.actor),
      effects: await Promise.all(this.actor.effects.map(async effect => {
        const definition = Object.values(STATUS_DEFINITIONS).find(status => effect.statuses.has(status.id));
        return {
          id: effect.id, name: definition ? game.i18n.localize(definition.name) : effect.name,
          img: definition ? definition.img : effect.img, inactive: effect.disabled || effect.isSuppressed,
          canRemove: this.isEditable && (game.user.isGM || ![DYING, DEAD].some(status => effect.statuses.has(status))),
          description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
            definition ? game.i18n.localize(`${definition.name}Description`) : effect.description,
            { secrets: this.actor.isOwner, relativeTo: effect }
          )
        };
      })),
      stats: statisticsContext(this.actor.system, {
        localize: key => game.i18n.localize(key), format: (key, data) => game.i18n.format(key, data)
      }),
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
    for (const button of this.element.querySelectorAll("[data-action=viewRace], [data-action=viewOrigin], [data-action=viewFamilyStatus], [data-action=viewFriend], [data-action=showPortraitArtwork], [data-action=tab], [data-action=configureTabs]")) {
      button.disabled = false;
    }
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
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
    try { await rollStun(this.actor); }
    catch (error) {
      console.error(`${SYSTEM_ID} | Stun roll failed`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Statistics.RollError"));
    } finally { target.disabled = !this.isEditable || this.actor.system.statistics.stun === null; }
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

  static async #onEffect(_event, target) {
    if (!this.isEditable || target.disabled) return;
    target.disabled = true;
    try {
      if (target.dataset.action === "addStunned") await setStunned(this.actor, true);
      else {
        const effect = this.actor.effects.get(target.dataset.effectId);
        if (effect && (game.user.isGM || ![DYING, DEAD].some(status => effect.statuses.has(status)))) await effect.delete();
      }
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
    if (!["race", "origin", "familyStatus", "influentialFriend"].includes(kind)) return;
    if (kind === "familyStatus" && this.actor.system.details.race === "witcher") return;
    const value = await chooseReference(kind, this.actor.system.details[kind], {
      isWitcher: this.actor.system.details.race === "witcher",
      initialGroup: ["familyStatus", "influentialFriend"].includes(kind) ? suggestedFamilyGroup(this.actor.system.details.race, this.actor.system.details.origin) : ""
    });
    if (kind === "familyStatus" && this.actor.system.details.race === "witcher") return;
    if (value !== null && this.isEditable) await this.actor.update({ [`system.details.${kind}`]: value });
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
