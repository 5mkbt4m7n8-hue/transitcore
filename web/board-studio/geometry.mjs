// Geometry is evaluated in millimetres and shared by canvas and SVG export.
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const length = (a) => Math.hypot(a.x, a.y);
export const unit = (a) =>
  length(a) > 1e-9 ? mul(a, 1 / length(a)) : { x: 0, y: 1 };
export const normal = (a) => ({ x: -a.y, y: a.x });
export const point = (a) => `${a.x} ${a.y}`;
export function tangentAt(stations, i) {
  const a = stations[Math.max(0, i - 1)],
    b = stations[Math.min(stations.length - 1, i + 1)];
  return unit(sub(b, a));
}
export function stationTangent(p, s) {
  if (p.layout.tangentHints?.[s.id]) return { ...p.layout.tangentHints[s.id] };
  let before = null,
    after = null;
  for (const r of p.layout.routes) {
    const i = r.stationIds.indexOf(s.id);
    if (i < 0) continue;
    if (i > 0 && !before)
      before = p.layout.stations.find((t) => t.id === r.stationIds[i - 1]);
    if (i < r.stationIds.length - 1 && !after)
      after = p.layout.stations.find((t) => t.id === r.stationIds[i + 1]);
  }
  if (before || after) return unit(sub(after || s, before || s));
  return { x: 0, y: 1 };
}
export function symbolNormal(p, s) {
  if (
    s.ringCenters?.length > 1 &&
    length(sub(s.ringCenters.at(-1), s.ringCenters[0])) > 1e-8
  )
    return unit(sub(s.ringCenters.at(-1), s.ringCenters[0]));
  if (s.symbolAngle !== null && s.symbolAngle !== undefined) {
    const r = (s.symbolAngle * Math.PI) / 180;
    return { x: Math.cos(r), y: Math.sin(r) };
  }
  return normal(stationTangent(p, s));
}
export function symbolCenters(p, s) {
  if (s.ringCenters) return s.ringCenters.map((c, index) => ({ ...c, index }));
  const n = symbolNormal(p, s),
    count = s.points ?? 1,
    spacing = s.pointSpacing ?? 10,
    bias = s.splitBias ?? 0;
  return Array.from({ length: count }, (_, i) => ({
    ...add(s, mul(n, (i - (count - 1) / 2 + bias) * spacing)),
    index: i,
  }));
}
// C1-continuous cubic: end/control are collinear with the central rail.
// The start derivative is tangent to the station's local orientation.
export function transition(a, tangent, n, offset, join, tension = 0.5) {
  const start = add(a, mul(n, offset)),
    reach = length(sub(join, a)) * tension;
  return {
    start,
    c1: add(start, mul(tangent, reach)),
    c2: sub(join, mul(unit(sub(join, a)), reach)),
    end: join,
  };
}
export const cubic = (c) =>
  `M ${point(c.start)} C ${point(c.c1)} ${point(c.c2)} ${point(c.end)}`;
// Exact circular fillets represented by SVG arcs. Radii are capped at half
// each adjacent segment, so short geometry never reverses on itself.
export function roundedPolyline(points, radius) {
  if (!points.length) return "";
  let d = `M ${point(points[0])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1],
      u = unit(sub(a, b)),
      v = unit(sub(c, b)),
      cos = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y)),
      theta = Math.acos(cos),
      cross = u.x * v.y - u.y * v.x;
    if (radius <= 0 || Math.abs(cross) < 1e-7 || theta < 1e-5) {
      d += ` L ${point(b)}`;
      continue;
    }
    const dist = Math.min(
        radius / Math.tan(theta / 2),
        length(sub(a, b)) / 2,
        length(sub(c, b)) / 2,
      ),
      r = dist * Math.tan(theta / 2),
      entry = add(b, mul(u, dist)),
      exit = add(b, mul(v, dist));
    d += ` L ${point(entry)} A ${r} ${r} 0 0 ${cross < 0 ? 1 : 0} ${point(exit)}`;
  }
  if (points.length > 1) d += ` L ${point(points.at(-1))}`;
  return d;
}

export function holeCenters(p, s) {
  return s.holes
    ? s.holes.map((h, index) => ({ ...h, index }))
    : symbolCenters(p, s);
}
// v0.2: both rails are normal offsets of the SAME differentiable centre curve.
// Cubic offsets are not cubics. We export adaptive vector polylines, not two
// independently guessed Beziers. Maximum midpoint deviation is 0.008 mm.
export const OFFSET_TOLERANCE = 0.008;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const mix = (a, b, t) => add(mul(a, 1 - t), mul(b, t));
const smooth = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};
export function evaluateCubic(c, t) {
  if (c.arc) {
    const angle = c.arc.angle + c.arc.sweep * t,
      r = c.arc.radius,
      k = c.arc.sweep,
      p = {
        x: c.arc.center.x + r * Math.cos(angle),
        y: c.arc.center.y + r * Math.sin(angle),
      },
      d = { x: -r * Math.sin(angle) * k, y: r * Math.cos(angle) * k };
    return { p, d, n: normal(unit(d)), radius: r };
  }

  const u = 1 - t,
    p = add(
      add(mul(c.start, u * u * u), mul(c.c1, 3 * u * u * t)),
      add(mul(c.c2, 3 * u * t * t), mul(c.end, t * t * t)),
    ),
    d = add(
      add(mul(sub(c.c1, c.start), 3 * u * u), mul(sub(c.c2, c.c1), 6 * u * t)),
      mul(sub(c.end, c.c2), 3 * t * t),
    ),
    dd = add(
      mul(add(sub(c.c2, mul(c.c1, 2)), c.start), 6 * u),
      mul(add(sub(c.end, mul(c.c2, 2)), c.c1), 6 * t),
    );
  return {
    p,
    d,
    n: normal(unit(d)),
    radius:
      Math.abs(cross(d, dd)) < 1e-12
        ? Infinity
        : length(d) ** 3 / Math.abs(cross(d, dd)),
  };
}
export function segmentsIntersect(a, b, c, d) {
  const ab = sub(b, a),
    cd = sub(d, c),
    den = cross(ab, cd);
  if (Math.abs(den) < 1e-10) return false;
  const ac = sub(c, a),
    t = cross(ac, cd) / den,
    u = cross(ac, ab) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9;
}
function selfCrosses(points) {
  for (let i = 0; i < points.length - 1; i++)
    for (let j = i + 2; j < points.length - 1; j++)
      if (segmentsIntersect(points[i], points[i + 1], points[j], points[j + 1]))
        return true;
  return false;
}
function railsCross(a, b) {
  for (let i = 0; i < a.length - 1; i++)
    for (let j = 0; j < b.length - 1; j++)
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) {
        const intentional = [a[i], a[i + 1]].some((x) =>
          [b[j], b[j + 1]].some(
            (y) => Math.abs(x.t - y.t) < 1e-8 && length(sub(x, y)) < 1e-8,
          ),
        );
        if (!intentional) return true;
      }
  return false;
}
export function initializeGeometry(p) {
  for (const r of p.layout.routes) {
    r.trackIds ??= [`${r.id}:negative`, `${r.id}:positive`];
    r.portSigns ??= {};
    r.controls ??= {};
    r.autoGrow ??= 20;
    for (const id of r.stationIds) {
      if (r.portSigns[id] !== undefined) continue;
      const s = p.layout.stations.find((s) => s.id === id);
      r.portSigns[id] =
        dot(symbolNormal(p, s), normal(stationTangent(p, s))) < 0 ? -1 : 1;
    }
  }
  for (const s of p.layout.stations)
    s.holes ??= symbolCenters(p, s).map(({ x, y }, i) => ({
      id: `${s.id}:hole:${i}`,
      x,
      y,
    }));
  return p;
}
function makeCurve(a, b, ta, tb, reachA, reachB) {
  return {
    start: { x: a.x, y: a.y },
    c1: add(a, mul(ta, reachA)),
    c2: sub(b, mul(tb, reachB)),
    end: { x: b.x, y: b.y },
  };
}
function circleTrim(points, centre, r, fromStart) {
  const list = fromStart ? points : [...points].reverse();
  let k = list.findIndex((p) => length(sub(p, centre)) >= r);
  if (k < 0) return [];
  if (k === 0) return fromStart ? list : [...list].reverse();
  let a = list[k - 1],
    b = list[k];
  for (let j = 0; j < 25; j++) {
    const m = mix(a, b, 0.5);
    if (length(sub(m, centre)) < r) a = m;
    else b = m;
  }
  const first = { ...list[k], ...b },
    out = [first, ...list.slice(k)];
  return fromStart ? out : out.reverse();
}
export function edgeGeometry(p, r, i) {
  const a = p.layout.stations.find((s) => s.id === r.stationIds[i]),
    b = p.layout.stations.find((s) => s.id === r.stationIds[i + 1]);
  if (!a || !b || length(sub(b, a)) < 1e-6)
    return {
      paths: [],
      center: [],
      rails: [],
      valid: false,
      warnings: ["Sammenfallende stasjoner: flytt ett endepunkt."],
    };
  const na = mul(symbolNormal(p, a), r.portSigns?.[a.id] ?? 1),
    nb = mul(symbolNormal(p, b), r.portSigns?.[b.id] ?? 1),
    ta = { x: na.y, y: -na.x },
    tb = { x: nb.y, y: -nb.x },
    bend = r.bends?.[i],
    control = r.controls?.[i] ?? {},
    dist = length(sub(b, a)),
    spacing = r.trackSpacing ?? 10;
  const baseA =
      control.startReach ??
      Math.min(
        dist * 0.4,
        (a.transitionLength ?? r.transitionLength ?? 12) *
          (r.tension ?? 0.5) *
          2,
      ),
    baseB =
      control.endReach ??
      Math.min(
        dist * 0.4,
        (b.transitionLength ?? r.transitionLength ?? 12) *
          (r.tension ?? 0.5) *
          2,
      ),
    middle = r.tracks === 2 ? spacing / 2 : 0;
  const widthA = a.points > 1 ? ((a.points - 1) * a.pointSpacing) / 2 : 0,
    widthB = b.points > 1 ? ((b.points - 1) * b.pointSpacing) / 2 : 0;
  // A biased station shifts the common centre, never the rail ordering.
  const start = add(
      a,
      mul(symbolNormal(p, a), (a.splitBias ?? 0) * a.pointSpacing),
    ),
    end = add(b, mul(symbolNormal(p, b), (b.splitBias ?? 0) * b.pointSpacing));
  let result;
  const allowance = r.autoGrow ?? 20;
  for (const extra of [
    0,
    ...[4, 8, 12, 20, 32, 48].filter((x) => x <= allowance),
  ]) {
    const ra = baseA + extra,
      rb = baseB + extra;
    let curves;
    if (control.shape) {
      const shape = control.shape,
        tangent =
          control.shapeAngle === undefined
            ? unit(add(unit(sub(shape, start)), unit(sub(end, shape))))
            : {
                x: Math.cos((control.shapeAngle * Math.PI) / 180),
                y: Math.sin((control.shapeAngle * Math.PI) / 180),
              },
        reach =
          control.shapeReach ??
          Math.min(length(sub(shape, start)), length(sub(end, shape))) * 0.3;
      curves = [
        makeCurve(start, shape, ta, tangent, ra, reach),
        makeCurve(shape, end, tangent, tb, reach, rb),
      ];
    } else if (bend) {
      const u = unit(sub(bend, start)),
        v = unit(sub(end, bend)),
        turn = Math.atan2(cross(u, v), dot(u, v)),
        tan = Math.tan(Math.abs(turn) / 2),
        radius = Math.min(
          (r.cornerRadius ?? 0) + extra,
          (Math.min(length(sub(bend, start)), length(sub(end, bend))) * 0.45) /
            Math.max(1e-8, tan),
        );
      if (
        Math.abs(turn) > 0.001 &&
        Math.abs(turn) < Math.PI - 0.01 &&
        radius > 0.01
      ) {
        const reach = radius * tan,
          entry = sub(bend, mul(u, reach)),
          exit = add(bend, mul(v, reach)),
          center = add(entry, mul(normal(u), Math.sign(turn) * radius)),
          k = (4 / 3) * Math.tan(Math.abs(turn) / 4) * radius;
        const arc = {
          start: entry,
          c1: add(entry, mul(u, k)),
          c2: sub(exit, mul(v, k)),
          end: exit,
          arc: {
            center,
            radius,
            angle: Math.atan2(entry.y - center.y, entry.x - center.x),
            sweep: turn,
          },
        };
        const la = length(sub(entry, start)),
          lb = length(sub(end, exit));
        curves = [
          makeCurve(
            start,
            entry,
            ta,
            u,
            Math.min(ra, la * 0.85),
            Math.min(radius * 0.55, la * 0.1),
          ),
          arc,
          makeCurve(
            exit,
            end,
            v,
            tb,
            Math.min(radius * 0.55, lb * 0.1),
            Math.min(rb, lb * 0.85),
          ),
        ];
      } else {
        const tangent = unit(add(u, v)),
          reach =
            Math.min(length(sub(bend, start)), length(sub(end, bend))) * 0.45;
        curves = [
          makeCurve(start, bend, ta, tangent, ra, reach),
          makeCurve(bend, end, tangent, tb, reach, rb),
        ];
      }
    } else curves = [makeCurve(start, end, ta, tb, ra, rb)];
    const centreAt = (t) => {
      const index = Math.min(curves.length - 1, Math.floor(t * curves.length)),
        local = t * curves.length - index;
      return evaluateCubic(curves[index], local);
    };
    const lengths = [0];
    let previous = centreAt(0).p;
    for (let k = 1; k <= 256; k++) {
      const pt = centreAt(k / 256).p;
      lengths.push(lengths.at(-1) + length(sub(pt, previous)));
      previous = pt;
    }
    const total = lengths.at(-1),
      zoneA = Math.min(
        (a.transitionLength ?? r.transitionLength ?? 12) + a.ringOuter / 2,
        total * 0.45,
      ),
      zoneB = Math.min(
        (b.transitionLength ?? r.transitionLength ?? 12) + b.ringOuter / 2,
        total * 0.45,
      ),
      arcAt = (t) => {
        const k = Math.min(255, Math.floor(t * 256)),
          f = t * 256 - k;
        return lengths[k] + (lengths[k + 1] - lengths[k]) * f;
      };
    const tAtArc = (s) => {
      let k = 1;
      while (k < 256 && lengths[k] < s) k++;
      return (
        (k -
          1 +
          (s - lengths[k - 1]) / Math.max(1e-9, lengths[k] - lengths[k - 1])) /
        256
      );
    };
    const breakA = tAtArc(zoneA),
      breakB = tAtArc(total - zoneB);
    const at = (t) => {
      const e = centreAt(t),
        arc = arcAt(t),
        w =
          arc < zoneA
            ? widthA + (middle - widthA) * smooth(arc / zoneA)
            : arc > total - zoneB
              ? middle +
                (widthB - middle) * smooth((arc - (total - zoneB)) / zoneB)
              : middle;
      return {
        ...e,
        t,
        w,
        left: add(e.p, mul(e.n, -w)),
        right: add(e.p, mul(e.n, w)),
      };
    };
    const samples = [at(0)];
    let samplingExceeded = false;
    function subdivide(lo, hi, depth = 0) {
      const mid = at((lo.t + hi.t) / 2),
        error = Math.max(
          length(sub(mid.p, mix(lo.p, hi.p, 0.5))),
          length(sub(mid.left, mix(lo.left, hi.left, 0.5))),
          length(sub(mid.right, mix(lo.right, hi.right, 0.5))),
        );
      if (
        depth < 13 &&
        (error > OFFSET_TOLERANCE ||
          length(sub(lo.p, hi.p)) > 4 ||
          dot(unit(lo.d), unit(hi.d)) < 0.998)
      ) {
        subdivide(lo, mid, depth + 1);
        subdivide(mid, hi, depth + 1);
      } else {
        if (error > OFFSET_TOLERANCE) samplingExceeded = true;
        samples.push(hi);
      }
    }
    for (const t of [
      ...new Set([
        breakA,
        0.25,
        0.5,
        0.75,
        breakB,
        1,
        ...curves.slice(1).map((_, k) => (k + 1) / curves.length),
      ]),
    ].sort((a, b) => a - b))
      subdivide(samples.at(-1), at(t));
    const center = samples.map((s) => ({
        ...s.p,
        t: s.t,
        n: s.n,
        radius: s.radius,
        w: s.w,
      })),
      rails = [-1, 1].map((side, j) => ({
        id: r.trackIds?.[j] ?? `${r.id}:${side}`,
        side,
        samples: samples.map((s) => ({
          ...add(s.p, mul(s.n, side * s.w)),
          t: s.t,
        })),
      }));
    const minRadius = Math.min(...samples.map((s) => s.radius)),
      required = Math.max(
        r.cornerRadius ?? 0,
        ...samples.map((s) => (s.w > 0 ? s.w + 0.4 : 0)),
      );
    const cusp = samples.some(
        (s) => length(s.d) < 1e-5 || s.radius <= s.w + 0.05,
      ),
      loops =
        selfCrosses(center) || rails.some((rail) => selfCrosses(rail.samples)),
      crossing = railsCross(rails[0].samples, rails[1].samples);
    const valid =
      !samplingExceeded &&
      !cusp &&
      !loops &&
      !crossing &&
      minRadius + 1e-6 >= required;
    result = {
      center,
      rails,
      curves,
      breakA,
      breakB,
      valid,
      minRadius,
      requiredRadius: required,
      adjusted: extra > 0,
      effectiveReach: { start: ra, end: rb },
      warnings: [],
      paths: [],
    };
    if (valid) break;
  }
  const overlaps =
    [a, b].some(
      (s) => s.points > 1 && s.pointSpacing < s.ringOuter + s.stroke,
    ) ||
    symbolCenters(p, a).some((x) =>
      symbolCenters(p, b).some(
        (y) => length(sub(x, y)) < (a.ringOuter + b.ringOuter) / 2,
      ),
    );
  if (overlaps) {
    result.valid = false;
    result.warnings.push(
      "Stasjonsringer overlapper. Øk punkt-/stasjonavstanden eller reduser ringdiameteren.",
    );
  }
  if (!result.valid)
    result.warnings.push(
      `Ugyldig geometri: minste radius ${Number.isFinite(result.minRadius) ? result.minRadius.toFixed(1) : "∞"} mm, krever ${result.requiredRadius.toFixed(1)} mm. Flytt kontrollpunkt, øk tillatt utvidelse eller reduser sporavstand. Ingen porter er byttet.`,
    );
  else if (result.adjusted)
    result.warnings.push(
      `Forhåndsvist automatisk utvidelse: ${result.effectiveReach.start.toFixed(1)} / ${result.effectiveReach.end.toFixed(1)} mm (innen +${allowance} mm).`,
    );
  const nA = symbolNormal(p, a),
    nB = symbolNormal(p, b),
    signA = r.portSigns?.[a.id] ?? 1,
    signB = r.portSigns?.[b.id] ?? 1;
  for (const rail of result.rails) {
    let points = circleTrim(
      rail.samples,
      add(start, mul(nA, rail.side * widthA * signA)),
      a.ringOuter / 2 + a.stroke / 2,
      true,
    );
    points = circleTrim(
      points,
      add(end, mul(nB, rail.side * widthB * signB)),
      b.ringOuter / 2 + b.stroke / 2,
      false,
    );
    for (const [part, lo, hi] of [
      ["start", 0, result.breakA],
      ["core", result.breakA, result.breakB],
      ["end", result.breakB, 1],
    ]) {
      if (part === "core" && r.tracks === 1 && rail.side === 1) continue;
      if (
        part === "start" &&
        a.points === 1 &&
        r.tracks === 1 &&
        rail.side === 1
      )
        continue;
      if (part === "end" && b.points === 1 && r.tracks === 1 && rail.side === 1)
        continue;
      const section = points.filter(
        (s) => s.t >= lo - 1e-9 && s.t <= hi + 1e-9,
      );
      if (section.length > 1)
        result.paths.push({
          part,
          trackId: rail.id,
          side: rail.side,
          samples: section,
          d: section.map((s, k) => `${k ? "L" : "M"} ${point(s)}`).join(" "),
        });
    }
  }
  if (!result.paths.length && result.center.length)
    result.paths.push({
      part: "core",
      trackId: r.trackIds?.[0],
      d: result.center.map((s, k) => `${k ? "L" : "M"} ${point(s)}`).join(" "),
    });
  return result;
}
export function geometryReport(p) {
  return p.layout.routes.flatMap((r) =>
    r.stationIds
      .slice(0, -1)
      .map((_, i) => ({ routeId: r.id, edge: i, ...edgeGeometry(p, r, i) })),
  );
}
