export function luckPoints(maximum, spent = [], pending = 0) {
  const crossed = new Set(spent);
  let remaining = pending;
  return Array.from({ length: maximum ?? 0 }, (_, index) => {
    const number = index + 1;
    const used = crossed.has(number);
    return { number, spent: used, selected: !used && remaining-- > 0 };
  });
}

/** Select the available points up to the clicked number; clicking again cancels. */
export function selectLuckPoints(maximum, spent, pending, number) {
  const points = luckPoints(maximum, spent);
  if (!Number.isInteger(number) || !points[number - 1] || points[number - 1].spent) return null;
  const selected = points.filter(point => !point.spent && point.number <= number).length;
  return selected === pending ? 0 : selected;
}

export function selectedLuck(system) {
  return luckPoints(system.statistics.effective.luck, system.luckSpent, system.luckPending)
    .filter(point => point.selected).map(point => point.number);
}
