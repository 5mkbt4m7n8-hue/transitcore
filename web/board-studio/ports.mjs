import { ringRadius, maxRingRadius } from "./point-style.mjs";
import {
  symbolCenters,
  symbolNormal,
  add,
  mul,
  length,
  sub,
} from "./geometry.mjs";
const directionName = (direction) =>
  [
    "høyre",
    "nedre høyre",
    "bunn",
    "nedre venstre",
    "venstre",
    "øvre venstre",
    "topp",
    "øvre høyre",
  ][(Math.round(Math.atan2(direction.y, direction.x) / (Math.PI / 4)) + 8) % 8];
// Stable local keys follow symbol rotation. Only geometry is derived; identities
// never contain screen coordinates, route order or a nearest-neighbour guess.
export function stationPorts(p, s) {
  const centers = symbolCenters(p, s),
    angle = ((s.symbolAngle ?? 0) * Math.PI) / 180,
    n =
      s.points === 1
        ? { x: -Math.sin(angle), y: Math.cos(angle) }
        : symbolNormal(p, s),
    t = { x: n.y, y: -n.x },
    directions = { right: t, left: mul(t, -1), top: mul(n, -1), bottom: n },
    radius = maxRingRadius(s);
  const ports = centers.flatMap((center, index) =>
    Object.entries(directions).map(([side, direction]) => ({
      id: `point:${index}:${side}`,
      label: `${String.fromCharCode(65 + index)} · ${directionName(direction)}`,
      center: { x: center.x, y: center.y },
      direction,
      width: 0,
      pointIndices: [index],
      point: add(center, mul(direction, ringRadius(s, index))),
      marker: add(center, mul(direction, ringRadius(s, index) + 2)),
    })),
  );
  if (centers.length > 1) {
    const a = centers[0],
      b = centers.at(-1),
      center = mul(add(a, b), 0.5);
    for (const side of ["right", "left"]) {
      const direction = directions[side];
      ports.push({
        id: `pair:${side}`,
        label: `Samlet ${directionName(direction)} · A–${String.fromCharCode(64 + centers.length)}`,
        center,
        direction,
        width: length(sub(b, a)) / 2,
        pointIndices: [0, centers.length - 1],
        point: add(center, mul(direction, radius)),
        marker: add(center, mul(direction, radius + 2)),
      });
    }
  }
  return ports;
}
export function stationPort(p, stationId, portId) {
  const s = p.layout.stations.find((s) => s.id === stationId);
  return s ? stationPorts(p, s).find((port) => port.id === portId) : null;
}
export function validatePorts(p) {
  for (const r of p.layout.routes) {
    if (
      r.curveStyle !== undefined &&
      !["straight", "rounded"].includes(r.curveStyle)
    )
      throw Error("Ugyldig kurvestil.");
    if (r.anchors === undefined) continue;
    if (!r.anchors || Array.isArray(r.anchors) || typeof r.anchors !== "object")
      throw Error("Ugyldige tilkoblingsporter.");
    for (const [edge, ends] of Object.entries(r.anchors)) {
      if (
        !/^\d+$/.test(edge) ||
        +edge >= r.stationIds.length - 1 ||
        !ends ||
        !["start", "end"].every(
          (key, j) =>
            typeof ends[key] === "string" &&
            stationPort(p, r.stationIds[+edge + j], ends[key]),
        )
      )
        throw Error(
          "En valgt tilkoblingsport finnes ikke. Behold punktantallet eller velg nye porter.",
        );
    }
  }
}
