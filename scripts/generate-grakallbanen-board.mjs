import fs from "node:fs";

const profile = JSON.parse(fs.readFileSync("config/routes/atb-line-9-grakallbanen.json", "utf8"));
const nodes = [];
for (let stopIndex = 0; stopIndex < profile.stops.length; stopIndex++) {
  const stop = profile.stops[stopIndex];
  nodes.push({ id: `vled-${stop.vled}`, name: stop.name, led: stop.vled, stopIds: [stop.id], routes: [profile.id], type: "station" });
  const segment = stop.segmentToNext;
  if (!segment) continue;
  for (let offset = 0; offset < segment.vledCount; offset++) {
    const led = segment.vledStart + offset;
    nodes.push({ id: `vled-${led}`, name: `${stop.name} â€“ ${profile.stops[stopIndex + 1].name} ${offset + 1}/${segment.vledCount}`, led, stopIds: [], routes: [profile.id], type: "segment" });
  }
}
nodes.sort((a, b) => a.led - b.led);
const board = {
  schemaVersion: 1, id: "grakallbanen-board", name: "GrÃ¥kallbanen", layout: "linear-route-vled",
  positioning: "vehicle-proximity", routes: [profile.id], leds: { count: 47, dataPin: 2, brightnessLimit: 32 }, nodes,
  render: { collisionMode: "unknown-direction", departureAfterglowSeconds: 10, freshnessSeconds: 120, arrivalRadiusMeters: 65, maximumTrackDistanceMeters: 250 },
  status: "worker-boardclient-test-ready"
};
const hardware = {
  schemaVersion: 1, boardProfile: board.id, leds: { count: 47, dataPin: 2, brightnessLimit: 32 },
  assignments: nodes.map(node => ({ logicalLed: node.led, physicalLed: node.led }))
};
fs.writeFileSync("config/boards/grakallbanen-board.json", JSON.stringify(board, null, 2) + "\n");
fs.writeFileSync("config/hardware/grakallbanen-board-hardware.json", JSON.stringify(hardware, null, 2) + "\n");

