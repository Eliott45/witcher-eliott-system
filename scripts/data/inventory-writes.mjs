const queues = new WeakMap();

/** Serialize inventory changes across catalog, equipment and workshop windows. */
export function inventoryWrite(actor, operation) {
  const work = (queues.get(actor) ?? Promise.resolve()).then(() => actor.isOwner ? operation() : undefined);
  queues.set(actor, work.catch(() => {}));
  return work;
}
