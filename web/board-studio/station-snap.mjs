import { moveStations } from "./model.mjs";
import { symbolCenters } from "./geometry.mjs";
import { ledPositions } from "./led-layout.mjs";
import { bindPoint } from "./bindings.mjs";
export function nearestPhysicalLed(
  p,
  point,
  zoom,
  { enabled = true, tolerancePx = 12 } = {},
) {
  if (!enabled) return null;
  let best = null;
  for (const segment of p.ledLayout.segments)
    for (const led of ledPositions(p, segment)) {
      const distancePx = Math.hypot(point.x - led.x, point.y - led.y) * zoom;
      if (distancePx <= tolerancePx && (!best || distancePx < best.distancePx))
        best = {
          ...led,
          segmentName: segment.name,
          distancePx,
          occupied: p.ledLayout.bindings
            .filter((b) => b.segmentId === segment.id && b.ledId === led.id)
            .map((b) => ({ stationId: b.stationId, pointIndex: b.pointIndex })),
        };
    }
  return best;
}
export function movePoint(p, stationId, index, point) {
  const q = structuredClone(p),
    s = q.layout.stations.find((s) => s.id === stationId);
  if (!s || !s.holes[index]) throw Error("Velg et gyldig stasjonspunkt.");
  s.ringCenters ??= symbolCenters(q, s).map(({ x, y }) => ({ x, y }));
  s.ringCenters[index] = { x: point.x, y: point.y };
  Object.assign(s.holes[index], { x: point.x, y: point.y });
  const a = s.ringCenters[0],
    b = s.ringCenters.at(-1);
  s.x = (a.x + b.x) / 2;
  s.y = (a.y + b.y) / 2;
  s.splitBias = 0;
  if (s.points > 1)
    s.pointSpacing = Math.max(
      0.1,
      Math.hypot(a.x - b.x, a.y - b.y) / (s.points - 1),
    );
  return q;
}
export function snapStationPoint(
  p,
  stationId,
  pointIndex,
  led,
  { bind = true, share = false } = {},
) {
  if (!led) throw Error("Ingen fysisk LED er valgt.");
  const station = p.layout.stations.find((s) => s.id === stationId);
  if (!p.ledLayout.bindings.some((b) => b.stationId === stationId) && station) {
    const center = symbolCenters(p, station)[pointIndex];
    if (!center) throw Error("Velg et gyldig stasjonspunkt.");
    p = moveStations(p, [stationId], led.x - center.x, led.y - center.y);
  }
  if (bind)
    return bindPoint(p, {
      stationId,
      pointIndex,
      segmentId: led.segmentId,
      ledId: led.id,
      mode: "direct",
      share,
    });
  const binding = p.ledLayout.bindings.find(
    (b) => b.stationId === stationId && b.pointIndex === pointIndex,
  );
  if (
    binding?.mode === "direct" &&
    (binding.ledId !== led.id || binding.segmentId !== led.segmentId)
  )
    throw Error(
      "Punktet er bundet. Velg Fest og bind eller løsne bindingen først.",
    );
  if (["rings", "holes", "capsules", "names"].some((id) => p.layers[id].locked))
    throw Error("Berørte stasjonslag er låst.");
  return movePoint(p, stationId, pointIndex, led);
}
