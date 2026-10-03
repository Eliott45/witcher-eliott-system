export const DICE_FACES = Object.freeze([4, 6, 10, 12, 20, 100]);
// Foundry permits at most 999 dice in one DiceTerm.
export const MAX_DICE = 999;

/** A local selection of dice; it never modifies the user's chat draft. */
export class DicePool {
  #counts = new Map(DICE_FACES.map(faces => [faces, 0]));
  busy = false;

  count(faces) {
    return this.#counts.get(faces) ?? 0;
  }

  set(faces, value) {
    if (this.busy || !this.#counts.has(faces)) return;
    const number = Number(value);
    this.#counts.set(faces, Number.isFinite(number) ? Math.max(0, Math.min(MAX_DICE, Math.trunc(number))) : 0);
  }

  clear() {
    if (this.busy) return;
    for (const faces of DICE_FACES) this.#counts.set(faces, 0);
  }

  get formula() {
    return DICE_FACES.filter(faces => this.count(faces)).map(faces => `${this.count(faces)}d${faces}`).join(" + ");
  }

  async roll(sendMessage) {
    if (this.busy || !this.formula) return;
    this.busy = true;
    try {
      // The native /r command preserves the speaker, message mode and module hooks.
      return await sendMessage(`/r ${this.formula}`);
    } finally {
      this.busy = false;
    }
  }
}
