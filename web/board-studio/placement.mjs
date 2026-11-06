import { activeHole } from "./point-style.mjs";
import { fromTemplate } from "./stations.mjs";
import { symbolCenters, symbolNormal } from "./geometry.mjs";
import { ledPositions, ledFor } from "./led-layout.mjs";
import { bindPoint } from "./bindings.mjs";
const clone = (x) => structuredClone(x);
export const turnAngle = (a) => ((a % 360) + 360) % 360;
const rotate = (p, a) => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const key = (l) => (l ? `${l.segmentId}|${l.id ?? l.ledId}` : "");
export const ledKey = key;
export function placementTemplate(
  input,
  { mode = "normal", rotation = 0 } = {},
) {
  const t = clone(input);
  if (mode !== "normal") {
    if (t.appearance.points !== 2) {
      t.appearance.points = 2;
      t.appearance.pointSpacing = 10;
      t.appearance.splitBias = 0;
      t.holeOffsets = [
        { x: -5, y: 0 },
        { x: 5, y: 0 },
      ];
      t.ringOffsets = [
        { x: -5, y: 0 },
        { x: 5, y: 0 },
      ];
      t.appearance.symbolAngle = 0;
    }
    t.appearance.symbolKind =
      mode === "double" ? "double-strip" : "cross-strip";
    if (t.appearance.capsuleType === "none")
      t.appearance.capsuleType = "stadium";
  }
  const s = fromTemplate(t, { x: 0, y: 0 }, "template-frame"),
    p = { layout: { stations: [s], routes: [] } };
  const angle = (rotation * Math.PI) / 180;
  t.ringOffsets = symbolCenters(p, s).map((c) => rotate(c, angle));
  t.holeOffsets = t.holeOffsets.map((h) => ({ ...h, ...rotate(h, angle) }));
  const n = symbolNormal(p, s);
  t.appearance.symbolAngle =
    s.points === 1
      ? rotation === 0
        ? s.symbolAngle
        : turnAngle((s.symbolAngle ?? 0) + rotation)
      : turnAngle((Math.atan2(n.y, n.x) * 180) / Math.PI + rotation);
  return t;
}
export function nearbyLeds(
  p,
  point,
  zoom,
  { tolerancePx = 12, excludeSegment = null } = {},
) {
  return p.ledLayout.segments
    .filter((s) => s.id !== excludeSegment)
    .flatMap((segment) =>
      ledPositions(p, segment).map((led) => ({
        ...led,
        segmentName: segment.name,
        distancePx: Math.hypot(point.x - led.x, point.y - led.y) * zoom,
        occupied: p.ledLayout.bindings
          .filter((b) => b.segmentId === segment.id && b.ledId === led.id)
          .map((b) => ({ stationId: b.stationId, pointIndex: b.pointIndex })),
      })),
    )
    .filter((l) => l.distancePx <= tolerancePx)
    .sort(
      (a, b) => a.distancePx - b.distancePx || key(a).localeCompare(key(b)),
    );
}
export function stationPlacement(
  p,
  {
    template,
    id,
    point,
    freePoint = point,
    rotation = 0,
    mode = "normal",
    anchorIndex = null,
    snapIndex = 0,
    snap = "bind",
    zoom = 1,
    first = null,
    preferredLed = null,
    suspended = false,
  } = {},
) {
  if (!template || !id || !point)
    throw Error("Plasseringen mangler symbol, ID eller millimeterposisjon.");
  const t = placementTemplate(template, { mode, rotation }),
    pair = mode !== "normal";
  let s = fromTemplate(t, freePoint, id),
    q = clone(p),
    stage = pair ? (first ? "second" : "first") : "single",
    reason = "",
    action = null;
  const raw = fromTemplate(t, point, id),
    index = Math.min(anchorIndex ?? snapIndex, s.points - 1),
    rawCenters = symbolCenters(
      { layout: { stations: [raw], routes: [] } },
      raw,
    );
  // Explicit point anchor stays under the pointer through rotations. Centre anchor
  // preserves legacy centre placement; LED snapping searches the active ring.
  const anchor = pair ? 0 : anchorIndex;
  if (anchor !== null) {
    const c = symbolCenters({ layout: { stations: [s], routes: [] } }, s)[
      anchor
    ];
    const dx = freePoint.x - c.x,
      dy = freePoint.y - c.y;
    s.x += dx;
    s.y += dy;
    s.ringCenters = symbolCenters(
      { layout: { stations: [s], routes: [] } },
      fromTemplate(t, freePoint, id),
    ).map((c) => ({ x: c.x + dx, y: c.y + dy }));
    for (const h of s.holes) {
      h.x += dx;
      h.y += dy;
    }
  }
  const search = anchor !== null || first ? point : rawCenters[index];
  const candidates =
    snap !== "off" && !suspended
      ? nearbyLeds(p, search, zoom, { excludeSegment: first?.segmentId })
      : [];
  const eligible = candidates.filter(
    (l) => !l.occupied.length || snap === "align",
  );
  let target = preferredLed
    ? eligible.find((l) => key(l) === preferredLed)
    : eligible[0];
  if (preferredLed && !target)
    reason = "Valgt LED er ikke lenger tilgjengelig her.";
  const ambiguous =
    !preferredLed &&
    eligible.length > 1 &&
    eligible[1].segmentId !== eligible[0].segmentId &&
    Math.abs(eligible[1].distancePx - eligible[0].distancePx) < 2;
  if (ambiguous) {
    reason = "Flere LED-er ligger tett. Velg stripe og indeks i LED-listen.";
    target = null;
  }
  if (
    !target &&
    !reason &&
    candidates.some((l) => l.occupied.length) &&
    snap !== "align"
  )
    reason = "LED-en er allerede i bruk. Velg en ledig LED.";
  const targets = [];
  const push = (led) => targets.push({ ...led, occupied: led.occupied ?? [] });
  if (first) {
    const a = ledFor(p, first.segmentId, first.ledId ?? first.id);
    if (!a) reason = "Første LED er fjernet. Avbryt og velg på nytt.";
    else {
      push({
        ...a,
        segmentName: p.ledLayout.segments.find((s) => s.id === a.segmentId)
          ?.name,
      });
      const b = target ?? point,
        span = Math.hypot(a.x - b.x, a.y - b.y);
      s.x = (a.x + b.x) / 2;
      s.y = (a.y + b.y) / 2;
      s.splitBias = 0;
      s.pointSpacing = Math.max(0.1, span);
      s.symbolAngle = turnAngle(
        (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      );
      s.markerAngle = turnAngle(
        (s.markerAngle ?? 0) + rotation - (first.rotation ?? rotation),
      );
      s.ringCenters = [
        { x: a.x, y: a.y },
        { x: b.x, y: b.y },
      ];
      s.holes = s.holes.map((h, i) => ({ ...h, ...s.ringCenters[i] }));
      if (target) push(target);
      if (!target)
        reason ||= "Velg en ledig LED på en annen stripe for punkt B.";
      else action = "place";
    }
  } else if (target) {
    push(target);
    const c = symbolCenters({ layout: { stations: [s], routes: [] } }, s)[
        pair ? 0 : index
      ],
      dx = target.x - c.x,
      dy = target.y - c.y;
    const centers = symbolCenters({ layout: { stations: [s], routes: [] } }, s);
    s.x += dx;
    s.y += dy;
    s.ringCenters = centers.map((c) => ({ x: c.x + dx, y: c.y + dy }));
    for (const h of s.holes) {
      h.x += dx;
      h.y += dy;
    }
    action = pair ? "anchor" : "place";
  } else if (!pair && snap !== "required" && !reason) action = "place";
  else
    reason ||= candidates.some((c) => c.occupied.length)
      ? "LED-en er allerede i bruk. Velg en ledig LED."
      : pair
        ? "Velg en ledig LED på stripe A."
        : "Ingen ledig LED innenfor snap-avstanden.";
  q.layout.stations.push(s);
  if (action) {
    try {
      if (pair && first && targets.length === 2)
        for (let i = 0; i < 2; i++)
          q = bindPoint(q, {
            stationId: id,
            pointIndex: i,
            segmentId: targets[i].segmentId,
            ledId: targets[i].id,
          });
      else if (target && snap !== "align" && snap !== "off")
        q = bindPoint(q, {
          stationId: id,
          pointIndex: pair ? 0 : index,
          segmentId: target.segmentId,
          ledId: target.id,
        });
    } catch (e) {
      reason = e.message;
      action = null;
    }
  }
  s = q.layout.stations.find((s) => s.id === id);
  const centers = symbolCenters(q, s);
  if (
    centers.some(
      (c) =>
        c.x - s.ringOuter / 2 < 0 ||
        c.y - s.ringOuter / 2 < 0 ||
        c.x + s.ringOuter / 2 > p.board.width ||
        c.y + s.ringOuter / 2 > p.board.height,
    )
  ) {
    reason = "Symbolet ligger utenfor tavlen.";
    action = null;
  }
  if (
    ["rings", "holes", "capsules", "names", "routes"].some(
      (k) => p.layers[k].locked,
    )
  ) {
    reason = "Stasjons- eller hullaget er låst.";
    action = null;
  }
  return {
    project: q,
    station: s,
    targets,
    candidates,
    target,
    stage,
    action,
    valid: !!action,
    reason,
    free: !target && !first,
    allowOccupied: snap === "align" && !pair,
  };
}
// Direct-bound rings are mechanically fixed. Rotate only the outer marking;
// unbound symbols and holes rotate together around their explicit anchor.
export function rotateStation(p, id, degrees, { pointIndex = null } = {}) {
  const q = clone(p),
    s = q.layout.stations.find((s) => s.id === id);
  if (!s) throw Error("Velg en stasjon.");
  if (["rings", "capsules", "routes"].some((k) => q.layers[k].locked))
    throw Error("Grafikklaget er låst.");
  if (
    q.ledLayout.bindings.some((b) => b.stationId === id && b.mode === "direct")
  ) {
    s.markerAngle = turnAngle((s.markerAngle ?? 0) + degrees);
    if (s.points === 1)
      s.symbolAngle = turnAngle((s.symbolAngle ?? 0) + degrees);
  } else {
    const originalCenter = { x: s.x, y: s.y };
    const centers = symbolCenters(q, s),
      pivot = pointIndex === null ? s : centers[pointIndex];
    if (!pivot) throw Error("Velg et gyldig ankerpunkt.");
    s.ringCenters = centers.map((c) => {
      const v = rotate(
        { x: c.x - pivot.x, y: c.y - pivot.y },
        (degrees * Math.PI) / 180,
      );
      return { x: pivot.x + v.x, y: pivot.y + v.y };
    });
    s.holes = s.holes.map((h) => {
      const v = rotate(
        { x: h.x - pivot.x, y: h.y - pivot.y },
        (degrees * Math.PI) / 180,
      );
      return { ...h, x: pivot.x + v.x, y: pivot.y + v.y };
    });
    const v = rotate(
      { x: s.x - pivot.x, y: s.y - pivot.y },
      (degrees * Math.PI) / 180,
    );
    s.x = pivot.x + v.x;
    s.y = pivot.y + v.y;
    s.label.dx += originalCenter.x - s.x;
    s.label.dy += originalCenter.y - s.y;
    s.symbolAngle = turnAngle(
      (s.symbolAngle ??
        (Math.atan2(
          symbolNormal(
            p,
            p.layout.stations.find((s) => s.id === id),
          ).y,
          symbolNormal(
            p,
            p.layout.stations.find((s) => s.id === id),
          ).x,
        ) *
          180) /
          Math.PI) + degrees,
    );
  }
  return q;
}
export function moveBoundPair(p, id, firstLed, zoom = 1) {
  const s = p.layout.stations.find((s) => s.id === id),
    a = s?.holes[0],
    b = s?.holes[1];
  if (!s || s.points !== 2 || !firstLed)
    throw Error("Velg en dobbelstasjon med to LED-punkter.");
  const firstBinding = p.ledLayout.bindings.find(
    (b) => b.stationId === id && b.pointIndex === 0,
  );
  const secondBinding = p.ledLayout.bindings.find(
    (b) => b.stationId === id && b.pointIndex === 1,
  );
  if (!firstBinding || !secondBinding)
    throw Error("Begge punktene må være bundet for samlet LED-flytting.");
  if (firstLed.segmentId !== firstBinding.segmentId)
    throw Error(
      "Samlet flytting beholder stripe A og B. Velg A/B for å bytte stripe individuelt.",
    );
  const search = { x: b.x + firstLed.x - a.x, y: b.y + firstLed.y - a.y };
  const candidates = nearbyLeds(p, search, zoom, {
    excludeSegment: firstLed.segmentId,
  }).filter(
    (l) =>
      l.segmentId === secondBinding.segmentId &&
      l.occupied.every((o) => o.stationId === id),
  );
  if (!candidates.length)
    throw Error(
      "Ingen tilsvarende ledig LED på stripe B. Velg A eller B for individuell endring.",
    );
  if (firstLed.occupied?.some((o) => o.stationId !== id))
    throw Error("LED-en er allerede i bruk.");
  let q = bindPoint(p, {
    stationId: id,
    pointIndex: 0,
    segmentId: firstLed.segmentId,
    ledId: firstLed.id,
  });
  q = bindPoint(q, {
    stationId: id,
    pointIndex: 1,
    segmentId: candidates[0].segmentId,
    ledId: candidates[0].id,
  });
  return q;
}

export function rotationChanges(before, after) {
  const rows = [],
    stations = new Map(after.layout.stations.map((s) => [s.id, s]));
  for (const old of before.layout.stations) {
    const next = stations.get(old.id);
    if (!next) continue;
    for (let i = 0; i < old.holes.length; i++) {
      if (
        before.ledLayout.bindings.some(
          (b) => b.stationId === old.id && b.pointIndex === i,
        )
      )
        continue;
      const a = old.holes[i],
        b = next.holes[i];
      if (!activeHole(a) && !activeHole(b)) continue;
      if (b && Math.hypot(a.x - b.x, a.y - b.y) > 1e-8)
        rows.push({
          stationId: old.id,
          pointIndex: i,
          name: next.name,
          holeBefore: { x: a.x, y: a.y },
          holeAfter: { x: b.x, y: b.y },
        });
    }
  }
  return rows;
}
