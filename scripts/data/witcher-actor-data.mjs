import { RACE_CHOICES } from "./races.mjs";
import { ORIGIN_CHOICES, getOriginBonus } from "./origins.mjs";
import { FAMILY_STATUS_CHOICES, getFamilyReward } from "./family-statuses.mjs";
import { INFLUENTIAL_FRIEND_CHOICES } from "./influential-friends.mjs";

/** Identity and manually entered resources. Racial abilities do not apply effects yet. */
export class WitcherActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { NumberField, SchemaField, StringField } = foundry.data.fields;
    const resource = () => new SchemaField({
      value: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
    });

    return {
      details: new SchemaField({
        age: new NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null }),
        gender: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        race: new StringField({ required: true, nullable: false, blank: true, choices: RACE_CHOICES, initial: "" }),
        origin: new StringField({ required: true, nullable: false, blank: true, choices: ORIGIN_CHOICES, initial: "" }),
        familyStatus: new StringField({ required: true, nullable: false, blank: true, choices: FAMILY_STATUS_CHOICES, initial: "" }),
        influentialFriend: new StringField({ required: true, nullable: false, blank: true, choices: INFLUENTIAL_FRIEND_CHOICES, initial: "" })
      }),
      biography: new SchemaField({
        appearance: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        personality: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        allies: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        enemies: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        family: new SchemaField({
          history: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
          parents: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
          siblings: new StringField({ required: true, nullable: false, blank: true, initial: "" })
        }),
        backstory: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        sessionNotes: new StringField({ required: true, nullable: false, blank: true, initial: "" })
      }),
      health: resource(),
      stamina: resource(),
      notes: new StringField({ required: true, nullable: false, initial: "" })
    };
  }

  get originBonusEligible() {
    return getOriginBonus(this.details.race, this.details.origin) !== null;
  }

  get familyRewardEligible() {
    return getFamilyReward(this.details.race, this.details.familyStatus) !== null;
  }
}
