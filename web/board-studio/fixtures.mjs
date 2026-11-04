import { createProject, copy, parseProject } from "./model.mjs";
export function geometryFixture() {
  const p = createProject(false);
  p.id = "geometry-regression-v02";
  p.title = "Geometriprøver · Board Studio v0.2";
  const template = createProject().layout.stations[0];
  const specs = [
    ["a", 35, 55, 90, 2, "90° · START"],
    ["b", 125, 115, 0, 2, "90° · SLUTT"],
    ["c", 35, 165, 90, 2, "ROTERT · START"],
    ["d", 205, 220, 0, 2, "ROTERT · SLUTT"],
    ["e", 35, 270, 90, 1, "ENKELTSPOR"],
    ["f", 205, 270, 90, 2, "DOBBELSTASJON"],
    ["g", 35, 325, 90, 2, "DOBBELTSPOR"],
    ["h", 205, 350, 90, 1, "ENKELSTASJON"],
  ];
  p.layout.stations = specs.map(([id, x, y, angle, points, name]) => ({
    ...copy(template),
    id,
    x,
    y,
    holes: undefined,
    symbolAngle: angle,
    points,
    name,
    label: {
      ...copy(template.label),
      dx: -8,
      dy: -15,
      size: 3.3,
      anchor: "start",
    },
  }));
  const base = createProject().layout.routes[0];
  p.layout.routes = [
    ["turn", ["a", "b"], 2, { 0: { x: 125, y: 55 } }],
    ["rotated", ["c", "d"], 2, {}],
    ["split", ["e", "f"], 1, {}],
    ["merge", ["g", "h"], 2, {}],
  ].map(([id, stationIds, tracks, bends]) => ({
    ...copy(base),
    id,
    stationIds,
    tracks,
    bends,
    trackIds: undefined,
    portSigns: undefined,
    controls: {},
    cornerRadius: 8,
    transitionLength: 32,
    tension: 0.5,
  }));
  return parseProject(p);
}
