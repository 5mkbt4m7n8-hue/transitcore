import { symbolCenters } from "./geometry.mjs";
import { ledPositions } from "./led-layout.mjs";
const dot = (a, b) => a.x * b.x + a.y * b.y;
const delta = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const moved = (s, d) => ({ ...s, x: s.x + d.x, y: s.y + d.y });
const axis = (s) => ({
  x: Math.cos((s.angle * Math.PI) / 180),
  y: Math.sin((s.angle * Math.PI) / 180),
});
// Translation only: no hidden rotation, binding, hole movement or chain merge.
export function snapStrip(
  p,
  segment,
  zoom,
  { enabled = true, tolerancePx = 12, gap = 0 } = {},
) {
  if (!enabled) return { segment: { ...segment }, guide: null };
  const otherLeds = p.ledLayout.segments
    .filter((s) => s.id !== segment.id)
    .flatMap((s) => ledPositions(p, s));
  const candidates = [],
    leds = ledPositions(p, segment),
    u = axis(segment),
    profile = p.ledLayout.profiles.find((r) => r.id === segment.profileId),
    threshold = tolerancePx / zoom;
  const offer = (shift, guide, priority = 0) => {
    const distance = Math.hypot(shift.x, shift.y);
    if (
      distance <= threshold + 1e-9 &&
      !otherLeds.some((other) => {
        const slot = Math.round(
          (dot(delta(other, segment), u) -
            dot(shift, u) -
            profile.firstOffset) /
            profile.pitch,
        );
        return (
          slot >= 0 &&
          slot < leds.length &&
          Math.hypot(
            leds[slot].x + shift.x - other.x,
            leds[slot].y + shift.y - other.y,
          ) < 1e-6
        );
      })
    )
      candidates.push({
        segment: moved(segment, shift),
        guide,
        priority,
        distance,
      });
  };
  // Match physical hole centres, not the segment's plastic end or station centre.
  for (const s of p.layout.stations) {
    const rings = symbolCenters(p, s),
      canAlign =
        !p.layers.holes.locked &&
        rings.length === s.holes.length &&
        !p.ledLayout.bindings.some((b) => b.stationId === s.id) &&
        rings.some(
          (r, i) => Math.hypot(r.x - s.holes[i].x, r.y - s.holes[i].y) > 1e-6,
        ),
      groups = [
        { points: s.holes, align: false },
        ...(canAlign ? [{ points: rings, align: true }] : []),
      ];
    for (const group of groups)
      for (const hole of group.points) {
        const projection = dot(delta(hole, segment), u),
          slot = Math.max(
            0,
            Math.min(
              segment.count - 1,
              Math.round((projection - profile.firstOffset) / profile.pitch),
            ),
          ),
          led = leds[slot],
          shift = delta(hole, led);
        if (Math.hypot(shift.x, shift.y) > threshold) continue;
        const matches = group.points.filter((h) => {
          const slot = Math.round(
            (dot(delta(h, segment), u) - dot(shift, u) - profile.firstOffset) /
              profile.pitch,
          );
          if (slot < 0 || slot >= leds.length) return false;
          return (
            Math.hypot(
              leds[slot].x + shift.x - h.x,
              leds[slot].y + shift.y - h.y,
            ) < 1e-6
          );
        }).length;
        offer(
          shift,
          {
            kind: "station",
            x: hole.x,
            y: hole.y,
            label: `${s.name} · ${matches > 1 ? matches + (group.align ? " ringer" : " hull") : "punkt " + (group.points.indexOf(hole) + 1)}${group.align ? " · hulltilpasning må bekreftes" : ""}`,
            ...(group.align
              ? { alignHoles: rings.map(({ x, y }) => ({ x, y })) }
              : {}),
            stationId: s.id,
            matched: matches,
          },
          matches > 1 ? (group.align ? 4 : 3) : 2,
        );
      }
  }
  for (const other of p.ledLayout.segments) {
    if (other.id === segment.id) continue;
    const v = axis(other);
    if (Math.abs(dot(u, v)) < 0.999999) continue;
    const n = { x: -v.y, y: v.x },
      otherProfile = p.ledLayout.profiles.find((r) => r.id === other.profileId),
      rel = delta(segment, other),
      along = dot(rel, v),
      lateral = dot(rel, n),
      extent = dot(u, v) * segment.length,
      lo = Math.min(along, along + extent),
      hi = Math.max(along, along + extent);
    // Butt joins respect the real segment ends, including the first-LED offset.
    const end = {
        x: segment.x + u.x * segment.length,
        y: segment.y + u.y * segment.length,
      },
      otherEnd = {
        x: other.x + v.x * other.length,
        y: other.y + v.y * other.length,
      };
    for (const [a, b] of [
      [segment, otherEnd],
      [end, other],
    ])
      offer(
        delta(b, a),
        {
          kind: "end",
          x: b.x,
          y: b.y,
          label: `${other.name} · ende mot ende`,
          segmentId: other.id,
        },
        1,
      );
    if (hi < 0 || lo > other.length) continue;
    const refLeds = ledPositions(p, other);
    let rowShift = null;
    // Four endpoint projections find the nearest two finite arithmetic LED grids.
    for (const led of [leds[0], leds.at(-1)]) {
      const k = Math.max(
          0,
          Math.min(
            other.count - 1,
            Math.round(
              (dot(delta(led, other), v) - otherProfile.firstOffset) /
                otherProfile.pitch,
            ),
          ),
        ),
        shift = dot(delta(refLeds[k], led), v);
      if (rowShift === null || Math.abs(shift) < Math.abs(rowShift))
        rowShift = shift;
    }
    for (const led of [refLeds[0], refLeds.at(-1)]) {
      const k = Math.max(
          0,
          Math.min(
            segment.count - 1,
            Math.round(
              (dot(delta(led, segment), u) - profile.firstOffset) /
                profile.pitch,
            ),
          ),
        ),
        shift = dot(delta(led, leds[k]), v);
      if (rowShift === null || Math.abs(shift) < Math.abs(rowShift))
        rowShift = shift;
    }
    for (const side of [-1, 1]) {
      const across =
        side * ((profile.width + otherProfile.width) / 2 + gap) - lateral;
      if (Math.abs(across) > threshold) continue;
      const alongShift =
          Math.abs(rowShift ?? Infinity) <= threshold ? rowShift : 0,
        shift = {
          x: n.x * across + v.x * alongShift,
          y: n.y * across + v.y * alongShift,
        };
      offer(
        shift,
        {
          kind: "side",
          x: segment.x + shift.x,
          y: segment.y + shift.y,
          label: `${other.name} · kant mot kant${alongShift !== 0 ? " · LED-posisjon justert" : ""}`,
          segmentId: other.id,
          gap,
        },
        1,
      );
    }
  }
  candidates.sort((a, b) => b.priority - a.priority || a.distance - b.distance);
  return candidates[0] ?? { segment: { ...segment }, guide: null };
}

export function alignStripHoles(p, guide) {
  const q = structuredClone(p),
    changes = [];
  if (!guide?.alignHoles) return { project: q, changes };
  const s = q.layout.stations.find((s) => s.id === guide.stationId);
  if (
    !s ||
    s.holes.length !== guide.alignHoles.length ||
    q.ledLayout.bindings.some((b) => b.stationId === s.id)
  )
    throw Error("Hullene kan ikke tilpasses automatisk for denne stasjonen.");
  if (q.layers.holes.locked) throw Error("Hullaget er låst.");
  s.holes.forEach((h, i) => {
    const after = guide.alignHoles[i];
    if (Math.hypot(h.x - after.x, h.y - after.y) > 1e-8) {
      changes.push({
        stationId: s.id,
        pointIndex: i,
        name: s.name + " · tilpass hull til ring",
        holeBefore: { x: h.x, y: h.y },
        holeAfter: { ...after },
      });
      Object.assign(h, after);
    }
  });
  return { project: q, changes };
}
