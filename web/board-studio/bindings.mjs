import { pointStyle, activeHole } from "./point-style.mjs";
import {
  mechanicalSettings,
  mountingIssues,
  mountChanges,
} from "./mounting.mjs";
import { symbolCenters, holeCenters } from "./geometry.mjs";
import { ledFor, ledPositions, segmentCorners } from "./led-layout.mjs";
const distance = (a, b) =>
  a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
export function validateBindings(p) {
  const points = new Set(),
    leds = new Map(),
    ids = new Set();
  for (const b of p.ledLayout.bindings) {
    const s = p.layout.stations.find((s) => s.id === b.stationId);
    if (
      typeof b.id !== "string" ||
      ids.has(b.id) ||
      !s ||
      !Number.isInteger(b.pointIndex) ||
      b.pointIndex < 0 ||
      b.pointIndex >= s.points ||
      typeof b.segmentId !== "string" ||
      typeof b.ledId !== "string" ||
      !["direct", "lightguide"].includes(b.mode) ||
      typeof b.shared !== "boolean"
    )
      throw Error("Ugyldig stasjons-/LED-binding.");
    const key = b.stationId + ":" + b.pointIndex;
    if (points.has(key))
      throw Error("Et stasjonspunkt kan bare ha én LED-binding.");
    points.add(key);
    ids.add(b.id);
    const physical = b.segmentId + ":" + b.ledId;
    if (!leds.has(physical)) leds.set(physical, []);
    leds.get(physical).push(b);
  }
  for (const group of leds.values())
    if (
      group.length > 1 &&
      group.some(
        (b) =>
          !b.shared || b.sharedGroup !== group[0].sharedGroup || !b.sharedGroup,
      )
    )
      throw Error("LED-deling krever et eksplisitt felles delingsvalg.");
  return p;
}
function ensureCentres(p, s) {
  s.ringCenters ??= symbolCenters(p, s).map(({ x, y }) => ({ x, y }));
  if (s.holes.length !== s.points)
    throw Error("Tilpass hull til symbolet før binding.");
}
function reanchor(s) {
  if (!s.ringCenters?.length) return;
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
}
export function bindPoint(
  p,
  { stationId, pointIndex, segmentId, ledId, mode = "direct", share = false },
) {
  const q = structuredClone(p),
    s = q.layout.stations.find((s) => s.id === stationId),
    led = ledFor(q, segmentId, ledId);
  if (
    !s ||
    !Number.isInteger(pointIndex) ||
    pointIndex < 0 ||
    pointIndex >= s.points ||
    !led
  )
    throw Error("LED-en eller stasjonspunktet finnes ikke.");
  if (
    q.layers.bindings?.locked ||
    q.layers.holes.locked ||
    q.layers.rings.locked
  )
    throw Error("Binding-, hull- eller ringlaget er låst.");
  ensureCentres(q, s);
  q.ledLayout.bindings = q.ledLayout.bindings.filter(
    (b) => !(b.stationId === stationId && b.pointIndex === pointIndex),
  );
  const used = q.ledLayout.bindings.filter(
    (b) => b.segmentId === segmentId && b.ledId === ledId,
  );
  if (used.length && !share)
    throw Error(
      "LED-en er allerede i bruk. Velg bevisst deling eller en annen LED.",
    );
  const sharedGroup = share ? `${segmentId}:${ledId}:shared` : undefined;
  if (share)
    for (const b of used) {
      b.shared = true;
      b.sharedGroup = sharedGroup;
    }
  q.ledLayout.bindings.push({
    id: crypto.randomUUID(),
    stationId,
    pointIndex,
    segmentId,
    ledId,
    mode,
    shared: share,
    ...(share ? { sharedGroup } : {}),
  });
  if (mode === "direct") {
    Object.assign(s.holes[pointIndex], { x: led.x, y: led.y, enabled: true });
    s.ringCenters[pointIndex] = { x: led.x, y: led.y };
    reanchor(s);
  }
  return validateBindings(q);
}
export function unbindPoint(p, stationId, pointIndex) {
  const q = structuredClone(p);
  if (q.layers.bindings.locked) throw Error("Bindinglaget er låst.");
  q.ledLayout.bindings = q.ledLayout.bindings.filter(
    (b) => !(b.stationId === stationId && b.pointIndex === pointIndex),
  );
  return q;
}
export function prepareBindings(old, next) {
  const q = structuredClone(next);
  validateBindings(q);
  for (const b of q.ledLayout.bindings) {
    const s = q.layout.stations.find((s) => s.id === b.stationId),
      led = ledFor(q, b.segmentId, b.ledId),
      oldStation = old.layout.stations.find((t) => t.id === s.id),
      previous =
        old.ledLayout.bindings.find((t) => t.id === b.id) ??
        old.ledLayout.bindings.find(
          (t) =>
            t.stationId === b.stationId &&
            oldStation?.pointIds[t.pointIndex] === s.pointIds[b.pointIndex],
        ),
      oldLed = previous && ledFor(old, previous.segmentId, previous.ledId);
    if (previous && oldLed && !led)
      throw Error("En bundet LED ville bli fjernet. Løsne bindingen først.");
    if (!led) continue;
    const changed =
      !previous || previous.id !== b.id || distance(oldLed, led) > 1e-8;
    if (b.mode === "direct") {
      ensureCentres(q, s);
      if (changed) {
        if (
          ["holes", "rings", "capsules", "names"].some(
            (id) => q.layers[id].locked,
          )
        )
          throw Error(
            "Lås opp hull- og grafikklag før bundne punkter flyttes.",
          );
        if (previous?.id === b.id && oldLed) {
          const oldHole = oldStation.holes[previous.pointIndex],
            oldRing = symbolCenters(old, oldStation)[previous.pointIndex];
          s.holes[b.pointIndex].x = led.x + oldHole.x - oldLed.x;
          s.holes[b.pointIndex].y = led.y + oldHole.y - oldLed.y;
          s.ringCenters[b.pointIndex] = {
            x: led.x + oldRing.x - oldLed.x,
            y: led.y + oldRing.y - oldLed.y,
          };
        } else {
          Object.assign(s.holes[b.pointIndex], {
            x: led.x,
            y: led.y,
            enabled: true,
          });
          s.ringCenters[b.pointIndex] = { x: led.x, y: led.y };
        }
        reanchor(s);
      }
    }
  }
  return q;
}
export function physicalChanges(old, next) {
  const rows = [];
  for (const beforeStation of old.layout.stations) {
    const afterStation = next.layout.stations.find(
      (s) => s.id === beforeStation.id,
    );
    const ids = new Set(
      [...beforeStation.holes, ...(afterStation?.holes ?? [])].map((h) => h.id),
    );
    for (const id of ids) {
      const i0 = beforeStation.holes.findIndex((h) => h.id === id),
        i1 = afterStation?.holes.findIndex((h) => h.id === id) ?? -1;
      const h0 = beforeStation.holes[i0],
        h1 = afterStation?.holes[i1],
        a = activeHole(h0),
        b = activeHole(h1),
        before = old.ledLayout.bindings.find(
          (t) => t.stationId === beforeStation.id && t.pointIndex === i0,
        ),
        after = next.ledLayout.bindings.find(
          (t) => t.stationId === beforeStation.id && t.pointIndex === i1,
        ),
        l0 = before && ledFor(old, before.segmentId, before.ledId),
        l1 = after && ledFor(next, after.segmentId, after.ledId),
        d0 = h0?.diameter ?? beforeStation.holeDiameter,
        d1 = h1?.diameter ?? afterStation?.holeDiameter;
      if (
        a !== b ||
        (a &&
          b &&
          (((before || after) && distance(h0, h1) > 1e-8) ||
            Math.abs(d0 - d1) > 1e-8)) ||
        (before && l0 && l1 && distance(l0, l1) > 1e-8)
      )
        rows.push({
          stationId: beforeStation.id,
          pointIndex: Math.max(0, i1 < 0 ? i0 : i1),
          name: afterStation?.name ?? beforeStation.name,
          holeBefore: a ? { x: h0.x, y: h0.y } : undefined,
          holeAfter: b ? { x: h1.x, y: h1.y } : undefined,
          ledBefore: l0 && { x: l0.x, y: l0.y },
          ledAfter: l1 && { x: l1.x, y: l1.y },
          diameterBefore: a ? d0 : undefined,
          diameterAfter: b ? d1 : undefined,
        });
    }
  }
  const profiles = next.ledLayout.profiles.filter((r) => {
    const previous = old.ledLayout.profiles.find((t) => t.id === r.id);
    return (
      previous &&
      (previous.pitch !== r.pitch || previous.firstOffset !== r.firstOffset)
    );
  });
  const boundKeys = new Set(
    [...old.ledLayout.bindings, ...next.ledLayout.bindings].map((b) => b.ledId),
  );
  for (const profile of profiles)
    for (const segment of next.ledLayout.segments.filter(
      (s) => s.profileId === profile.id,
    )) {
      const before = old.ledLayout.segments.find((s) => s.id === segment.id);
      if (!before) continue;
      const oldLeds = ledPositions(old, before);
      for (const l of ledPositions(next, segment)) {
        const previous = oldLeds.find((t) => t.id === l.id);
        if (previous && !boundKeys.has(l.id) && distance(previous, l) > 1e-8)
          rows.push({
            stationId: segment.id,
            pointIndex: l.slot,
            name: segment.name + " LED " + l.index,
            ledBefore: { x: previous.x, y: previous.y },
            ledAfter: { x: l.x, y: l.y },
          });
      }
    }
  return [...rows, ...mountChanges(old, next)];
}
export function bindingMarkup(p, esc) {
  return p.ledLayout.bindings
    .map((b) => {
      const s = p.layout.stations.find((s) => s.id === b.stationId),
        h = s?.holes[b.pointIndex],
        led = ledFor(p, b.segmentId, b.ledId);
      return led && h
        ? `<g data-binding="${esc(b.id)}"><path d="M ${led.x} ${led.y} L ${h.x} ${h.y}" stroke="${b.mode === "direct" ? "#679b60" : "#9a72a9"}" stroke-width=".3" stroke-dasharray="${b.mode === "direct" ? "none" : "1.5 1"}"/><circle cx="${h.x}" cy="${h.y}" r=".65" fill="none" stroke="#679b60" stroke-width=".2"/></g>`
        : "";
    })
    .join("");
}
export function mechanicalCheck(p) {
  let currentTarget = null;
  const settings = mechanicalSettings(p.production.mechanicalSettings);
  const issues = [],
    outside = (pt, r = 0) =>
      pt.x - r < 0 ||
      pt.y - r < 0 ||
      pt.x + r > p.board.width ||
      pt.y + r > p.board.height,
    add = (object, message, target = currentTarget) =>
      issues.push({ object, message, target: structuredClone(target) });
  const indexKeys = new Set();
  for (const profile of p.ledLayout.profiles) {
    currentTarget = { kind: "profile", id: profile.id };
    if (profile.firstOffset < profile.housingLength / 2)
      add(profile.name, "Første LED-hus går ut over stripeenden.");
    if (
      profile.width < profile.housingWidth ||
      profile.pitch < profile.housingLength
    )
      add(profile.name, "LED-hus passer ikke stripebredde/pitch.");
    if (
      profile.firstOffset +
        (profile.count - 1) * profile.pitch +
        profile.housingLength / 2 >
      profile.length
    )
      add(profile.name, "Profilens LED-er går ut over oppgitt striplengde.");
  }
  for (const s of p.ledLayout.segments) {
    currentTarget = { kind: "segment", id: s.id };
    const profile = p.ledLayout.profiles.find((r) => r.id === s.profileId);
    if (!profile) {
      add(s.name, "Stripeprofil mangler.");
      continue;
    }
    if (segmentCorners(p, s).some((pt) => outside(pt)))
      add(s.name, "Stripesegmentet stikker utenfor tavlen.");
    if (s.count > profile.count)
      add(s.name, "Segmentet bruker flere LED-er enn profilen.");
    for (const l of ledPositions(p, s)) {
      if (outside(l))
        add(`${s.name} LED ${l.index}`, "LED-senter utenfor tavlen.");
      const key = JSON.stringify([l.controllerId, l.chainId, l.index]);
      if (indexKeys.has(key))
        add(
          `${l.controllerId}/${l.chainId}/${l.index}`,
          "Duplisert LED-indeks i samme kjede.",
        );
      indexKeys.add(key);
    }
    if (
      profile.firstOffset +
        (s.count - 1) * profile.pitch +
        profile.housingLength / 2 >
      s.length
    )
      add(s.name, "LED-er får ikke plass innen segmentlengden.");
  }
  const holes = [];
  for (const s of p.layout.stations) {
    currentTarget = { kind: "station", id: s.id };
    if (s.holes.length !== s.points)
      add(s.name, "Antall hull og grafiske punkter er forskjellig.");
    for (let i = 0; i < s.holes.length; i++) {
      currentTarget = { kind: "station", id: s.id, pointIndex: i };
      const h = s.holes[i],
        diameter = h.diameter ?? s.holeDiameter;
      if (!activeHole(h)) continue;
      const style = pointStyle(s, i);
      if (outside(h, diameter / 2))
        add(`${s.name} punkt ${i + 1}`, "Hullet ligger utenfor platen.");
      if (diameter >= style.ringOuter - style.stroke * 2)
        add(
          `${s.name} punkt ${i + 1}`,
          "Hull og grafisk ring har inkompatible diametere.",
        );
      holes.push({
        s,
        i,
        h,
        diameter,
        b: p.ledLayout.bindings.find(
          (b) => b.stationId === s.id && b.pointIndex === i,
        ),
      });
    }
  }
  for (let i = 0; i < holes.length; i++)
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i],
        b = holes[j],
        d = distance(a.h, b.h),
        shared =
          a.b?.shared &&
          b.b?.shared &&
          a.b.sharedGroup &&
          a.b.sharedGroup === b.b.sharedGroup &&
          Math.abs(a.diameter - b.diameter) < 1e-8 &&
          d < 1e-8;
      if (shared) continue;
      if (d + 1e-8 < (a.diameter + b.diameter) / 2 + settings.holeClearance)
        add(
          `${a.s.name} / ${b.s.name}`,
          d < (a.diameter + b.diameter) / 2
            ? "Overlappende hull."
            : `Hull ligger nærmere enn ${settings.holeClearance} mm kantavstand.`,
          {
            kind: "station",
            id: a.s.id,
            pointIndex: a.i,
            stationIds: [a.s.id, b.s.id],
          },
        );
    }
  for (const b of p.ledLayout.bindings) {
    currentTarget = {
      kind: "station",
      id: b.stationId,
      pointIndex: b.pointIndex,
    };
    const s = p.layout.stations.find((s) => s.id === b.stationId),
      led = ledFor(p, b.segmentId, b.ledId),
      h = s?.holes[b.pointIndex],
      ring = s && symbolCenters(p, s)[b.pointIndex];
    if (!led)
      add(
        `${s?.name ?? b.stationId} punkt ${b.pointIndex + 1}`,
        "LED-binding peker til slettet/manglende segment eller LED.",
      );
    else if (!activeHole(h) || !ring)
      add(s.name, "Binding mangler hull eller grafisk ring.");
    else if (
      b.mode === "direct" &&
      (distance(h, led) > 1e-5 || distance(ring, led) > 1e-5)
    )
      add(
        `${s.name} punkt ${b.pointIndex + 1}`,
        "Direkte LED-, hull- og ringsenter er ikke sammenfallende.",
      );
  }
  return [...issues, ...mountingIssues(p)];
}

export function setFrontPoint(p, stationId, pointIndex, front) {
  const q = structuredClone(p),
    s = q.layout.stations.find((s) => s.id === stationId),
    b = q.ledLayout.bindings.find(
      (b) => b.stationId === stationId && b.pointIndex === pointIndex,
    );
  if (!b || b.mode !== "lightguide")
    throw Error("Frontforskyvning krever lysledermodus.");
  if (q.layers.holes.locked || q.layers.rings.locked)
    throw Error("Hull- eller ringlaget er låst.");
  ensureCentres(q, s);
  Object.assign(s.holes[pointIndex], {
    x: front.holeX,
    y: front.holeY,
    diameter: front.diameter,
  });
  s.ringCenters[pointIndex] = { x: front.ringX, y: front.ringY };
  reanchor(s);
  return q;
}
