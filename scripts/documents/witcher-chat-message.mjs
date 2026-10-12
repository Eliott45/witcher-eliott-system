import { prepareMessageLuck, settleMessageLuck, releaseMessageLuck } from "../chat/luck-rolls.mjs";
import { prepareCriticalResult } from "../chat/critical-result.mjs";
import { prepareDeathResult } from "../chat/death-result.mjs";
import { prepareMagicResult } from "../chat/magic-result.mjs";
import { prepareMinimumResults } from "../dice/minimum-roll.mjs";

/** The async document lifecycle also covers native /roll and the chat dice tray. */
export class WitcherChatMessage extends foundry.documents.ChatMessage {
  async _preCreate(data, options, user) {
    if (await super._preCreate(data, options, user) === false) return false;
    await prepareMessageLuck(this, options.witcherLuckOperation);
    prepareMinimumResults(this);
    prepareCriticalResult(this);
    prepareDeathResult(this);
    prepareMagicResult(this);
  }

  static async createDocuments(data = [], operation = {}) {
    const id = foundry.utils.randomID();
    try {
      const messages = await super.createDocuments(data, { ...operation, witcherLuckOperation: id });
      await settleMessageLuck(messages, id);
      return messages;
    } finally { releaseMessageLuck(id); }
  }
}
