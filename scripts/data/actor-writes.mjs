// One queue for level purchases and the existing language/profession editors.
const writes = new Map();
export const pendingActorWrite = actor => writes.get(actor.uuid) ?? Promise.resolve();
export function queueActorWrite(actor, callback) {
  const work = pendingActorWrite(actor).catch(() => {}).then(callback);
  writes.set(actor.uuid, work);
  const clear = () => { if (writes.get(actor.uuid) === work) writes.delete(actor.uuid); };
  work.then(clear, clear);
  return work;
}
