import { isTransport } from "./transport.mjs";
/** Containment is a reference between sibling Items, never a second inventory. */
export const isContainer = item => item?.type === "equipment" && ["container", "transport"].includes(item.system.kind);
const collection = (item, items) => Array.from(items ?? item.actor?.items ?? []);

export function containerParent(item, items) {
  const all = collection(item, items), seen = new Set([item.id]);
  let id = item.system.containerId, parent = null;
  while (id) {
    const next = all.find(entry => entry.id === id);
    // Broken references and legacy cycles are displayed at the root, never hidden.
    if (!isContainer(next) || seen.has(id)) return null;
    parent ??= next;
    seen.add(id); id = next.system.containerId;
  }
  return parent;
}
export function canContain(item, parent, items) {
  if (!parent) return true;
  if (isTransport(item) || !isContainer(parent) || !item.id || parent.id === item.id) return false;
  const all = collection(item, items), seen = new Set([item.id]);
  let next = parent;
  while (next) {
    if (seen.has(next.id)) return false;
    seen.add(next.id);
    next = all.find(entry => entry.id === next.system.containerId);
  }
  return true;
}
export function isCarried(item, items) {
  const all = collection(item, items);
  let next = item;
  while (next) {
    if (isTransport(next) || next.system.carried === false || next.system.quantity === 0) return false;
    next = containerParent(next, all);
  }
  return true;
}
export function containerContents(container, items) {
  const all = collection(container, items);
  return all.filter(item => {
    let parent = containerParent(item, all);
    while (parent) {
      if (parent.id === container.id) return true;
      parent = containerParent(parent, all);
    }
    return false;
  });
}
