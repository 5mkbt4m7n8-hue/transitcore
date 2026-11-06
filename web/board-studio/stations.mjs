import { initializePoints } from "./point-style.mjs";
import { symbolNormal, holeCenters, symbolCenters } from "./geometry.mjs";
// Deliberately allowlist appearance. Never copy source IDs, external identities,
// station IDs, hole IDs, or arbitrary LED/route bindings from the source object.
export const APPEARANCE = [
  "points",
  "pointSpacing",
  "symbolAngle",
  "splitBias",
  "ringOuter",
  "ringInner",
  "stroke",
  "holeDiameter",
  "capsulePadding",
  "capsuleStroke",
  "ringColor",
  "doubleRing",
  "capsuleType",
  "capsuleExtraWidth",
  "capsuleExtraHeight",
  "symbolKind",
  "allowShared",
  "transitionLength",
  "markerAngle",
  "markerDx",
  "markerDy",
];
export const STATION_DEFAULTS = {
  capsuleType: "stadium",
  capsuleExtraWidth: 0,
  capsuleExtraHeight: 0,
  symbolKind: "single",
  allowShared: false,
  transitionLength: null,
  markerAngle: 0,
  markerDx: 0,
  markerDy: 0,
};
const clone = (x) => structuredClone(x);
const labelStyle = (l) =>
  Object.fromEntries(
    [
      "dx",
      "dy",
      "angle",
      "size",
      "spacing",
      "weight",
      "font",
      "anchor",
      "position",
      "reference",
      "gap",
      "color",
    ]
      .filter((k) => l[k] !== undefined)
      .map((k) => [k, clone(l[k])]),
  );
export function stationTemplate(p, s) {
  const n = symbolNormal(p, s);
  return {
    version: 1,
    appearance: Object.fromEntries(
      APPEARANCE.map((key) => [
        key,
        key === "symbolAngle"
          ? (Math.atan2(n.y, n.x) * 180) / Math.PI
          : clone(s[key] ?? STATION_DEFAULTS[key]),
      ]),
    ),
    label: labelStyle(s.label),
    pointStyles: Array.from({ length: s.points }, (_, i) =>
      clone(s.pointStyles?.[s.pointIds?.[i]] ?? {}),
    ),
    ...(s.ringCenters
      ? {
          ringOffsets: symbolCenters(p, s).map((c) => ({
            x: c.x - s.x,
            y: c.y - s.y,
          })),
        }
      : {}),
    holeOffsets: (s.holes ?? holeCenters(p, s)).map((h) => ({
      x: h.x - s.x,
      y: h.y - s.y,
      ...(h.diameter !== undefined ? { diameter: h.diameter } : {}),
      ...(h.enabled === false ? { enabled: false } : {}),
    })),
  };
}
export function fromTemplate(template, point, id = crypto.randomUUID()) {
  const pointIds = Array.from(
    { length: template.appearance.points },
    (_, i) => `${id}:point:${i}`,
  );
  return {
    pointDataVersion: 1,
    pointIds,
    pointStyles: Object.fromEntries(
      pointIds
        .map((key, i) => [key, clone(template.pointStyles?.[i] ?? {})])
        .filter(([, style]) => Object.keys(style).length),
    ),
    id,
    name: "Ny stasjon",
    x: point.x,
    y: point.y,
    source: null,
    ...Object.fromEntries(
      APPEARANCE.map((k) => [
        k,
        clone(template.appearance[k] ?? STATION_DEFAULTS[k]),
      ]),
    ),
    label: {
      ...labelStyle(template.label),
      ...(template.label.reference !== undefined &&
      template.label.reference !== "all" &&
      +template.label.reference >= template.appearance.points
        ? { reference: "all" }
        : {}),
    },
    ...(template.ringOffsets
      ? {
          ringCenters: template.ringOffsets.map((c) => ({
            x: point.x + c.x,
            y: point.y + c.y,
          })),
        }
      : {}),
    holes: template.holeOffsets.map((h, i) => ({
      id: `${id}:hole:${i}`,
      x: point.x + h.x,
      y: point.y + h.y,
      ...(h.diameter !== undefined ? { diameter: h.diameter } : {}),
      ...(h.enabled === false ? { enabled: false } : {}),
    })),
  };
}
