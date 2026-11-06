import { stationPorts, stationPort } from "./ports.mjs";
import { symbolCenters, symbolNormal } from "./geometry.mjs";
import { initializePoints, pointStyle, activeHole } from "./point-style.mjs";
const clone = (x) => structuredClone(x);
function station(p, id) {
  const q = clone(p),
    s = q.layout.stations.find((s) => s.id === id);
  if (!s) throw Error("Velg en stasjon.");
  if (q.layers.rings.locked || q.layers.capsules.locked)
    throw Error("Grafikklaget er låst.");
  initializePoints(s);
  s.ringCenters = symbolCenters(q, s).map(({ x, y }) => ({ x, y }));
  return { q, s };
}
function remapPorts(q, s, removed) {
  for (const r of q.layout.routes)
    for (const [edge, ends] of Object.entries(r.anchors ?? {}))
      for (const [end, offset] of [
        ["start", 0],
        ["end", 1],
      ]) {
        if (
          r.stationIds[+edge + offset] !== s.id ||
          !ends[end]?.startsWith("point:")
        )
          continue;
        const parts = ends[end].split(":"),
          old = +parts[1];
        if (old === removed) {
          r.detachedPorts ??= [];
          r.detachedPorts.push({
            edge: +edge,
            stationId: s.id,
            port: ends[end],
          });
          delete r.anchors[edge];
          break;
        }
        if (old > removed) ends[end] = `point:${old - 1}:${parts[2]}`;
      }
}
export function editStation(
  p,
  id,
  { count, removeIndex, spacing, angle, uniform = false } = {},
) {
  const { q, s } = station(p, id);
  const oldCount = s.points,
    oldPorts = new Map();
  for (const r of p.layout.routes)
    for (const [edge, ends] of Object.entries(r.anchors ?? {}))
      for (const [end, offset] of [
        ["start", 0],
        ["end", 1],
      ])
        if (r.stationIds[+edge + offset] === id)
          oldPorts.set(`${r.id}:${edge}:${end}`, stationPort(p, id, ends[end]));
  if (
    count !== undefined &&
    (!Number.isInteger(count) || count < 1 || count > 8)
  )
    throw Error("Antall punkter må være et heltall fra 1 til 8.");
  const desired =
    count ?? (removeIndex !== undefined ? s.points - 1 : s.points);
  if (desired < 1) throw Error("Stasjonen må beholde minst ett punkt.");
  while (s.points > desired) {
    const index = removeIndex ?? s.points - 1;
    if (!Number.isInteger(index) || index < 0 || index >= s.points)
      throw Error("Velg punktet som skal fjernes.");
    if (
      (activeHole(s.holes[index]) && q.layers.holes.locked) ||
      (q.ledLayout.bindings.some(
        (b) => b.stationId === id && b.pointIndex === index,
      ) &&
        q.layers.bindings.locked)
    )
      throw Error("Lås opp hull-/bindingslaget før dette punktet fjernes.");
    const pointId = s.pointIds[index];
    s.pointIds.splice(index, 1);
    delete s.pointStyles[pointId];
    s.ringCenters.splice(index, 1);
    s.holes.splice(index, 1);
    s.points--;
    q.ledLayout.bindings = q.ledLayout.bindings.filter(
      (b) => !(b.stationId === id && b.pointIndex === index),
    );
    for (const b of q.ledLayout.bindings)
      if (b.stationId === id && b.pointIndex > index) b.pointIndex--;
    remapPorts(q, s, index);
  }
  while (s.points < desired) {
    const direction = symbolNormal(q, s),
      last = s.ringCenters.at(-1),
      point = {
        x: last.x + direction.x * s.pointSpacing,
        y: last.y + direction.y * s.pointSpacing,
      },
      pointId = crypto.randomUUID();
    s.pointIds.push(pointId);
    s.ringCenters.push(point);
    s.holes.push({ id: `${pointId}:hole`, ...point, enabled: false });
    s.points++;
  }
  if (spacing !== undefined) {
    if (!Number.isFinite(spacing) || spacing < 0.1 || spacing > 10000)
      throw Error("Punktavstand må være 0,1–10000 mm.");
    const factor = spacing / s.pointSpacing;
    s.ringCenters = s.ringCenters.map((c) => ({
      x: s.x + (c.x - s.x) * factor,
      y: s.y + (c.y - s.y) * factor,
    }));
    s.pointSpacing = spacing;
  }
  if (angle === null) {
    const n = symbolNormal(q, {
      ...s,
      ringCenters: undefined,
      symbolAngle: null,
    });
    const target = (Math.atan2(n.y, n.x) * 180) / Math.PI;
    const result = editStation(q, id, { angle: target });
    result.layout.stations.find((t) => t.id === id).symbolAngle = null;
    return result;
  }
  if (angle !== undefined) {
    if (!Number.isFinite(angle) || Math.abs(angle) > 360)
      throw Error("Vinkel må være −360° til 360°.");
    const old = symbolNormal(q, s),
      delta = (angle * Math.PI) / 180 - Math.atan2(old.y, old.x);
    s.ringCenters = s.ringCenters.map((c) => ({
      x: s.x + (c.x - s.x) * Math.cos(delta) - (c.y - s.y) * Math.sin(delta),
      y: s.y + (c.x - s.x) * Math.sin(delta) + (c.y - s.y) * Math.cos(delta),
    }));
    s.symbolAngle = angle;
  }
  if (uniform) {
    const n = symbolNormal(q, s);
    s.ringCenters = Array.from({ length: s.points }, (_, i) => ({
      x: s.x + n.x * (i - (s.points - 1) / 2 + s.splitBias) * s.pointSpacing,
      y: s.y + n.y * (i - (s.points - 1) / 2 + s.splitBias) * s.pointSpacing,
    }));
  }
  if (s.points !== oldCount) {
    const ports = stationPorts(q, s);
    for (const r of q.layout.routes)
      for (const [edge, ends] of Object.entries(r.anchors ?? {}))
        for (const [end, offset] of [
          ["start", 0],
          ["end", 1],
        ]) {
          if (r.stationIds[+edge + offset] !== id) continue;
          const old = oldPorts.get(`${r.id}:${edge}:${end}`);
          if (!old) continue;
          const current = ends[end],
            index = current.startsWith("point:") ? +current.split(":")[1] : 0,
            candidates = ports.filter((port) =>
              current.startsWith("pair:") && s.points > 1
                ? port.id.startsWith("pair:")
                : port.id.startsWith(`point:${index}:`),
            );
          const nearest = candidates.sort(
            (a, b) =>
              b.direction.x * old.direction.x +
              b.direction.y * old.direction.y -
              (a.direction.x * old.direction.x +
                a.direction.y * old.direction.y),
          )[0];
          if (nearest && nearest.id !== current) {
            ends[end] = nearest.id;
            (r.detachedPorts ??= []).push({
              edge: +edge,
              stationId: id,
              port: current,
              nextPort: nearest.id,
              kind: "remapped",
            });
          }
        }
  }
  if (s.points !== 2 && ["cross-strip", "double-strip"].includes(s.symbolKind))
    s.symbolKind = "custom";
  return q;
}
export function editGraphicPoint(
  p,
  id,
  index,
  { x, y, ringOuter, ringInner, stroke, inherit = false } = {},
) {
  const { q, s } = station(p, id);
  if (!Number.isInteger(index) || index < 0 || index >= s.points)
    throw Error("Velg et gyldig punkt.");
  if (x !== undefined || y !== undefined) {
    if (
      [x ?? s.ringCenters[index].x, y ?? s.ringCenters[index].y].some(
        (v) => !Number.isFinite(v) || v < -5000 || v > 10000,
      )
    )
      throw Error("Punktets X/Y må være endelige millimetermål.");
    s.ringCenters[index] = {
      x: x ?? s.ringCenters[index].x,
      y: y ?? s.ringCenters[index].y,
    };
  }
  const key = s.pointIds[index];
  if (inherit) delete s.pointStyles[key];
  else
    for (const [name, value] of Object.entries({
      ringOuter,
      ringInner,
      stroke,
    })) {
      if (value === undefined) continue;
      if (value === null) {
        if (s.pointStyles[key]) delete s.pointStyles[key][name];
      } else {
        if (
          !Number.isFinite(value) ||
          value < (name === "ringInner" ? 0 : name === "stroke" ? 0.01 : 0.1) ||
          value > 100
        )
          throw Error(
            `Ugyldig ${name}: bruk positivt millimetermål, maks 100.`,
          );
        (s.pointStyles[key] ??= {})[name] = value;
      }
    }
  return q;
}
export function fitPointSizes(p, id) {
  const { q, s } = station(p, id);
  let gap = Infinity;
  for (let i = 0; i < s.points; i++)
    for (let j = i + 1; j < s.points; j++)
      gap = Math.min(
        gap,
        Math.hypot(
          s.ringCenters[i].x - s.ringCenters[j].x,
          s.ringCenters[i].y - s.ringCenters[j].y,
        ),
      );
  if (!Number.isFinite(gap))
    throw Error("Velg en stasjon med minst to punkter.");
  const limit = Math.max(0.1, gap * 0.85),
    styles = s.pointIds.map((_, i) => pointStyle(s, i)),
    overrides = structuredClone(s.pointStyles),
    oldOuter = s.ringOuter;
  s.ringOuter = Math.min(s.ringOuter, limit);
  s.ringInner = Math.min((s.ringInner * s.ringOuter) / oldOuter, s.ringOuter);
  s.stroke = Math.min(s.stroke, s.ringOuter / 10);
  s.pointStyles = {};
  let largest = s.ringOuter;
  for (let i = 0; i < s.points; i++) {
    const old = styles[i],
      outer = Math.min(old.ringOuter, limit),
      next = {
        ringOuter: outer,
        ringInner: Math.min((old.ringInner * outer) / old.ringOuter, outer),
        stroke: Math.min(old.stroke, outer / 10),
      },
      own = overrides[s.pointIds[i]] ?? {},
      patch = {};
    largest = Math.max(largest, outer);
    for (const key of ["ringOuter", "ringInner", "stroke"])
      if (own[key] !== undefined || Math.abs(next[key] - s[key]) > 1e-8)
        patch[key] = next[key];
    if (Object.keys(patch).length) s.pointStyles[s.pointIds[i]] = patch;
  }
  s.capsulePadding = Math.min(
    s.capsulePadding,
    Math.max(0, (gap - largest) / 2),
  );
  return q;
}
export function setHoleEnabled(p, id, index, enabled) {
  const q = clone(p),
    s = q.layout.stations.find((s) => s.id === id);
  if (!s?.holes[index]) throw Error("Velg et gyldig hull.");
  if (q.layers.holes.locked) throw Error("Hullaget er låst.");
  if (
    !enabled &&
    q.ledLayout.bindings.some(
      (b) => b.stationId === id && b.pointIndex === index,
    )
  )
    throw Error("Løsne LED-bindingen før hullet deaktiveres.");
  if (enabled && !activeHole(s.holes[index])) {
    const c = symbolCenters(q, s)[index];
    Object.assign(s.holes[index], { x: c.x, y: c.y });
  }
  s.holes[index].enabled = !!enabled;
  return q;
}
export function moveGraphicStation(p, ids, dx, dy) {
  const q = clone(p);
  if (
    q.layers.rings.locked ||
    q.layers.capsules.locked ||
    q.layers.names.locked
  )
    throw Error("Grafikklaget er låst.");
  for (const s of q.layout.stations)
    if (ids.includes(s.id)) {
      const centers = symbolCenters(q, s);
      s.x += dx;
      s.y += dy;
      s.ringCenters = centers.map((c) => ({ x: c.x + dx, y: c.y + dy }));
    }
  return q;
}
