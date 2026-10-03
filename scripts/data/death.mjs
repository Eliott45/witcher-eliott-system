/** A blank, newly created 0/0 sheet is not a dying character. */
export function dyingHealth(health) {
  return health.value <= 0 && (health.max > 0 || health.value < 0);
}

export function deathTarget(stun, penalty, luck = 0) {
  return stun - penalty + luck;
}
