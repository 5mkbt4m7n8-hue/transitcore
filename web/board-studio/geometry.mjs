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
  if (s.symbolAngle !== null && s.symbolAngle !== undefined) {
    const r = (s.symbolAngle * Math.PI) / 180;
    return { x: Math.cos(r), y: Math.sin(r) };
  }
  return normal(stationTangent(p, s));
}
export function holeCenters(p, s) {
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
export function edgeGeometry(p, r, i) {
  const stations = r.stationIds.map((id) =>
      p.layout.stations.find((s) => s.id === id),
    ),
    a = stations[i],
    b = stations[i + 1],
    delta = sub(b, a),
    dist = length(delta);
  if (dist < 1e-7) return { paths: [], warnings: ["Sammenfallende stasjoner"] };
  const bend = r.bends?.[i],
    firstDir = unit(sub(bend || b, a)),
    lastDir = unit(sub(b, bend || a));
  const dir = unit(delta),
    ta = stationTangent(p, a),
    tb = stationTangent(p, b),
    na = symbolNormal(p, a),
    nb = symbolNormal(p, b),
    tracks = r.tracks ?? 1,
    spacing = r.trackSpacing ?? 10,
    tension = r.tension ?? 0.5,
    reach = Math.min(
      r.transitionLength ?? 12,
      dist * 0.35,
      ...(bend
        ? [length(sub(bend, a)) * 0.35, length(sub(b, bend)) * 0.35]
        : [dist]),
    );
  const joinA = add(a, mul(firstDir, reach)),
    joinB = sub(b, mul(lastDir, reach));
  const offsetA = holeCenters(p, a).map((c) => sub(c, a)),
    offsetB = holeCenters(p, b).map((c) => sub(c, b));
  const warnings = [];
  if (dist < Math.max(a.pointSpacing ?? 10, b.pointSpacing ?? 10, spacing) * 2)
    warnings.push("Kort strekning: kontroller ringer og overgang");
  const paths = [];
  if (tracks === 1) {
    // Each symbol endpoint fans into one common line; symbol count never forces
    // the entire edge to become a double track.
    for (const off of offsetA) {
      const start = add(a, off),
        end = joinA,
        ctrl = Math.min(reach * tension, dist / 3);
      paths.push({
        part: "start",
        start,
        c1: add(start, mul(ta, ctrl)),
        c2: sub(end, mul(firstDir, ctrl)),
        end,
      });
    }
    paths.push({
      part: "core",
      d: roundedPolyline(
        bend ? [joinA, bend, joinB] : [joinA, joinB],
        r.cornerRadius ?? 0,
      ),
    });
    for (const off of offsetB) {
      const start = joinB,
        end = add(b, off),
        ctrl = Math.min(reach * tension, dist / 3);
      paths.push({
        part: "end",
        start,
        c1: add(start, mul(lastDir, ctrl)),
        c2: sub(end, mul(tb, ctrl)),
        end,
      });
    }
  } else {
    // Parallel middle rails at the exact requested perpendicular separation.
    const n = normal(dir);
    for (const side of [-1, 1]) {
      const off = (side * spacing) / 2,
        ja = add(joinA, mul(normal(firstDir), off)),
        jb = add(joinB, mul(normal(lastDir), off)),
        sa = add(
          a,
          offsetA.length === 1
            ? { x: 0, y: 0 }
            : offsetA[side < 0 ? 0 : offsetA.length - 1],
        ),
        sb = add(
          b,
          offsetB.length === 1
            ? { x: 0, y: 0 }
            : offsetB[side < 0 ? 0 : offsetB.length - 1],
        ),
        ctrl = reach * tension;
      paths.push(
        {
          part: "start",
          start: sa,
          c1: add(sa, mul(ta, ctrl)),
          c2: sub(ja, mul(firstDir, ctrl)),
          end: ja,
        },
        {
          part: "core",
          d: parallelCore(joinA, joinB, bend, off, r.cornerRadius ?? 0),
        },
        {
          part: "end",
          start: jb,
          c1: add(jb, mul(lastDir, ctrl)),
          c2: sub(sb, mul(tb, ctrl)),
          end: sb,
        },
      );
    }
  }
  return { paths, warnings };
}

function parallelCore(a, b, bend, offset, radius) {
  if (!bend) {
    const n = normal(unit(sub(b, a)));
    return roundedPolyline([add(a, mul(n, offset)), add(b, mul(n, offset))], 0);
  }
  const u = unit(sub(bend, a)),
    v = unit(sub(b, bend)),
    cross = u.x * v.y - u.y * v.x,
    na = normal(u),
    nb = normal(v),
    start = add(a, mul(na, offset)),
    end = add(b, mul(nb, offset));
  if (Math.abs(cross) < 1e-6) return roundedPolyline([start, end], 0);
  const p = add(bend, mul(na, offset)),
    q = add(bend, mul(nb, offset)),
    d = sub(q, p),
    t = (d.x * v.y - d.y * v.x) / cross,
    corner = add(p, mul(u, t));
  const effective = Math.max(0, radius - Math.sign(cross) * offset);
  return roundedPolyline([start, corner, end], effective);
}
