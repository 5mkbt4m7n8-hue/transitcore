import { add, sub, mul, unit, normal, length } from "./geometry.mjs";
const dot = (a, b) => a.x * b.x + a.y * b.y;
export function segmentPoints(p, ref) {
  const r = p.layout.routes.find((r) => r.id === ref.routeId);
  if (
    !r ||
    !Number.isInteger(ref.edge) ||
    ref.edge < 0 ||
    ref.edge >= r.stationIds.length - 1
  )
    return null;
  const a = p.layout.stations.find((s) => s.id === r.stationIds[ref.edge]),
    b = p.layout.stations.find((s) => s.id === r.stationIds[ref.edge + 1]),
    bend = r.bends[ref.edge];
  if (ref.leg === "whole" && !bend) return [a, b];
  if (ref.leg === "in" && bend) return [a, bend];
  if (ref.leg === "out" && bend) return [bend, b];
  return null;
}
export function segments(p) {
  return p.layout.routes.flatMap((r) =>
    r.stationIds.slice(0, -1).flatMap((_, edge) =>
      (r.bends[edge] ? ["in", "out"] : ["whole"]).map((leg) => ({
        routeId: r.id,
        edge,
        leg,
      })),
    ),
  );
}
export function validateParallels(p, positions = false) {
  const constraints = p.layout.parallelConstraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > 1000)
    throw Error("Ugyldige parallellbindinger.");
  const followers = new Set(),
    ids = new Set();
  for (const c of constraints) {
    if (
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      followers.has(c.follower?.routeId) ||
      c.reference?.routeId === c.follower?.routeId ||
      (c.orientation !== undefined && ![-1, 1].includes(c.orientation)) ||
      !Number.isFinite(c.distance) ||
      Math.abs(c.distance) > 5000 ||
      !segmentPoints(p, c.reference) ||
      !segmentPoints(p, c.follower) ||
      segmentPoints(p, c.reference).some((pt) =>
        segmentPoints(p, c.follower).includes(pt),
      )
    )
      throw Error("Ugyldig parallellbinding eller segmentreferanse.");
    const rp = segmentPoints(p, c.reference),
      fp = segmentPoints(p, c.follower);
    c.orientation ??= dot(sub(fp[1], fp[0]), sub(rp[1], rp[0])) < 0 ? -1 : 1;
    followers.add(c.follower.routeId);
    ids.add(c.id);
  }
  const pending = [...constraints],
    done = new Set();
  while (pending.length) {
    const index = pending.findIndex(
      (c) =>
        !followers.has(c.reference.routeId) || done.has(c.reference.routeId),
    );
    if (index < 0) throw Error("Parallellbindinger kan ikke danne en sirkel.");
    done.add(pending.splice(index, 1)[0].follower.routeId);
  }
  if (positions)
    for (const c of constraints) {
      const [a, b] = segmentPoints(p, c.reference),
        points = segmentPoints(p, c.follower),
        d = unit(sub(b, a)),
        n = normal(d);
      if (
        length(sub(b, a)) < 0.01 ||
        length(sub(points[1], points[0])) < 0.01 ||
        points.some((pt) => Math.abs(dot(sub(pt, a), n) - c.distance) > 1e-6)
      )
        throw Error(
          "Parallellbinding og lagrede millimeterkoordinater samsvarer ikke.",
        );
    }
  return constraints;
}
function setPoint(p, ref, index, point) {
  const r = p.layout.routes.find((r) => r.id === ref.routeId);
  let s;
  if ((ref.leg === "in" && index === 1) || (ref.leg === "out" && index === 0)) {
    Object.assign(r.bends[ref.edge], point);
    return;
  }
  s = p.layout.stations.find(
    (s) => s.id === r.stationIds[ref.edge + (ref.leg === "out" ? 1 : index)],
  );
  const dx = point.x - s.x,
    dy = point.y - s.y;
  if (
    Math.hypot(dx, dy) > 1e-7 &&
    ["rings", "capsules", "names", "routes"].some((id) => p.layers[id].locked)
  )
    throw Error("Lås opp berørte lag før parallelltilpassing.");
  s.x = point.x;
  s.y = point.y;
  for (const h of s.ringCenters ?? []) {
    h.x += dx;
    h.y += dy;
  }
}
export function applyParallel(p, c) {
  const ref = segmentPoints(p, c.reference),
    follower = segmentPoints(p, c.follower);
  if (!ref || !follower) throw Error("Parallellsegmentet finnes ikke.");
  const d = unit(sub(ref[1], ref[0])),
    n = normal(d),
    len = length(sub(follower[1], follower[0]));
  if (length(sub(ref[1], ref[0])) < 0.01 || len < 0.01)
    throw Error("Trasédelen er for kort for parallellbinding.");
  c.orientation ??= dot(sub(follower[1], follower[0]), d) < 0 ? -1 : 1;
  if (
    follower.every(
      (pt) => Math.abs(dot(sub(pt, ref[0]), n) - c.distance) < 1e-10,
    ) &&
    dot(sub(follower[1], follower[0]), d) * c.orientation > 0
  )
    return p;
  const middle = mul(add(follower[0], follower[1]), 0.5),
    target = add(
      add(ref[0], mul(d, dot(sub(middle, ref[0]), d))),
      mul(n, c.distance),
    ),
    half = mul(d, (c.orientation * len) / 2);
  setPoint(p, c.follower, 0, sub(target, half));
  setPoint(p, c.follower, 1, add(target, half));
  return p;
}
export function enforceParallels(p) {
  for (const c of p.layout.parallelConstraints ?? [])
    for (const key of ["reference", "follower"]) {
      const r = p.layout.routes.find((r) => r.id === c[key].routeId);
      if (!r) continue;
      const bend = r.bends[c[key].edge];
      if (bend && c[key].leg === "whole") c[key].leg = "in";
      if (!bend && c[key].leg !== "whole") c[key].leg = "whole";
    }
  const pending = [...validateParallels(p)],
    followers = new Set(pending.map((c) => c.follower.routeId)),
    done = new Set();
  while (pending.length) {
    const index = pending.findIndex(
        (c) =>
          !followers.has(c.reference.routeId) || done.has(c.reference.routeId),
      ),
      c = pending.splice(index, 1)[0];
    applyParallel(p, c);
    done.add(c.follower.routeId);
  }
  return p;
}
export function parallelCandidate(p, routeId, edge, distance, zoom = 1) {
  if (!Number.isFinite(distance) || distance < 0.1 || distance > 5000)
    return null;
  let best = null;
  const list = segments(p),
    existing = p.layout.parallelConstraints ?? [];
  const descendants = new Set([routeId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const c of existing)
      if (
        descendants.has(c.reference.routeId) &&
        !descendants.has(c.follower.routeId)
      ) {
        descendants.add(c.follower.routeId);
        expanded = true;
      }
  }
  for (const follower of list.filter(
    (s) => s.routeId === routeId && s.edge === edge,
  ))
    for (const reference of list.filter((s) => !descendants.has(s.routeId))) {
      const f = segmentPoints(p, follower),
        r = segmentPoints(p, reference);
      if (f.some((pt) => r.includes(pt))) continue;
      const fd = unit(sub(f[1], f[0])),
        d = unit(sub(r[1], r[0])),
        n = normal(d);
      if (Math.abs(dot(fd, d)) < 0.985 || length(sub(r[1], r[0])) < 1) continue;
      const a = dot(sub(f[0], r[0]), d),
        b = dot(sub(f[1], r[0]), d);
      if (Math.max(a, b) < 0 || Math.min(a, b) > length(sub(r[1], r[0])))
        continue;
      const signed = (dot(sub(f[0], r[0]), n) + dot(sub(f[1], r[0]), n)) / 2,
        desired = (signed < 0 ? -1 : 1) * distance,
        error = Math.max(
          ...f.map((pt) => Math.abs(dot(sub(pt, r[0]), n) - desired)),
        );
      if (error > 7 / zoom || (best && best.error <= error)) continue;
      const centre = mul(add(f[0], f[1]), 0.5),
        onReference = add(r[0], mul(d, dot(sub(centre, r[0]), d))),
        onOffset = add(onReference, mul(n, desired));
      best = {
        id: crypto.randomUUID(),
        reference,
        follower,
        distance: desired,
        error,
        guide: {
          kind: "parallel-offset",
          a: onReference,
          b: onOffset,
          label: `${Math.abs(signed).toFixed(2)} → ${distance.toFixed(2)} mm ∥`,
        },
        line: { a: add(r[0], mul(n, desired)), b: add(r[1], mul(n, desired)) },
      };
    }
  return best;
}
export function translateRoute(p, routeId, dx, dy) {
  const r = p.layout.routes.find((r) => r.id === routeId);
  for (const id of new Set(r.stationIds)) {
    const s = p.layout.stations.find((s) => s.id === id);
    s.x += dx;
    s.y += dy;
    for (const h of s.ringCenters ?? []) {
      h.x += dx;
      h.y += dy;
    }
  }
  for (const b of Object.values(r.bends)) {
    b.x += dx;
    b.y += dy;
  }
  for (const c of Object.values(r.controls))
    if (c.shape) {
      c.shape.x += dx;
      c.shape.y += dy;
    }
  return p;
}
