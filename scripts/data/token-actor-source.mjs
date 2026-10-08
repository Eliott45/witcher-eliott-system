/** Read a neighbour without materializing its lazy ActorDelta during another actor's prepareData. */
export function tokenActorSource(token) {
  if (!token?.toObject) return token?.actor ?? null;
  const base = token.baseActor;
  if (!base) return null;
  if (token.actorLink) return base;
  // TokenDocument.toObject() materializes its lazy delta in v14, even with source=true.
  // Foundry keeps _source.delta linked to the delta source after every embedded update.
  const delta = token._source?.delta ?? {}, source = base.toObject();
  const merge = (a, b) => {
    for (const [key, value] of Object.entries(b ?? {})) {
      if (value && typeof value === "object" && !Array.isArray(value)) a[key] = merge(a[key] && typeof a[key] === "object" ? a[key] : {}, value);
      else a[key] = value;
    }
    return a;
  };
  // Foundry ActorDelta embedded records replace the matching base record; tombstones remove it.
  for (const key of ["items", "effects"]) {
    const changes = delta[key] ?? [], ids = new Set(changes.map(row => row._id));
    source[key] = [...changes.filter(row => !row._tombstone), ...(source[key] ?? []).filter(row => !ids.has(row._id))];
  }
  const {items, effects, ...fields} = delta;
  const result = merge(source, fields);
  result.id = base.id; result.uuid = `${token.uuid}.Actor.${base.id}`;
  result.effects = result.effects.map(effect => ({...effect,statuses:new Set(effect.statuses ?? [])}));
  return result;
}
