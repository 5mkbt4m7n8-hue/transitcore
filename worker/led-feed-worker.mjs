const REPOSITORY = "https://raw.githubusercontent.com/5mkbt4m7n8-hue/transitcore/main";
const BOARD_IDS = new Set(["trondheim-bus-board", "oslo-metro-board", "grakallbanen-board"]);
const CLIENT_NAME = "lgb-transitcore-led-feed";
const CONFIG_TTL_MS = 5 * 60 * 1000;
const configCache = new Map();

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

function matchesDirection(node, profile, destination) {
  const routeDirection = node.routeDirections?.[profile.id];
  const id = profileDirectionId(profile, destination);
  if (id != null) return routeDirection?.directionIds?.includes(id);
  const text = destination.toLowerCase();
  return (routeDirection?.destinationMatches || []).some(value => {
    const match = value.toLowerCase();
    return text.includes(match) || match.includes(text);
  });
}

export function validateConfiguration(board, profiles, hardware) {
  if (!BOARD_IDS.has(board.id) || hardware.schemaVersion !== 1 || hardware.boardProfile !== board.id) throw Error("Board/hardware profile mismatch");
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
    if (!profile || vehicle.location?.latitude == null || !Number.isFinite(updated) || (now - updated) / 1000 > board.render.freshnessSeconds) continue;
    const previous = dedupe.get(vehicle.vehicleId);
    if (!previous || updated > previous.updated) dedupe.set(vehicle.vehicleId, { profile, updated, destination: vehicle.destinationName || "", lat: Number(vehicle.location.latitude), lon: Number(vehicle.location.longitude) });
  }
  const strongest = new Map();
  for (const vehicle of dedupe.values()) {
    const routeNodes = board.nodes.filter(node => node.routes.includes(vehicle.profile.id));
    const directionNodes = routeNodes.filter(node => matchesDirection(node, vehicle.profile, vehicle.destination));
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
    const id = physical.get(node.led), previous = strongest.get(id);
    if (!previous || state === "AT_STOP" && previous.state !== "AT_STOP" || meters < previous.meters) strongest.set(id, { id, profile: vehicle.profile, destination: vehicle.destination, state, meters });
  }
  return {
    schemaVersion: 1,
    boardProfile: board.id,
    generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000),
    ttlSeconds: 30,
    ledCount: hardware.leds?.count ?? board.leds.count,
    leds: [...strongest.values()].sort((a, b) => a.id - b.id).map(item => ({
      id: item.id,
      rgb: rgb(color(item.profile, item.destination)),
      brightness: Math.min(32, hardware.leds?.brightnessLimit ?? 32),
      state: item.state
    }))
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
  const dedupe = new Map();
  for (const raw of vehicles) {
    const updated = Date.parse(raw.lastUpdated || "");
    if (String(raw.line?.publicCode || "") !== String(profile.line.publicCode) || raw.location?.latitude == null ||
        !Number.isFinite(updated) || (now - updated) / 1000 > board.render.freshnessSeconds) continue;
    const previous = dedupe.get(raw.vehicleId);
    if (!previous || updated > previous.updated) dedupe.set(raw.vehicleId, {
      updated, destination: raw.destinationName || "", lat: Number(raw.location.latitude), lon: Number(raw.location.longitude)
    });
  }
  const strongest = new Map();
  for (const vehicle of dedupe.values()) {
    let nearestStopIndex = -1, stopMeters = Infinity;
    profile.stops.forEach((stop, index) => {
      const meters = distance(vehicle, stop);
      if (meters < stopMeters) { nearestStopIndex = index; stopMeters = meters; }
    });
    let logicalLed, state, meters;
    if (nearestStopIndex >= 0 && stopMeters <= board.render.arrivalRadiusMeters) {
      logicalLed = profile.stops[nearestStopIndex].vled;
      state = "AT_STOP";
      meters = stopMeters;
    } else {
      const route = nearestRoutePosition(profile, vehicle);
      if (!route || route.meters > board.render.maximumTrackDistanceMeters) continue;
      const segment = profile.stops[route.index].segmentToNext;
      if (!segment?.vledCount) continue;
      const offset = Math.min(segment.vledCount - 1, Math.floor(route.progress * segment.vledCount));
      logicalLed = segment.vledStart + offset;
      state = "APPROACHING";
      meters = route.meters;
    }
    const id = physical.get(logicalLed), previous = strongest.get(id);
    if (!previous || state === "AT_STOP" && previous.state !== "AT_STOP" || meters < previous.meters) {
      strongest.set(id, { id, state, meters, destination: vehicle.destination });
    }
  }
  return {
    schemaVersion: 1, boardProfile: board.id, generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000), ttlSeconds: 30, ledCount: hardware.leds?.count ?? board.leds.count,
    leds: [...strongest.values()].sort((a, b) => a.id - b.id).map(item => ({
      id: item.id, rgb: rgb(color(profile, item.destination)),
      brightness: Math.min(32, hardware.leds?.brightnessLimit ?? 32), state: item.state
    }))
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function defaultHardware(board) {
  return {
    schemaVersion: 1,
    boardProfile: board.id,
    leds: {
      count: board.leds.count,
      brightnessLimit: board.leds.brightnessLimit ?? 32
    },
    assignments: board.nodes.map(node => ({
      logicalLed: node.led,
      physicalLed: node.led
    }))
  };
}

function addNodeCoordinates(board, profiles) {
  const stops = new Map();
  for (const profile of profiles) {
    for (const stop of profile.stops || []) {
      for (const id of [stop.id, ...(stop.quayIds || [])]) {
        if (!stops.has(id)) stops.set(id, stop);
      }
    }
  }
  return {
    ...board,
    nodes: board.nodes.map(node => {
      if (Number.isFinite(node.lat) && Number.isFinite(node.lon)) return node;
      const stop = node.stopIds.map(id => stops.get(id)).find(Boolean);
      if (!stop) throw Error(`Coordinates missing for board node ${node.id}`);
      return { ...node, lat: Number(stop.lat), lon: Number(stop.lon) };
    })
  };
}

async function configuration(boardId, now) {
  const cached = configCache.get(boardId);
  if (cached && now - cached.loadedAt < CONFIG_TTL_MS) return cached.value;
  let board = await fetchJson(`${REPOSITORY}/config/boards/${boardId}.json`);
  const [profiles, hardware] = await Promise.all([
    Promise.all(board.routes.map(id => fetchJson(`${REPOSITORY}/config/routes/${id}.json`))),
    fetchJson(`${REPOSITORY}/config/hardware/${boardId}-hardware.json`).catch(() => null)
  ]);
  // Linear route boards derive segment positions from the ordered route profile.\n  // Only station-network boards need coordinates copied onto every board node.\n  if (board.layout !== "linear-route-vled") board = addNodeCoordinates(board, profiles);
  const resolvedHardware = hardware || defaultHardware(board);
  validateConfiguration(board, profiles, resolvedHardware);
  const value = { board, profiles, hardware: resolvedHardware };
  configCache.set(boardId, { loadedAt: now, value });
  return value;
}

async function liveVehicles(endpoint, codespaceId) {
  const query = `{vehicles(codespaceId:"${codespaceId}"){vehicleId lastUpdated destinationName line{publicCode} location{latitude longitude}}}`;
  const data = await fetchJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "ET-Client-Name": CLIENT_NAME }, body: JSON.stringify({ query }) });
  if (data.errors?.length) throw Error(data.errors[0].message);
  return data.data?.vehicles || [];
}

async function liveStationArrivals(board, profiles, now) {
  const endpoint = profiles[0].positioning.endpoint;
  const lookBehind = Math.max(...profiles.map(profile => profile.positioning.lookBehindSeconds || 75));
  const lookAhead = Math.max(...profiles.map(profile => profile.positioning.lookAheadSeconds || 600));
  const stationWindow = Math.max(...profiles.map(profile => profile.positioning.stationWindowSeconds || 45));
  const start = new Date(now - lookBehind * 1000).toISOString();
  const timeRange = lookBehind + lookAhead;
  const targets = [];
  const seenQuays = new Set();
  for (const node of board.nodes) {
    for (const quayId of node.stopIds || []) {
      if (seenQuays.has(quayId)) continue;
      seenQuays.add(quayId);
      targets.push({ node, quayId });
    }
  }
  const fields = "aimedArrivalTime expectedArrivalTime aimedDepartureTime expectedDepartureTime destinationDisplay{frontText} serviceJourney{id journeyPattern{line{id publicCode}}}";
  const aliases = targets.map((target, index) =>
    `q${index}:quay(id:"${target.quayId}"){estimatedCalls(startTime:"${start}",timeRange:${timeRange},numberOfDepartures:6){${fields}}}`
  ).join("\n");
  const data = await fetchJson(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ET-Client-Name": CLIENT_NAME },
    body: JSON.stringify({ query: `{${aliases}}` })
  });
  if (data.errors?.length) throw Error(data.errors[0].message);

  const byPublicCode = new Map(profiles.map(profile => [String(profile.line.publicCode), profile]));
  const byLineId = new Map(profiles.map(profile => [String(profile.line.id), profile]));
  const physical = new Map(board.hardware.assignments.map(item => [item.logicalLed, item.physicalLed]));
  const strongest = new Map();
  targets.forEach((target, index) => {
    for (const call of data.data?.[`q${index}`]?.estimatedCalls || []) {
      const line = call.serviceJourney?.journeyPattern?.line;
      const profile = byPublicCode.get(String(line?.publicCode || "")) || byLineId.get(String(line?.id || ""));
      if (!profile || !target.node.routes.includes(profile.id)) continue;
      const when = Date.parse(call.expectedArrivalTime || call.aimedArrivalTime || call.expectedDepartureTime || call.aimedDepartureTime || "");
      const deltaSeconds = (when - now) / 1000;
      if (!Number.isFinite(when) || Math.abs(deltaSeconds) > stationWindow) continue;
      const id = physical.get(target.node.led);
      const candidate = { id, profile, destination: call.destinationDisplay?.frontText || "", state: "AT_STOP", deltaSeconds };
      const previous = strongest.get(id);
      if (!previous || Math.abs(deltaSeconds) < Math.abs(previous.deltaSeconds)) strongest.set(id, candidate);
    }
  });
  return [...strongest.values()];
}

function frameFromStationArrivals(board, hardware, arrivals, now) {
  return {
    schemaVersion: 1,
    boardProfile: board.id,
    generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000),
    ttlSeconds: 30,
    ledCount: hardware.leds?.count ?? board.leds.count,
    leds: arrivals.sort((a, b) => a.id - b.id).map(item => ({
      id: item.id,
      rgb: rgb(color(item.profile, item.destination)),
      brightness: Math.min(32, hardware.leds?.brightnessLimit ?? 32),
      state: item.state
    }))
  };
}

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const response = (body, status = 200) => new Response(JSON.stringify(body, null, 2) + "\n", { status, headers });

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET") return response({ error: "method_not_allowed" }, 405);
    if (url.pathname === "/" || url.pathname === "/health") return response({ service: "TransitCore LED feed", status: "ok", boardProfiles: [...BOARD_IDS] });
    const match = url.pathname.match(/^\/v1\/boards\/([^/]+)\/frame$/);
    const boardId = match?.[1];
    if (!boardId || !BOARD_IDS.has(boardId)) return response({ error: "not_found" }, 404);
    try {
      const now = Date.now(), { board, profiles, hardware } = await configuration(boardId, now);
      if (board.positioning !== "vehicle-proximity") {
        board.hardware = hardware;
        const arrivals = await liveStationArrivals(board, profiles, now);
        return response(frameFromStationArrivals(board, hardware, arrivals, now));
      }
      const vehicles = await liveVehicles(
        profiles[0].provider.vehicleEndpoint,
        profiles[0].provider.codespaceId
      );
      if (board.layout === "linear-route-vled") {
        return response(buildLinearRouteFrame({ board, profiles, hardware, vehicles, now }));
      }
      return response(buildFrame({ board, profiles, hardware, vehicles, now }));
    } catch (error) {
      console.error(error);
      return response({ error: "feed_unavailable", message: error.message, generatedAt: new Date().toISOString() }, 503);
    }
  }
};

