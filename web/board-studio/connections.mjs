import { stationTangent } from "./geometry.mjs";
export const ROUTE_STYLE = [
  "tracks",
  "trackSpacing",
  "stroke",
  "transitionLength",
  "tension",
  "cornerRadius",
  "autoGrow",
];
export const SINGLE_ROUTE_STYLE = {
  tracks: 1,
  trackSpacing: 10,
  stroke: 0.18,
  transitionLength: 12,
  tension: 0.5,
  cornerRadius: 8,
  autoGrow: 20,
};
export function routeStyle(route) {
  return Object.fromEntries(
    ROUTE_STYLE.map((k) => [k, route[k] ?? SINGLE_ROUTE_STYLE[k]]),
  );
}
export function newConnection(p, stationIds) {
  return {
    id: crypto.randomUUID(),
    stationIds: [...stationIds],
    ...routeStyle(p.routeDefaults ?? SINGLE_ROUTE_STYLE),
    bends: {},
    controls: {},
    portSigns: {},
  };
}
// Each component is an actual contiguous sequence. There is no invisible edge
// and no station filtering that could accidentally bridge a deleted gap.
export function splitConnection(p, routeId, removedEdge = null) {
  const q = structuredClone(p),
    index = q.layout.routes.findIndex((r) => r.id === routeId),
    r = q.layout.routes[index];
  if (
    !r ||
    (removedEdge !== null &&
      (!Number.isInteger(removedEdge) ||
        removedEdge < 0 ||
        removedEdge >= r.stationIds.length - 1))
  )
    throw Error("Velg en gyldig delstrekning.");
  if (q.layers.routes.locked || q.layers.capsules.locked)
    throw Error("Trasé- eller overgangslaget er låst.");
  const cut = removedEdge;
  {
    q.layout.tangentHints ??= {};
    for (const id of cut === null
      ? r.stationIds
      : r.stationIds.slice(cut, cut + 2)) {
      const s = p.layout.stations.find((s) => s.id === id);
      q.layout.tangentHints[id] = { ...stationTangent(p, s) };
    }
  }
  const ranges =
      cut === null
        ? r.stationIds.slice(0, -1).map((_, i) => [i, i + 1])
        : [
            [0, cut],
            [cut + 1, r.stationIds.length - 1],
          ],
    parts = [],
    map = new Map();
  for (const [start, end] of ranges) {
    if (end <= start) continue;
    const part = {
      ...structuredClone(r),
      id: parts.length ? crypto.randomUUID() : r.id,
      parentRouteId: r.parentRouteId ?? r.id,
      stationIds: r.stationIds.slice(start, end + 1),
      bends: {},
      controls: {},
    };
    for (let i = start; i < end; i++) {
      if (r.bends[i]) part.bends[i - start] = structuredClone(r.bends[i]);
      if (r.controls[i])
        part.controls[i - start] = structuredClone(r.controls[i]);
      map.set(i, { routeId: part.id, edge: i - start });
    }
    parts.push(part);
  }
  q.layout.routes.splice(index, 1, ...parts);
  q.layout.parallelConstraints = q.layout.parallelConstraints
    .filter((c) =>
      ["reference", "follower"].every(
        (key) => c[key].routeId !== routeId || map.has(c[key].edge),
      ),
    )
    .map((c) => {
      const next = structuredClone(c);
      for (const key of ["reference", "follower"])
        if (next[key].routeId === routeId)
          next[key] = { ...next[key], ...map.get(next[key].edge) };
      return next;
    });
  return { project: q, components: parts, edgeMap: map };
}
export const deleteConnection = (p, routeId, edge) =>
  splitConnection(p, routeId, edge).project;
