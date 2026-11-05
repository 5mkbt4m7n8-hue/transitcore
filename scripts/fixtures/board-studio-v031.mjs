import { createProject, parseProject } from "../../web/board-studio/model.mjs";
import {
  stationTemplate,
  fromTemplate,
} from "../../web/board-studio/stations.mjs";
import { newConnection } from "../../web/board-studio/connections.mjs";
import { newProfile, newSegment } from "../../web/board-studio/led-layout.mjs";
export function connectionFixture(overlap = false) {
  const p = createProject(false),
    base = createProject(),
    t = stationTemplate(base, base.layout.stations[0]);
  t.appearance.points = 2;
  t.appearance.symbolAngle = 90;
  t.holeOffsets = [
    { x: 0, y: -5 },
    { x: 0, y: 5 },
  ];
  delete t.ringOffsets;
  p.layout.stations = [
    [40, 80],
    [105, 80],
    [170, 110],
    [235, 110],
  ].map(([x, y], i) => ({
    ...fromTemplate(t, { x, y }, "s" + i),
    name: "ABCD"[i],
  }));
  p.layout.routes = [
    {
      ...newConnection(p, ["s0", "s1", "s2", "s3"]),
      id: "main",
      tracks: 2,
      controls: {
        0: { startReach: 15, endReach: 15 },
        2: { startReach: 15, endReach: 15 },
      },
    },
  ];
  if (overlap)
    p.layout.routes.push({ ...newConnection(p, ["s1", "s2"]), id: "other" });
  return parseProject(p);
}
export function ledFixture(angle = 0) {
  const p = createProject(false),
    base = createProject(),
    t = stationTemplate(base, base.layout.stations[0]);
  t.appearance.points = 2;
  t.appearance.symbolAngle = 90;
  t.holeOffsets = [
    { x: 0, y: -5 },
    { x: 0, y: 5 },
  ];
  delete t.ringOffsets;
  p.layout.stations = [fromTemplate(t, { x: 75, y: 140 }, "double")];
  const profile = newProfile();
  p.ledLayout.profiles = [profile];
  p.ledLayout.segments = [
    newSegment(p, profile.id, {
      id: "strip",
      x: 60,
      y: 80,
      count: 12,
      length: 120,
      angle,
    }),
  ];
  p.layers.leds.visible = true;
  p.layers.strips.visible = true;
  return parseProject(p);
}
