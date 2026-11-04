import { createProject, parseProject } from "./model.mjs";
import { stationTemplate, fromTemplate } from "./stations.mjs";
import { builtInSymbols } from "./symbols.mjs";
import { newProfile, newSegment, ledPositions } from "./led-layout.mjs";
import { bindPoint } from "./bindings.mjs";
export function trondheimPrototype() {
  let p = createProject(false);
  p.id = "trondheim-buss-fysisk-v03";
  p.title = "Trondheim buss · fysisk demonstrasjon (ikke ruteplan)";
  const profile = newProfile();
  profile.id = "ws2812b-2020-100m";
  p.ledLayout.profiles = [profile];
  const types = builtInSymbols(
      stationTemplate(createProject(), createProject().layout.stations[0]),
    ).filter((r) => r.category === "Trondheim buss"),
    names = [
      ["Ila", "Skansen", "Prinsen", "Solsiden"],
      ["Lerkendal", "Gløshaugen", "Bakkegata", "Moholt"],
      ["Tonstad", "Sluppen", "Tempe", "Ranheim"],
    ],
    slots = [[1, 2], [6], [10, 11], [18]];
  for (let row = 0; row < 3; row++) {
    const seg = newSegment(p, profile.id, {
      id: `strip-S0${row + 1}`,
      name: `S0${row + 1}`,
      number: row + 1,
      x: 30,
      y: 80 + row * 110,
      count: 24,
      length: 240,
      controllerId: "prototype-kontroller",
      chainId: `egen-kjede-${row + 1}`,
      cutPoints: [23],
    });
    p.ledLayout.segments.push(seg);
    const leds = ledPositions(p, seg);
    for (let col = 0; col < 4; col++) {
      const index = slots[col],
        x = index.reduce((n, i) => n + leds[i].x, 0) / index.length,
        t = structuredClone(
          types.find((r) =>
            r.id.endsWith(
              col === 0 ? "-capsule" : col === 2 ? "-double" : "-single",
            ),
          ).template,
        );
      t.label.size = 3.8;
      t.label.dx = 0;
      t.label.dy = -9;
      t.label.anchor = "middle";
      const s = fromTemplate(
        t,
        { x, y: seg.y },
        `bus-demo-${row + 1}-${col + 1}`,
      );
      s.name = names[row][col];
      p.layout.stations.push(s);
      for (let pointIndex = 0; pointIndex < index.length; pointIndex++)
        p = bindPoint(p, {
          stationId: s.id,
          pointIndex,
          segmentId: seg.id,
          ledId: leds[index[pointIndex]].id,
        });
    }
  }
  for (const b of p.ledLayout.bindings)
    b.id = `${b.stationId}:binding:${b.pointIndex}`;
  const route = createProject().layout.routes[0];
  p.layout.routes = Array.from({ length: 4 }, (_, col) => ({
    ...structuredClone(route),
    id: `grafisk-korridor-${col + 1}`,
    trackIds: undefined,
    portSigns: {},
    stationIds: Array.from(
      { length: 3 },
      (_, row) => `bus-demo-${row + 1}-${col + 1}`,
    ),
    tracks: 1,
    bends: {},
    cornerRadius: 8,
  }));
  p.layers.leds.visible = true;
  p.layers.strips.visible = true;
  p.layers.bindings.visible = true;
  p.layers.holes.visible = true;
  return parseProject(p);
}
