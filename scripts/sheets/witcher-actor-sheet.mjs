import { SYSTEM_ID } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;

export class WitcherActorSheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["witcher-eliott", "actor-sheet"],
    position: { width: 560, height: 640 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    content: {
      template: `systems/${SYSTEM_ID}/templates/actor-sheet.hbs`,
      scrollable: [""]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const token = this.token ?? this.actor.prototypeToken;
    return Object.assign(context, {
      actor: this.actor,
      system: this.actor.system,
      typeLabel: `TYPES.Actor.${this.actor.type}`,
      vision: token.sight,
      tokenAction: this.token ? "configureToken" : "configurePrototypeToken",
      tokenLabel: this.token ? "WITCHER.Sheet.SceneToken" : "WITCHER.Sheet.PrototypeToken"
    });
  }
}
