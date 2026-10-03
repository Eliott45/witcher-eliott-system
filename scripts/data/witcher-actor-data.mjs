import { RACE_CHOICES } from "./races.mjs";
import { ORIGIN_CHOICES, getOriginBonus } from "./origins.mjs";
import { FAMILY_STATUS_CHOICES, getFamilyReward } from "./family-statuses.mjs";
import { INFLUENTIAL_FRIEND_CHOICES } from "./influential-friends.mjs";
import { ATTRIBUTE_KEYS, deriveStatistics } from "./statistics.mjs";
import { hasStatus, DYING, DEAD } from "../combat/status-effects.mjs";

/** Store base values; source bonuses and wound penalties are derived without stacking. */
export class WitcherActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { ArrayField, NumberField, SchemaField, StringField } = foundry.data.fields;
    const resource = (allowNegative = false) => new SchemaField({
      value: new NumberField({ required: true, nullable: false, integer: true, ...(allowNegative ? {} : { min: 0 }), initial: 0 }),
      max: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
    });

    return {
      // Null distinguishes an unfilled statistic from an explicitly entered zero on old actors.
      attributes: new SchemaField(Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key,
        new NumberField({ required: true, nullable: true, integer: true, min: 0, max: 100, initial: null })
      ]))),
      carriedWeight: new NumberField({ required: true, nullable: false, min: 0, initial: 0 }),
      luckSpent: new ArrayField(new NumberField({ required: true, nullable: false, integer: true, min: 1 })),
      luckPending: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      death: new SchemaField({
        penalty: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        episode: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        lastCombat: new StringField({ required: true, nullable: false, blank: true, initial: "" }),
        lastRound: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 })
      }),
      vigor: new NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
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
      health: resource(true),
      stamina: resource(),
      notes: new StringField({ required: true, nullable: false, initial: "" })
    };
  }

  get statistics() {
    const actor = this.parent;
    return deriveStatistics(this, actor?.effects ? { dying: hasStatus(actor, DYING), dead: hasStatus(actor, DEAD) } : {});
  }

  prepareDerivedData() {
    const statistics = this.statistics;
    // Keep legacy limits until BODY and WILL are entered. Never heal/refill on a stat change.
    if (statistics.healthMax !== null) this.health.max = statistics.healthMax;
    if (statistics.staminaMax !== null) this.stamina.max = statistics.staminaMax;
    this.health.value = Math.min(this.health.value, this.health.max);
    this.stamina.value = Math.min(this.stamina.value, this.stamina.max);
    // Inventory will supply this derived value when item weights are implemented.
    this.carriedWeight = 0;
  }

  get originBonusEligible() {
    return getOriginBonus(this.details.race, this.details.origin) !== null;
  }

  get familyRewardEligible() {
    return getFamilyReward(this.details.race, this.details.familyStatus) !== null;
  }
}
