import { createProject, parseProject } from "../../web/board-studio/model.mjs";
import {
  stationTemplate,
  fromTemplate,
} from "../../web/board-studio/stations.mjs";
import {
  newConnection,
  connectPorts,
} from "../../web/board-studio/connections.mjs";
export function portFixture() {
  const p = createProject(false),
    base = createProject(),
    template = stationTemplate(base, base.layout.stations[0]);
  template.appearance.points = 2;
  template.appearance.symbolAngle = 0;
  template.holeOffsets = [
    { x: -5, y: 0 },
    { x: 5, y: 0 },
  ];
  delete template.ringOffsets;
  p.id = "ports-v032";
  p.title = "Portvalg · hovedlinje og sidegren";
  p.layout.stations = [
    ["north", 70, 55, 0],
    ["junction", 70, 130, 0],
    ["south", 70, 205, 0],
    ["branch", 210, 230, 90],
    ["pair-a", 70, 300, 90],
    ["pair-b", 210, 340, 90],
  ].map(([id, x, y, angle]) => {
    const t = structuredClone(template);
    t.appearance.symbolAngle = angle;
    t.holeOffsets =
      angle === 90
        ? [
            { x: 0, y: -5 },
            { x: 0, y: 5 },
          ]
        : template.holeOffsets;
    return { ...fromTemplate(t, { x, y }, id), name: id };
  });
  p.routeDefaults = { ...newConnection(p, []), tracks: 2, trackSpacing: 10 };
  p.layout.routes = [];
  let q = parseProject(p);
  for (const [a, b] of [
    ["north", "junction"],
    ["junction", "south"],
  ])
    q = connectPorts(
      q,
      { stationId: a, portId: "pair:left" },
      { stationId: b, portId: "pair:right" },
    ).project;
  return parseProject(q);
}
