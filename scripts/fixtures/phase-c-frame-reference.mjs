// Frozen Phase C reference (main 6ae617e); test-only. Do not refactor with production.
export const SIGNAL_POLICY = Object.freeze({
  version: 1,
  approachPulseMs: 1800,
  departureAfterglowSeconds: 10,
  atStopConfirmationSeconds: 10,
  parkedAfterSeconds: 300,
  parkedMovementThresholdMeters: 15,
  stationDepartureMovementMeters: 15,
  parkedRgb: Object.freeze([255, 0, 0]),
  fullBrightness: 32,
  afterglowBrightness: 8,
  priorities: Object.freeze({ OFF: 0, PASSED: 1, APPROACHING: 2, AT_STOP: 3, PARKED: 4 })
});

const GRAKALL_BOARD_IDS = new Set(["grakallbanen-board", "grakallbanen-prototype-board"]);
const rad = value => value * Math.PI / 180;
function distance(a, b) {
  const radius = 6371000;
  const p1 = rad(a.lat), p2 = rad(b.lat);
  const dp = rad(b.lat - a.lat), dl = rad(b.lon - a.lon);
  const value = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function color(profile, destination = "") {
  const text = destination.toLowerCase();
  const direction = profile.directions?.find(item => item.destinationMatches.some(value => text.includes(value.toLowerCase())));
  return direction?.color || profile.line.color || profile.directions?.[0]?.color || "#60a5fa";
}

function rgb(hex) {
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

export function buildFrame({ board, profiles, hardware, vehicles, now = Date.now() }) {
  validateConfiguration(board, profiles, hardware);
  const byLine = new Map(profiles.map(profile => [String(profile.line.publicCode), profile]));
  const physical = new Map(hardware.assignments.map(item => [item.logicalLed, item.physicalLed]));
  const dedupe = new Map();
  for (const vehicle of vehicles) {
    const profile = byLine.get(String(vehicle.line?.publicCode || ""));
    const updated = Date.parse(vehicle.lastUpdated || "");
    if (!profile || !vehicleAllowedByBoard(board, profile, vehicle.destinationName) || vehicle.location?.latitude == null || !Number.isFinite(updated) || (now - updated) / 1000 > board.render.freshnessSeconds) continue;
    const previous = dedupe.get(vehicle.vehicleId);
    if (!previous || updated > previous.updated) dedupe.set(vehicle.vehicleId, { vehicleId: String(vehicle.vehicleId || ""), profile, updated, destination: vehicle.destinationName || "", lat: Number(vehicle.location.latitude), lon: Number(vehicle.location.longitude) });
  }
  const strongest = new Map(), occupantsByLed = new Map();
  for (const vehicle of dedupe.values()) {
    const routeNodes = board.nodes.filter(node => node.routes.includes(vehicle.profile.id));
    const directionNodes = routeNodes.filter(node => matchesDirection(node, vehicle.profile, vehicle.destination));
    const hasDirectionMetadata = routeNodes.some(node => node.routeDirections?.[vehicle.profile.id]);
    // A nearest-node fallback is unsafe on double-track boards: an unknown
    // destination can otherwise activate the opposite direction's LED.
    if (hasDirectionMetadata && !directionNodes.length) continue;
    const candidates = directionNodes.length ? directionNodes : routeNodes;
    let node, meters = Infinity;
    for (const candidate of candidates) {
      const value = distance(vehicle, candidate);
      if (value < meters) { node = candidate; meters = value; }
    }
    const approachRadius = board.render.approachRadiusMeters ?? 250;
    const arrivalRadius = board.render.arrivalRadiusMeters ?? 85;
    if (!node || meters > approachRadius) continue;
    const state = meters <= arrivalRadius ? "AT_STOP" : "APPROACHING";
    const id = physical.get(node.led);
    const candidate = { id, profile: vehicle.profile, vehicleId: vehicle.vehicleId, updated: vehicle.updated, destination: vehicle.destination, state, meters, lat: vehicle.lat, lon: vehicle.lon };
    const occupants = occupantsByLed.get(id) || [];
    occupants.push(candidate);
    occupantsByLed.set(id, occupants);
    const previous = strongest.get(id);
    if (!previous || state === "AT_STOP" && previous.state !== "AT_STOP" || state === previous.state && meters < previous.meters) strongest.set(id, candidate);
  }
  const occupantJson = item => ({
    id: item.vehicleId,
    line: String(item.profile.line.publicCode),
    destination: item.destination,
    rgb: rgb(board.render.lineColors?.[item.profile.line.publicCode] || item.profile.line.color || color(item.profile, item.destination)),
    state: item.state,
    ageSeconds: Math.max(0, Math.floor((now - item.updated) / 1000)),
    distanceMeters: Math.round(item.meters)
  });
  return {
    schemaVersion: 1,
    boardProfile: board.id,
    profileRevision: board.profileRevision ?? 1,
    profileFingerprint: board.profileFingerprint || "",
    generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000),
    ttlSeconds: 30,
    ledCount: hardware.leds?.count ?? board.leds.count,
    motionPolicy: { atStopConfirmationSeconds: Math.max(0, Number(board.render.atStopConfirmationSeconds) || 0) },
    leds: [...strongest.values()].sort((a, b) => a.id - b.id).map(item => {
      const occupants = (occupantsByLed.get(item.id) || []).sort((a, b) => {
        const priority = value => value.state === "AT_STOP" ? 2 : value.state === "APPROACHING" ? 1 : 0;
        return priority(b) - priority(a) || a.meters - b.meters;
      }).map(occupantJson);
      return {
        id: item.id,
        rgb: rgb(board.render.lineColors?.[item.profile.line.publicCode] || item.profile.line.color || color(item.profile, item.destination)),
        brightness: Math.min(SIGNAL_POLICY.fullBrightness, hardware.leds?.brightnessLimit ?? SIGNAL_POLICY.fullBrightness),
        state: item.state,
        vehicle: {
          id: item.vehicleId,
          line: String(item.profile.line.publicCode),
          destination: item.destination,
          ageSeconds: Math.max(0, Math.floor((now - item.updated) / 1000)),
          distanceMeters: Math.round(item.meters),
          latitude: item.lat,
          longitude: item.lon
        },
        occupants
      };
    })
  };
}

function nearestRoutePosition(profile, vehicle) {
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

export function buildLinearRouteFrame({ board, profiles, hardware, vehicles, now = Date.now() }) {
  validateConfiguration(board, profiles, hardware);
  const profile = profiles[0];
  const physical = new Map(hardware.assignments.map(item => [item.logicalLed, item.physicalLed]));
  const stationByStop = new Map();
  for (const node of board.nodes) if (node.type === "station") for (const stopId of node.stopIds || []) stationByStop.set(stopId, node);
  const segmentNodes = index => {
    const from = stationByStop.get(profile.stops[index]?.id), to = stationByStop.get(profile.stops[index + 1]?.id);
    if (!from || !to) return [];
    const low = Math.min(from.led, to.led), high = Math.max(from.led, to.led);
    const nodes = board.nodes.filter(node => node.type === "segment" && node.led > low && node.led < high).sort((a, b) => a.led - b.led);
    return from.led < to.led ? nodes : nodes.reverse();
  };
  const dedupe = new Map();
  for (const raw of vehicles) {
    const updated = Date.parse(raw.lastUpdated || "");
    if (String(raw.line?.publicCode || "") !== String(profile.line.publicCode) || !vehicleAllowedByBoard(board, profile, raw.destinationName) || raw.location?.latitude == null ||
        !Number.isFinite(updated) || (now - updated) / 1000 > board.render.freshnessSeconds) continue;
    const previous = dedupe.get(raw.vehicleId);
    if (!previous || updated > previous.updated) dedupe.set(raw.vehicleId, {
      vehicleId: String(raw.vehicleId), updated, destination: raw.destinationName || "", lat: Number(raw.location.latitude), lon: Number(raw.location.longitude)
    });
  }
  const strongest = new Map(), occupantsByLed = new Map();
  for (const vehicle of dedupe.values()) {
    let nearestStopIndex = -1, stopMeters = Infinity;
    profile.stops.forEach((stop, index) => {
      const meters = distance(vehicle, stop);
      if (meters < stopMeters) { nearestStopIndex = index; stopMeters = meters; }
    });
    // A tram may change its headsign while it is still turning at Ila or Lian.
    // Prefer either endpoint throughout the wider terminal zone, even after
    // the adjacent stop becomes geometrically closer. This prevents a parked
    // tram at Ila from jumping to Bergsli gate merely because its headsign
    // has already changed to Lian.
    const arrivalRadius = Number(board.render.arrivalRadiusMeters) || 65;
    const terminalArrivalRadius = Math.max(arrivalRadius, Number(board.render.terminalArrivalRadiusMeters) || arrivalRadius);
    const terminalIndexes = profile.stops.length > 1 ? [0, profile.stops.length - 1] : [0];
    let nearestTerminalIndex = -1, terminalMeters = Infinity;
    for (const index of terminalIndexes) {
      const meters = distance(vehicle, profile.stops[index]);
      if (meters < terminalMeters) { nearestTerminalIndex = index; terminalMeters = meters; }
    }
    if (nearestTerminalIndex >= 0 && terminalMeters <= terminalArrivalRadius) {
      nearestStopIndex = nearestTerminalIndex;
      stopMeters = terminalMeters;
    }
    const nearestStationNode = nearestStopIndex >= 0 ? stationByStop.get(profile.stops[nearestStopIndex].id) : null;
    const nearestStationLed = nearestStationNode ? physical.get(nearestStationNode.led) : null;
    const isTerminalStation = nearestStopIndex === 0 || nearestStopIndex === profile.stops.length - 1;
    const stationArrivalRadius = isTerminalStation
      ? terminalArrivalRadius
      : arrivalRadius;
    let logicalLed, state, meters, positionType;
    if (nearestStopIndex >= 0 && stopMeters <= stationArrivalRadius) {
      logicalLed = nearestStationNode?.led ?? profile.stops[nearestStopIndex].vled;
      state = "AT_STOP";
      meters = stopMeters;
      positionType = "station";
    } else {
      const route = nearestRoutePosition(profile, vehicle);
      if (!route || route.meters > board.render.maximumTrackDistanceMeters) continue;
      const configured = segmentNodes(route.index), legacy = profile.stops[route.index].segmentToNext;
      if (configured.length) logicalLed = configured[Math.min(configured.length - 1, Math.floor(route.progress * configured.length))].led;
      else if (stationByStop.size) {
        // A station-only prototype has no physical LEDs between stops. Keep the
        // tram visible by pulsing the station it is travelling towards.
        const direction = profile.directions?.find(item =>
          (item.destinationMatches || []).some(value => String(vehicle.destination || "").toLowerCase().includes(String(value).toLowerCase()))
        );
        const targetIndex = direction?.reverseShape ? route.index : route.index + 1;
        const targetStation = stationByStop.get(profile.stops[targetIndex]?.id);
        if (!targetStation) continue;
        logicalLed = targetStation.led;
      }
      else {
        if (!legacy?.vledCount) continue;
        logicalLed = legacy.vledStart + Math.min(legacy.vledCount - 1, Math.floor(route.progress * legacy.vledCount));
      }
      state = "APPROACHING";
      meters = route.meters;
      positionType = configured.length ? "segment" : "station-approach";
    }
    const id = physical.get(logicalLed);
    const candidate = { id, state, meters, destination: vehicle.destination, vehicleId: vehicle.vehicleId, positionType, stationDistanceMeters: stopMeters, nearestStationLed, isTerminalStation, lat: vehicle.lat, lon: vehicle.lon };
    const occupants = occupantsByLed.get(id) || [];
    occupants.push(candidate);
    occupantsByLed.set(id, occupants);
    const previous = strongest.get(id);
    if (!previous || state === "AT_STOP" && previous.state !== "AT_STOP" || state === previous.state && meters < previous.meters) {
      strongest.set(id, candidate);
    }
  }
  return {
    schemaVersion: 1, boardProfile: board.id, profileRevision: board.profileRevision ?? 1, profileFingerprint: board.profileFingerprint || "", generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000), ttlSeconds: 30, ledCount: hardware.leds?.count ?? board.leds.count,
    motionPolicy: {
      stationDepartureRadiusMeters: Math.max(board.render.arrivalRadiusMeters, Number(board.render.stationDepartureRadiusMeters) || board.render.arrivalRadiusMeters),
      atStopConfirmationSeconds: Math.max(0, Number(board.render.atStopConfirmationSeconds ??
        (GRAKALL_BOARD_IDS.has(board.id) ? 0 : SIGNAL_POLICY.atStopConfirmationSeconds)) || 0)
    },
    leds: [...strongest.values()].sort((a, b) => a.id - b.id).map(item => ({
      id: item.id, rgb: rgb(color(profile, item.destination)),
      brightness: Math.min(SIGNAL_POLICY.fullBrightness, hardware.leds?.brightnessLimit ?? SIGNAL_POLICY.fullBrightness), state: item.state,
      // For a linear route, item.meters is lateral GPS error from the track,
      // not distance from a stop. Exposing it as distanceMeters made the
      // shared lifecycle falsely classify a moving tram as PASSED.
      vehicle: { id: item.vehicleId, line: String(profile.line.publicCode), destination: item.destination, positionType: item.positionType, stationDistanceMeters: Math.round(item.stationDistanceMeters), nearestStationLed: item.nearestStationLed, isTerminalStation: item.isTerminalStation, latitude: item.lat, longitude: item.lon },
      occupants: (occupantsByLed.get(item.id) || []).sort((a, b) => {
        const priority = value => value.state === "AT_STOP" ? 2 : value.state === "APPROACHING" ? 1 : 0;
        return priority(b) - priority(a) || a.meters - b.meters || a.vehicleId.localeCompare(b.vehicleId);
      }).map(value => ({
        id: value.vehicleId,
        line: String(profile.line.publicCode),
        destination: value.destination,
        rgb: rgb(color(profile, value.destination)),
        state: value.state,
        distanceMeters: Math.round(value.meters),
        stationDistanceMeters: Math.round(value.stationDistanceMeters),
        nearestStationLed: value.nearestStationLed,
        isTerminalStation: value.isTerminalStation,
        positionType: value.positionType,
        latitude: value.lat,
        longitude: value.lon
      }))
    }))
  };
}

export function frameFromStationArrivals(board, hardware, arrivals, now) {
  return {
    schemaVersion: 1,
    boardProfile: board.id,
    profileRevision: board.profileRevision ?? 1,
    profileFingerprint: board.profileFingerprint || "",
    generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000),
    ttlSeconds: 30,
    ledCount: hardware.leds?.count ?? board.leds.count,
    leds: arrivals.sort((a, b) => a.id - b.id).map(item => ({
      id: item.id,
      rgb: rgb(board.render.lineColors?.[item.profile.line.publicCode] || item.profile.line.color || color(item.profile, item.destination)),
      brightness: Math.min(SIGNAL_POLICY.fullBrightness, hardware.leds?.brightnessLimit ?? SIGNAL_POLICY.fullBrightness),
      state: item.state,
      vehicle: { id: item.vehicleId }
    }))
  };
}


