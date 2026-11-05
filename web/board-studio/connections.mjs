import { stationPort } from "./ports.mjs";
import { stationTangent } from "./geometry.mjs";
export const ROUTE_STYLE = [
  "tracks",
  "trackSpacing",
  "stroke",
  "transitionLength",
  "tension",
  "cornerRadius",
  "autoGrow",
  "curveStyle",
];
export const SINGLE_ROUTE_STYLE = {
  tracks: 1,
  trackSpacing: 10,
  stroke: 0.18,
  transitionLength: 12,
  tension: 0.5,
  cornerRadius: 8,
  autoGrow: 20,
  curveStyle: "rounded",
};
export function routeStyle(route) {
  return Object.fromEntries(
    ROUTE_STYLE.map((k) => [k, route[k] ?? SINGLE_ROUTE_STYLE[k]]),
  );
}
export function newConnection(p, stationIds, anchors = null) {
  return {
    id: crypto.randomUUID(),
    stationIds: [...stationIds],
    ...routeStyle(p.routeDefaults ?? SINGLE_ROUTE_STYLE),
    bends: {},
    controls: {},
    portSigns: {},
    ...(anchors ? { anchors: { 0: structuredClone(anchors) } } : {}),
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
      ...(r.anchors ? { anchors: {} } : {}),
    };
    for (let i = start; i < end; i++) {
      if (r.bends[i]) part.bends[i - start] = structuredClone(r.bends[i]);
      if (r.controls[i])
        part.controls[i - start] = structuredClone(r.controls[i]);
      if (r.anchors?.[i])
        part.anchors[i - start] = structuredClone(r.anchors[i]);
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
// Freeze the displayed local frame before attaching a route. Adding another
// branch must not rotate a previously selected port or a station's LED rings.
export function connectPorts(p, start, end, reconnect = null) {
  for (const ref of [start, end])
    if (!stationPort(p, ref.stationId, ref.portId))
      throw Error("Velg en gyldig tilkoblingsport.");
  const q = structuredClone(p);
  if (start.stationId === end.stationId)
    throw Error("Velg en port på en annen stasjon.");
  if (q.layers.routes.locked || q.layers.capsules.locked)
    throw Error("Trasélaget er låst.");
  q.layout.tangentHints ??= {};
  for (const ref of [start, end]) {
    const s = p.layout.stations.find((s) => s.id === ref.stationId);
    if (!s) throw Error("Stasjonen finnes ikke.");
    if (s.symbolAngle == null)
      q.layout.tangentHints[s.id] = { ...stationTangent(p, s) };
  }
  const anchors = { start: start.portId, end: end.portId };
  let r;
  if (reconnect) {
    r = q.layout.routes.find((r) => r.id === reconnect.routeId);
    const ids = r?.stationIds.slice(reconnect.edge, reconnect.edge + 2);
    if (!ids || ids[0] !== start.stationId || ids[1] !== end.stationId)
      throw Error(
        "Velg start og slutt på de samme stasjonene som forbindelsen.",
      );
    r.anchors ??= {};
    r.anchors[reconnect.edge] = anchors;
    delete r.bends[reconnect.edge];
    delete r.controls[reconnect.edge];
  } else {
    r = newConnection(q, [start.stationId, end.stationId], anchors);
    q.layout.routes.push(r);
  }
  return { project: q, routeId: r.id };
}
