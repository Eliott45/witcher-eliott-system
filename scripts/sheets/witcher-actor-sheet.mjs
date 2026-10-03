import { SYSTEM_ID } from "../config.mjs";
import { getRace } from "../data/races.mjs";
import { getOrigin } from "../data/origins.mjs";
import { raceUuid, originUuid } from "../data/compendiums.mjs";
import { chooseReference } from "./reference-picker.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class WitcherActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "actor-sheet"],
    position: { width: 800, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      viewRace: WitcherActorSheet.#onViewReference,
      viewOrigin: WitcherActorSheet.#onViewReference,
      chooseReference: WitcherActorSheet.#onChooseReference,
      editPortrait: WitcherActorSheet.#onEditPortrait
    }
  };

  static PARTS = {
    content: {
      template: `systems/${SYSTEM_ID}/templates/actor-sheet.hbs`,
      scrollable: [".witcher-character-content[data-tab=main]", ".witcher-biography", ".witcher-character-sidebar"]
    }
  };

  static TABS = {
    character: {
      initial: "main",
      tabs: [
        { id: "main", label: "WITCHER.Sheet.Main", icon: "fa-solid fa-user" },
        { id: "biography", label: "WITCHER.Sheet.Biography", icon: "fa-solid fa-book-open" }
      ]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      actor: this.actor,
      system: this.actor.system,
      selectedRace: getRace(this.actor.system.details.race),
      selectedOrigin: getOrigin(this.actor.system.details.origin),
      originExcluded: this.actor.system.details.race === "witcher" && Boolean(this.actor.system.details.origin),
      typeLabel: `TYPES.Actor.${this.actor.type}`
    });
  }

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    // Foundry disables every form button for observers, including read-only actions.
    for (const button of this.element.querySelectorAll("[data-action=viewRace], [data-action=viewOrigin], [data-action=showPortraitArtwork], [data-action=tab]")) {
      button.disabled = false;
    }
  }

  static async #onViewReference(_event, target) {
    const uuid = target?.dataset.action === "viewOrigin"
      ? originUuid(this.actor.system.details.origin) : raceUuid(this.actor.system.details.race);
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
    if (!["race", "origin"].includes(kind)) return;
    const value = await chooseReference(kind, this.actor.system.details[kind], {
      isWitcher: this.actor.system.details.race === "witcher"
    });
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
