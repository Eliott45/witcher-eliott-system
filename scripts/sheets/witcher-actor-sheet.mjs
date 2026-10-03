import { SYSTEM_ID } from "../config.mjs";
import { getRace, RACES } from "../data/races.mjs";
import { raceUuid } from "../data/compendiums.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class WitcherActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "actor-sheet"],
    position: { width: 640, height: 450 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      viewRace: WitcherActorSheet.#onViewRace,
      editPortrait: WitcherActorSheet.#onEditPortrait
    }
  };

  static PARTS = {
    content: {
      template: `systems/${SYSTEM_ID}/templates/actor-sheet.hbs`,
      scrollable: [""]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, {
      actor: this.actor,
      system: this.actor.system,
      selectedRace: getRace(this.actor.system.details.race),
      raceChoices: RACES.map(race => ({
        id: race.id, label: race.label, selected: race.id === this.actor.system.details.race
      })),
      typeLabel: `TYPES.Actor.${this.actor.type}`
    });
  }

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    // Foundry disables every form button for observers, including read-only actions.
    for (const button of this.element.querySelectorAll("[data-action=viewRace], [data-action=showPortraitArtwork]")) {
      button.disabled = false;
    }
  }

  static async #onViewRace() {
    const uuid = raceUuid(this.actor.system.details.race);
    if (!uuid) return;
    try {
      const race = await foundry.utils.fromUuid(uuid);
      if (!race) throw new Error(`Missing race document: ${uuid}`);
      await race.sheet.render({ force: true });
    } catch (error) {
      console.error(`${SYSTEM_ID} | Could not open race`, error);
      ui.notifications.error(game.i18n.localize("WITCHER.Sheet.RaceUnavailable"));
    }
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
