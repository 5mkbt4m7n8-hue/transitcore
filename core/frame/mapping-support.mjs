export const rad = value => value * Math.PI / 180;
export function distance(a, b) {
  const radius = 6371000;
  const p1 = rad(a.lat), p2 = rad(b.lat);
  const dp = rad(b.lat - a.lat), dl = rad(b.lon - a.lon);
  const value = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function color(profile, destination = "") {
  const text = destination.toLowerCase();
  const direction = profile.directions?.find(item => item.destinationMatches.some(value => text.includes(value.toLowerCase())));
  return direction?.color || profile.line.color || profile.directions?.[0]?.color || "#60a5fa";
}

export function rgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
}

function profileDirectionId(profile, destination) {
  const text = destination.toLowerCase();
  const direction = profile.directions?.find(item => item.destinationMatches.some(value => text.includes(value.toLowerCase())));
  return direction ? (direction.reverseShape ? "1" : "0") : null;
}

export function matchesDirection(node, profile, destination) {
  const routeDirection = node.routeDirections?.[profile.id];
  const text = destination.toLowerCase();
  const destinations = routeDirection?.destinationMatches || [];
  if (destinations.some(value => {
    const match = value.toLowerCase();
    return text.includes(match) || match.includes(text);
  })) return true;
  // GTFS destination evidence on the quay is stronger than shape orientation.
  // This matters on ring services and on profiles whose canonical shape is reversed.
  if (text && destinations.length) return false;
  const id = profileDirectionId(profile, destination);
  if (id != null) return routeDirection?.directionIds?.includes(id);
  return false;
}

export function vehicleAllowedByBoard(board, profile, destination) {
  const filter = board.render?.vehicleDirectionFilters?.[profile.id];
  if (!filter) return true;
  const text = String(destination || "").toLowerCase();
  return (filter.destinationMatches || []).some(value => {
    const match = String(value).toLowerCase();
    return text.includes(match) || match.includes(text);
  });
}

export function validateConfiguration(board, profiles, hardware) {
  if (hardware.schemaVersion !== 1 || hardware.boardProfile !== board.id) throw Error("Board/hardware profile mismatch");
  if (board.nodes.length !== board.leds.count || hardware.assignments?.length !== board.nodes.length) throw Error("LED count mismatch");
  const logical = new Set(), physical = new Set();
  for (const assignment of hardware.assignments) {
    if (!Number.isInteger(assignment.logicalLed) || !board.nodes.some(node => node.led === assignment.logicalLed) || logical.has(assignment.logicalLed)) throw Error(`Invalid logical LED ${assignment.logicalLed}`);
    if (!Number.isInteger(assignment.physicalLed) || assignment.physicalLed < 0 || assignment.physicalLed >= board.leds.count || physical.has(assignment.physicalLed)) throw Error(`Invalid physical LED ${assignment.physicalLed}`);
    logical.add(assignment.logicalLed); physical.add(assignment.physicalLed);
  }
  if (profiles.length !== board.routes.length) throw Error("Route profile count mismatch");
}

export function nearestRoutePosition(profile, vehicle) {
  let best = null;
  for (let index = 0; index < profile.stops.length - 1; index++) {
    const a = profile.stops[index], b = profile.stops[index + 1];
    const refLat = rad((vehicle.lat + a.lat + b.lat) / 3);
    const metersPerLon = 111320 * Math.cos(refLat), metersPerLat = 111320;
    const ax = a.lon * metersPerLon, ay = a.lat * metersPerLat;
    const bx = b.lon * metersPerLon, by = b.lat * metersPerLat;
    const px = vehicle.lon * metersPerLon, py = vehicle.lat * metersPerLat;
    const vx = bx - ax, vy = by - ay, lengthSquared = vx * vx + vy * vy;
    if (lengthSquared <= 0.001) continue;
    const progress = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSquared));
    const qx = ax + progress * vx, qy = ay + progress * vy;
    const meters = Math.hypot(px - qx, py - qy);
    if (!best || meters < best.meters) best = { index, progress, meters };
  }
  return best;
}
