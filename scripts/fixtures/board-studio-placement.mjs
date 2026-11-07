import { createProject } from "../../web/board-studio/model.mjs";
import { stationTemplate } from "../../web/board-studio/stations.mjs";
import { builtInSymbols } from "../../web/board-studio/symbols.mjs";
import { newProfile, newSegment } from "../../web/board-studio/led-layout.mjs";
export function placementFixture({ angleA = 0, angleB = 0 } = {}) {
  const p = createProject(false),
    profile = newProfile();
  profile.id = "placement-profile";
  p.ledLayout.profiles.push(profile);
  p.ledLayout.segments = [
    newSegment(p, profile.id, {
      id: "strip-A",
      name: "Stripe A",
      number: 1,
      x: 55,
      y: 100,
      angle: angleA,
      count: 16,
      length: 160,
      startIndex: 10,
      chainId: "chain-A",
    }),
    newSegment(p, profile.id, {
      id: "strip-B",
      name: "Stripe B",
      number: 2,
      x: 55,
      y: 140,
      angle: angleB,
      count: 16,
      length: 160,
      startIndex: 100,
      direction: -1,
      chainId: "chain-B",
    }),
  ];
  p.layers.holes.visible = true;
  p.layers.leds.visible = true;
  p.layers.strips.visible = true;
  return p;
}
export function placementSymbols() {
  const p = createProject(true);
  return builtInSymbols(stationTemplate(p, p.layout.stations[0]));
}
