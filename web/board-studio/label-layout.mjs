import { symbolCenters, symbolNormal } from "./geometry.mjs";
import { pointStyle } from "./point-style.mjs";
export const DIRECTIONS = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  w: [-1, 0],
  center: [0, 0],
  e: [1, 0],
  sw: [-1, 1],
  s: [0, 1],
  se: [1, 1],
};
export const DIRECTION_NAMES = [
  "Oppe venstre",
  "Over",
  "Oppe høyre",
  "Venstre",
  "Midten",
  "Høyre",
  "Nede venstre",
  "Under",
  "Nede høyre",
];
export function visibleBounds(p, s, reference = "all") {
  const centers = symbolCenters(p, s),
    chosen =
      reference === "all"
        ? centers
        : centers.filter((c) => c.index === +reference);
  if (!chosen.length)
    throw Error("Tekstreferansen peker til et manglende stasjonspunkt.");
  const boxes = chosen.map((c) => {
    const t = pointStyle(s, c.index),
      r =
        (Math.max(t.ringOuter, s.doubleRing !== false ? t.ringInner : 0) +
          t.stroke) /
        2;
    return { x: c.x - r, y: c.y - r, right: c.x + r, bottom: c.y + r };
  });
  if (reference === "all" && s.capsuleType !== "none" && centers.length > 1) {
    const a = centers[0],
      n = symbolNormal(p, s),
      theta = Math.atan2(n.y, n.x) + ((s.markerAngle ?? 0) * Math.PI) / 180,
      co = Math.cos(theta),
      si = Math.sin(theta);
    const cs = centers.map((c) => ({
      x: (c.x - a.x) * co + (c.y - a.y) * si,
      y: -(c.x - a.x) * si + (c.y - a.y) * co,
      r: pointStyle(s, c.index).ringOuter / 2 + s.capsulePadding,
    }));
    const pad = s.capsuleStroke / 2,
      left =
        Math.min(...cs.map((c) => c.x - c.r)) -
        (s.capsuleExtraWidth ?? 0) / 2 -
        pad,
      right =
        Math.max(...cs.map((c) => c.x + c.r)) +
        (s.capsuleExtraWidth ?? 0) / 2 +
        pad,
      top =
        Math.min(...cs.map((c) => c.y - c.r)) -
        (s.capsuleExtraHeight ?? 0) / 2 -
        pad,
      bottom =
        Math.max(...cs.map((c) => c.y + c.r)) +
        (s.capsuleExtraHeight ?? 0) / 2 +
        pad;
    // Exact axis extents of the rendered rounded rectangle, including stroke.
    const stroke = s.capsuleStroke / 2,
      w = right - left - 2 * stroke,
      h = bottom - top - 2 * stroke,
      radius =
        s.capsuleType === "rounded-box"
          ? Math.min(Math.max(...cs.map((c) => c.r)), 2)
          : Math.min(w, h) / 2,
      cx = (left + right) / 2,
      cy = (top + bottom) / 2,
      px = a.x + (s.markerDx ?? 0) + cx * co - cy * si,
      py = a.y + (s.markerDy ?? 0) + cx * si + cy * co,
      ex =
        (w / 2 - radius) * Math.abs(co) +
        (h / 2 - radius) * Math.abs(si) +
        radius +
        stroke,
      ey =
        (w / 2 - radius) * Math.abs(si) +
        (h / 2 - radius) * Math.abs(co) +
        radius +
        stroke;
    boxes.push({ x: px - ex, y: py - ey, right: px + ex, bottom: py + ey });
  }
  return {
    x: Math.min(...boxes.map((b) => b.x)),
    y: Math.min(...boxes.map((b) => b.y)),
    right: Math.max(...boxes.map((b) => b.right)),
    bottom: Math.max(...boxes.map((b) => b.bottom)),
  };
}
// Browser SVG measurement uses the same SVG text engine as rendering/export.
let measureSvg;
export function textBounds(s) {
  const l = s.label;
  if (typeof document !== "undefined") {
    if (!measureSvg) {
      measureSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      measureSvg.style.cssText =
        "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
      document.body.append(measureSvg);
    }
    const t = document.createElementNS(measureSvg.namespaceURI, "text");
    for (const [k, v] of Object.entries({
      "text-rendering": "geometricPrecision",
      "font-family": l.font,
      "font-size": l.size,
      "font-weight": l.weight,
      "letter-spacing": l.spacing,
      "dominant-baseline": "middle",
    }))
      t.setAttribute(k, v);
    t.textContent = s.name;
    measureSvg.append(t);
    const b = t.getBBox(),
      r = { x: b.x, y: b.y, width: b.width, height: b.height };
    t.remove();
    return r;
  }
  return {
    x: 0,
    y: -l.size * 0.55,
    width: Math.max(
      0,
      s.name.length * l.size * 0.62 +
        Math.max(0, s.name.length - 1) * l.spacing,
    ),
    height: l.size,
  };
}
export function labelLayout(p, s) {
  const l = s.label,
    a = (l.angle * Math.PI) / 180,
    co = Math.cos(a),
    si = Math.sin(a),
    b = textBounds(s);
  if (!l.position) {
    const ax = s.x + l.dx,
      ay = s.y + l.dy,
      offset =
        l.anchor === "end"
          ? -b.width
          : l.anchor === "middle"
            ? -b.width / 2
            : 0;
    const corners = [
      [b.x + offset, b.y],
      [b.x + b.width + offset, b.y],
      [b.x + offset, b.y + b.height],
      [b.x + b.width + offset, b.y + b.height],
    ].map(([x, y]) => ({ x: ax + x * co - y * si, y: ay + x * si + y * co }));
    return {
      anchor: { x: ax, y: ay },
      transform: `rotate(${l.angle} ${ax} ${ay})`,
      x: ax,
      y: ay,
      textAnchor: l.anchor,
      bounds: bounds(corners),
    };
  }
  const shape = visibleBounds(p, s, l.reference ?? "all"),
    [dx, dy] = DIRECTIONS[l.position],
    gap = l.gap ?? 2,
    diagonal = dx && dy ? Math.SQRT1_2 : 1;
  const anchor = {
    x:
      (dx < 0 ? shape.x : dx > 0 ? shape.right : (shape.x + shape.right) / 2) +
      dx * gap * diagonal +
      l.dx,
    y:
      (dy < 0
        ? shape.y
        : dy > 0
          ? shape.bottom
          : (shape.y + shape.bottom) / 2) +
      dy * gap * diagonal +
      l.dy,
  };
  const corners = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x, b.y + b.height],
      [b.x + b.width, b.y + b.height],
    ].map(([x, y]) => ({ x: x * co - y * si, y: x * si + y * co })),
    r = bounds(corners),
    tx = dx < 0 ? -r.right : dx > 0 ? -r.x : -(r.x + r.right) / 2,
    ty = dy < 0 ? -r.bottom : dy > 0 ? -r.y : -(r.y + r.bottom) / 2;
  return {
    anchor,
    transform: `translate(${anchor.x + tx} ${anchor.y + ty}) rotate(${l.angle})`,
    x: 0,
    y: 0,
    textAnchor: "start",
    bounds: {
      x: r.x + anchor.x + tx,
      right: r.right + anchor.x + tx,
      y: r.y + anchor.y + ty,
      bottom: r.bottom + anchor.y + ty,
    },
  };
}
function bounds(cs) {
  return {
    x: Math.min(...cs.map((c) => c.x)),
    y: Math.min(...cs.map((c) => c.y)),
    right: Math.max(...cs.map((c) => c.x)),
    bottom: Math.max(...cs.map((c) => c.y)),
  };
}
export function editLabels(p, ids, patch) {
  const q = structuredClone(p);
  if (q.layers.names.locked) throw Error("Stasjonsnavn-laget er låst.");
  for (const s of q.layout.stations)
    if (ids.includes(s.id)) {
      Object.assign(s.label, patch);
      if (patch.position !== undefined) {
        s.label.dx = 0;
        s.label.dy = 0;
      }
    }
  return q;
}
export function validateLabel(l) {
  const finite = (v, a, b) =>
    typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
  if (
    !l ||
    typeof l !== "object" ||
    typeof l.font !== "string" ||
    !finite(l.dx, -5000, 5000) ||
    !finite(l.dy, -5000, 5000) ||
    !finite(l.angle, -360, 360) ||
    !finite(l.size, 0.1, 100) ||
    !finite(l.spacing, -10, 100) ||
    !finite(l.weight, 100, 900) ||
    !["start", "middle", "end"].includes(l.anchor)
  )
    throw Error(
      "Ugyldig tekststil: kontroller font, størrelse, vinkel og millimeterverdier.",
    );
  if (l.position !== undefined && !Object.hasOwn(DIRECTIONS, l.position))
    throw Error("Ugyldig navneplassering.");
  if (
    l.gap !== undefined &&
    (!Number.isFinite(l.gap) || l.gap < 0 || l.gap > 1000)
  )
    throw Error("Navneavstand må være 0–1000 mm.");
  if (l.color !== undefined && !/^#[0-9a-f]{6}$/i.test(l.color))
    throw Error("Ugyldig tekstfarge.");
  if (
    l.reference !== undefined &&
    l.reference !== "all" &&
    (!Number.isInteger(+l.reference) || +l.reference < 0 || +l.reference > 7)
  )
    throw Error("Ugyldig tekstreferanse.");
}
