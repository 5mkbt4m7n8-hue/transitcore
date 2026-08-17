const REPOSITORY = "https://raw.githubusercontent.com/5mkbt4m7n8-hue/transitcore/main";
const BOARD_IDS = new Set([
  "trondheim-bus-board", "oslo-metro-board", "oslo-metro-board-direction-a",
  "oslo-metro-board-direction-b", "oslo-metro-wizard-separate", "grakallbanen-board"
]);
const CLIENT_NAME = "lgb-transitcore-led-feed";
const CONFIG_TTL_MS = 5 * 60 * 1000;
const configCache = new Map();

const statusJson = (body, status = 200) => new Response(
  JSON.stringify(body, null, 2) + "\n",
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } }
);

export function applyMotionLifecycle(frame, previous = {}, now = Date.now(), afterglowMs = 20000) {
  afterglowMs = Math.max(0, Number(afterglowMs) || 0);
  const next = {};
  const leds = [];
  const seen = new Set();

  for (const led of frame.leds || []) {
    const id = String(led.id);
    const vehicleId = String(led.vehicle?.id || "");
    const distance = Number(led.vehicle?.distanceMeters);
    const before = previous[id];
    const sameVehicle = before && before.vehicleId === vehicleId;
    const departing = led.state === "APPROACHING" && sameVehicle &&
      (before.state === "AT_STOP" || before.state === "PASSED" ||
       Number.isFinite(distance) && Number.isFinite(before.distance) && distance > before.distance + 10);
    seen.add(id);

    if (departing) {
      const expiresAt = before.state === "PASSED" ? before.expiresAt : now + afterglowMs;
      if (expiresAt > now) {
        const passed = { ...led, state: "AT_STOP", lifecycle: "PASSED", brightness: Math.min(8, led.brightness) };
        leds.push(passed);
        next[id] = { vehicleId, state: "PASSED", distance, expiresAt, led: passed };
      }
      continue;
    }

    leds.push(led);
    next[id] = { vehicleId, state: led.state, distance, expiresAt: 0, led };
  }

  for (const [id, before] of Object.entries(previous)) {
    if (seen.has(id)) continue;
    const expiresAt = before.state === "PASSED" ? before.expiresAt : now + afterglowMs;
    if (expiresAt <= now) continue;
    const passed = { ...before.led, state: "AT_STOP", lifecycle: "PASSED", brightness: Math.min(8, before.led.brightness) };
    leds.push(passed);
    next[id] = { ...before, state: "PASSED", expiresAt, led: passed };
  }

  return { frame: { ...frame, leds: leds.sort((a, b) => a.id - b.id) }, state: next };
}

export class DeviceStatus {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/monitor") {
      if (request.method === "POST") {
        const sample = await request.json();
        const latest = (await this.state.storage.get("monitorLatest")) || null;
        const history = (await this.state.storage.get("monitorHistory")) || [];
        const changed = !latest || latest.state !== sample.state || latest.detail !== sample.detail;
        const heartbeatDue = !latest || Date.parse(sample.checkedAt) - Date.parse(latest.recordedAt || latest.checkedAt) >= 15 * 60 * 1000;
        const stored = { ...sample, recordedAt: sample.checkedAt };
        if (sample.source === "scheduled") await this.state.storage.put("monitorLastScheduled", stored);
        if (changed || heartbeatDue) {
          history.push(stored);
          while (history.length > 672) history.shift();
          await this.state.storage.put("monitorHistory", history);
        }
        await this.state.storage.put("monitorLatest", changed || heartbeatDue ? stored : { ...latest, ...sample });
        return statusJson({ ok: true, recorded: changed || heartbeatDue });
      }
      const latest = await this.state.storage.get("monitorLatest");
      const history = (await this.state.storage.get("monitorHistory")) || [];
      const lastScheduled = await this.state.storage.get("monitorLastScheduled");
      return statusJson({ latest: latest || null, lastScheduled: lastScheduled || null, history });
    }
    if (url.pathname === "/motion" && request.method === "POST") {
      const { frame, now, afterglowMs } = await request.json();
      const previous = (await this.state.storage.get("motion")) || {};
      const result = applyMotionLifecycle(frame, previous, Number(now) || Date.now(), afterglowMs);
      await this.state.storage.put("motion", result.state);
      return statusJson(result.frame);
    }
    if (request.method === "POST") {
      const sample = await request.json();
      const history = (await this.state.storage.get("history")) || [];
      history.push(sample);
      while (history.length > 288) history.shift();
      await this.state.storage.put({ latest: sample, history });
      return statusJson({ ok: true });
    }
    const latest = await this.state.storage.get("latest");
    const history = await this.state.storage.get("history") || [];
    return statusJson({ latest: latest || null, history });
  }
}

export function cleanStatusPayload(value, deviceId, receivedAt) {
  if (!value || value.schemaVersion !== 1 || value.boardProfile !== deviceId || value.firmware !== "1.0.4") {
    throw Error("invalid status payload");
  }
  const number = (name, max = 0xffffffff) => {
    const result = Number(value[name]);
    if (!Number.isFinite(result) || result < 0 || result > max) throw Error(`invalid ${name}`);
    return Math.floor(result);
  };
  return {
    schemaVersion: 1,
    deviceId,
    boardProfile: deviceId,
    firmware: "1.0.4",
    receivedAt: new Date(receivedAt).toISOString(),
    uptimeSeconds: number("uptimeSeconds"),
    wifiOutages: number("wifiOutages"),
    wifiRecoveries: number("wifiRecoveries"),
    feedSuccesses: number("feedSuccesses"),
    feedFailures: number("feedFailures"),
    frameAgeSeconds: number("frameAgeSeconds"),
    frameValid: Boolean(value.frameValid),
    freeHeap: number("freeHeap", 1000000),
    minimumFreeHeap: number("minimumFreeHeap", 1000000)
  };
}

async function recordBoardMonitor(env, boardId, sample) {
  if (!env.DEVICE_STATUS) return;
  const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(boardId));
  await stub.fetch("https://status.internal/monitor", {
    method: "POST",
    body: JSON.stringify({ boardId, checkedAt: new Date().toISOString(), ...sample })
  });
}

function validFrameSummary(frame, boardId) {
  const valid = frame?.schemaVersion === 1 && frame.boardProfile === boardId &&
    Number.isInteger(frame.ledCount) && Array.isArray(frame.leds);
  return {
    state: valid ? "OK" : "PROFILE_MISMATCH",
    detail: valid ? "Gyldig Worker-frame" : "Tavle-ID, schema eller LED-antall avviker",
    activeLeds: Array.isArray(frame?.leds) ? frame.leds.length : 0,
    sequence: Number(frame?.sequence) || 0
  };
}

const MONITOR_ORIGIN = "https://transitcore-led-feed.lgb84.workers.dev";

async function runBackgroundChecks(env) {
  await Promise.all([...BOARD_IDS].map(async boardId => {
    try {
      const result = await fetch(`${MONITOR_ORIGIN}/v1/boards/${encodeURIComponent(boardId)}/frame`, {
        headers: { "x-transitcore-monitor": "scheduled" }
      });
      if (!result.ok) console.error(`Background check ${boardId}: HTTP ${result.status}`);
    } catch (error) {
      console.error(`Background check ${boardId}:`, error);
      await recordBoardMonitor(env, boardId, {
        state: "FEED_ERROR", detail: `Bakgrunnskontroll: ${error.message}`, activeLeds: 0, source: "scheduled"
      });
    }
  }));
}

const statusPage = `<!doctype html><html lang="no"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TransitCore status</title><style>body{font:16px system-ui;background:#0b1220;color:#e5edf8;margin:0;padding:24px}.wrap{max-width:720px;margin:auto}h1{margin:0 0 6px}.sub{color:#9fb0c8;margin-bottom:22px}.card{background:#131d2e;border:1px solid #26344b;border-radius:16px;padding:18px;margin:12px 0}.row{display:flex;justify-content:space-between;gap:16px;margin:8px 0}.dot{width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:8px}.ok{background:#22c55e}.warn{background:#f59e0b}.off{background:#ef4444}.muted{color:#9fb0c8}code{color:#cfe3ff}</style><div class="wrap"><h1>TransitCore status</h1><div class="sub">Oppdateres automatisk hvert 30. sekund</div><div id="cards">Lasterâ€¦</div></div><script>const names={'trondheim-bus-board':'Trondheim buss','oslo-metro-board':'Oslo T-bane','oslo-metro-wizard-separate':'Oslo linje 1 – separate LED-er','grakallbanen-board':'GrÃ¥kallbanen'};function esc(x){return String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}async function load(){const data=await fetch('/v1/status',{cache:'no-store'}).then(r=>r.json());cards.innerHTML=data.devices.map(d=>{if(!d.latest)return '<div class="card"><div><span class="dot off"></span>'+esc(names[d.deviceId]||d.deviceId)+'</div><p class="muted">Ingen status mottatt</p></div>';const s=d.latest,age=Math.max(0,Math.floor((Date.now()-Date.parse(s.receivedAt))/1000)),state=age<=420&&s.frameValid?'ok':age<=900?'warn':'off',label=state==='ok'?'Online':state==='warn'?'Varsel':'Frakoblet';return '<div class="card"><div><span class="dot '+state+'"></span><b>'+esc(names[d.deviceId]||d.deviceId)+'</b> Â· '+label+'</div><div class="row"><span>Sist sett</span><span>'+age+' s siden</span></div><div class="row"><span>Firmware</span><code>'+esc(s.firmware)+'</code></div><div class="row"><span>Oppetid</span><span>'+Math.floor(s.uptimeSeconds/60)+' min</span></div><div class="row"><span>Wiâ€‘Fi brudd / tilbake</span><span>'+s.wifiOutages+' / '+s.wifiRecoveries+'</span></div><div class="row"><span>Feed OK / feil</span><span>'+s.feedSuccesses+' / '+s.feedFailures+'</span></div><div class="row"><span>Heap / minimum</span><span>'+s.freeHeap+' / '+s.minimumFreeHeap+'</span></div></div>'}).join('')}load().catch(e=>cards.textContent='Status kunne ikke lastes: '+e.message);setInterval(load,30000)</script></html>`;

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
    if (!profile || vehicle.location?.latitude == null || !Number.isFinite(updated) || (now - updated) / 1000 > board.render.freshnessSeconds) continue;
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
    const candidate = { id, profile: vehicle.profile, vehicleId: vehicle.vehicleId, updated: vehicle.updated, destination: vehicle.destination, state, meters };
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
    rgb: rgb(item.profile.line.color || color(item.profile, item.destination)),
    state: item.state,
    ageSeconds: Math.max(0, Math.floor((now - item.updated) / 1000)),
    distanceMeters: Math.round(item.meters)
  });
  return {
    schemaVersion: 1,
    boardProfile: board.id,
    generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000),
    ttlSeconds: 30,
    ledCount: hardware.leds?.count ?? board.leds.count,
    leds: [...strongest.values()].sort((a, b) => a.id - b.id).map(item => {
      const occupants = (occupantsByLed.get(item.id) || []).sort((a, b) => {
        const priority = value => value.state === "AT_STOP" ? 2 : value.state === "APPROACHING" ? 1 : 0;
        return priority(b) - priority(a) || a.meters - b.meters;
      }).map(occupantJson);
      return {
        id: item.id,
        rgb: rgb(color(item.profile, item.destination)),
        brightness: Math.min(32, hardware.leds?.brightnessLimit ?? 32),
        state: item.state,
        vehicle: {
          id: item.vehicleId,
          line: String(item.profile.line.publicCode),
          destination: item.destination,
          ageSeconds: Math.max(0, Math.floor((now - item.updated) / 1000)),
          distanceMeters: Math.round(item.meters)
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
  const approachWindow = Math.max(stationWindow, board.render?.approachWindowSeconds || 120);
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
      const destination = call.destinationDisplay?.frontText || "";
      if (target.node.routeDirections && !matchesDirection(target.node, profile, destination)) continue;
      const when = Date.parse(call.expectedArrivalTime || call.aimedArrivalTime || call.expectedDepartureTime || call.aimedDepartureTime || "");
      const deltaSeconds = (when - now) / 1000;
      if (!Number.isFinite(when) || deltaSeconds < -stationWindow || deltaSeconds > approachWindow) continue;
      const id = physical.get(target.node.led);
      const state = Math.abs(deltaSeconds) <= stationWindow ? "AT_STOP" : "APPROACHING";
      const candidate = {
        id, profile, destination, state, deltaSeconds,
        vehicleId: String(call.serviceJourney?.id || "")
      };
      const previous = strongest.get(id);
      if (!previous || state === "AT_STOP" && previous.state !== "AT_STOP" ||
          state === previous.state && Math.abs(deltaSeconds) < Math.abs(previous.deltaSeconds)) strongest.set(id, candidate);
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
      state: item.state,
      vehicle: { id: item.vehicleId }
    }))
  };
}

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const response = (body, status = 200) => new Response(JSON.stringify(body, null, 2) + "\n", { status, headers });

async function stabilizeMotionFrame(env, board, frame, now) {
  const configured = board.render?.departureAfterglowSeconds;
  const afterglowSeconds = configured == null && board.id === "trondheim-bus-board"
    ? 10
    : Math.max(0, Math.min(10, Number(configured) || 0));
  if (!afterglowSeconds || !env.DEVICE_STATUS) return frame;
  const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(board.id));
  const result = await stub.fetch("https://status.internal/motion", {
    method: "POST",
    body: JSON.stringify({ frame, now, afterglowMs: afterglowSeconds * 1000 })
  });
  if (!result.ok) throw Error(`motion state: HTTP ${result.status}`);
  return result.json();
}

// Git-connected deploys reuse the encrypted publishing secrets configured in Cloudflare.
const publishCors={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"https://5mkbt4m7n8-hue.github.io","access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"POST, OPTIONS"};
const publishResponse=(body,status=200)=>new Response(JSON.stringify(body,null,2)+"\n",{status,headers:publishCors});
function validatePublishProfiles(board,hardware){
 if(!board||!hardware||![1,2].includes(board.schemaVersion)||hardware.schemaVersion!==1)throw Error("Unsupported profile format");
 if(typeof board.id!=="string"||!/^[a-z0-9-]+$/.test(board.id))throw Error("Invalid board id");
 if(hardware.boardProfile!==board.id)throw Error("Board/hardware profile mismatch");
 const nodes=Array.isArray(board.nodes)?board.nodes:[],assignments=Array.isArray(hardware.assignments)?hardware.assignments:[];
 if(!nodes.length||board.leds?.count!==nodes.length||hardware.leds?.count!==nodes.length||assignments.length!==nodes.length)throw Error("LED count mismatch");
 const nodeById=new Map(nodes.map(n=>[n.id,n])),logical=new Set(),physical=new Set(),sources=new Set();
 if(nodeById.size!==nodes.length)throw Error("Duplicate board node id");
 for(const node of nodes){if(!Number.isInteger(node.led)||logical.has(node.led))throw Error("Duplicate or invalid logical LED");if(!Array.isArray(node.stopIds)||!node.stopIds.length||!Array.isArray(node.routes)||!node.routes.length)throw Error("Node is missing stop or route");logical.add(node.led)}
 for(const a of assignments){const node=nodeById.get(a.sourceNodeId);if(!node||node.led!==a.logicalLed||sources.has(a.sourceNodeId))throw Error("Invalid hardware source mapping");if(!Number.isInteger(a.physicalLed)||a.physicalLed<0||a.physicalLed>=nodes.length||physical.has(a.physicalLed))throw Error("Duplicate or invalid physical LED");sources.add(a.sourceNodeId);physical.add(a.physicalLed)}
 if([...physical].sort((a,b)=>a-b).some((value,index)=>value!==index))throw Error("Physical LEDs are not continuous");
}
function base64Utf8(value){const bytes=new TextEncoder().encode(value);let binary="";for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary)}
async function githubApi(env,path,options={}){
 const result=await fetch("https://api.github.com"+path,{...options,headers:{"accept":"application/vnd.github+json","authorization":`Bearer ${env.GITHUB_PUBLISH_TOKEN}`,"x-github-api-version":"2022-11-28","user-agent":"TransitCore-Publisher",...(options.headers||{})}});
 const body=await result.json().catch(()=>({}));if(!result.ok)throw Error(`GitHub ${result.status}: ${body.message||"request failed"}`);return body;
}
async function handlePublish(request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:publishCors});
 if(request.method!=="POST")return publishResponse({error:"method_not_allowed"},405);
 if(!env.PUBLISH_ADMIN_TOKEN||!env.GITHUB_PUBLISH_TOKEN)return publishResponse({error:"publishing_not_configured"},503);
 if(request.headers.get("authorization")!==`Bearer ${env.PUBLISH_ADMIN_TOKEN}`)return publishResponse({error:"unauthorized"},401);
 try{
  const payload=await request.json(),board=payload.board,hardware=payload.hardware;validatePublishProfiles(board,hardware);
  const repository=env.GITHUB_REPOSITORY||"5mkbt4m7n8-hue/transitcore",base="main";
  const files=[{path:`config/boards/${board.id}.json`,value:board},{path:`config/hardware/${board.id}-hardware.json`,value:hardware}];
  for(const file of files){
   file.content=JSON.stringify(file.value,null,2)+"\n";
   const inspect=await fetch(`https://api.github.com/repos/${repository}/contents/${file.path}?ref=${base}`,{headers:{"accept":"application/vnd.github+json","authorization":`Bearer ${env.GITHUB_PUBLISH_TOKEN}`,"x-github-api-version":"2022-11-28","user-agent":"TransitCore-Publisher"}});
   file.current=inspect.ok?await inspect.json():null;if(!inspect.ok&&inspect.status!==404)throw Error(`GitHub ${inspect.status}: cannot inspect ${file.path}`);
   if(file.current?.content){
    const binary=atob(file.current.content.replace(/\s/g,"")),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    const currentValue=JSON.parse(new TextDecoder().decode(bytes)),incomingValue=JSON.parse(file.content);
    delete currentValue.generatedAt;delete incomingValue.generatedAt;
    file.unchanged=JSON.stringify(currentValue)===JSON.stringify(incomingValue);
   }else file.unchanged=false;
  }
  if(files.every(file=>file.unchanged))return publishResponse({ok:true,noChanges:true,message:"Profilene er allerede oppdatert på main."});
  const baseRef=await githubApi(env,`/repos/${repository}/git/ref/heads/${base}`),branch=`publish/${board.id}-${Date.now()}`;
  await githubApi(env,`/repos/${repository}/git/refs`,{method:"POST",body:JSON.stringify({ref:`refs/heads/${branch}`,sha:baseRef.object.sha})});
  for(const file of files.filter(file=>!file.unchanged)){
   await githubApi(env,`/repos/${repository}/contents/${file.path}`,{method:"PUT",body:JSON.stringify({message:`Publish ${board.id}: ${file.path}`,content:base64Utf8(file.content),branch,...(file.current?.sha?{sha:file.current.sha}:{})})});
  }
  const pull=await githubApi(env,`/repos/${repository}/pulls`,{method:"POST",body:JSON.stringify({title:`Publiser tavleprofil: ${board.name||board.id}`,head:branch,base,draft:true,body:`## Automatisk tavlepublisering\n\n- Tavle-ID: \`${board.id}\`\n- Ruter: ${(board.routes||[]).join(", ")}\n- LED-punkter: ${board.nodes.length}\n\nProfilene er kontrollert i nettleseren og på Worker.`})});
  return publishResponse({ok:true,pullRequestNumber:pull.number,pullRequestUrl:pull.html_url,branch});
 }catch(error){console.error("publish failed",error);return publishResponse({error:"publish_failed",message:error.message},400)}
}

async function handlePreview(request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:publishCors});
 if(request.method!=="POST")return publishResponse({error:"method_not_allowed"},405);
 if(!env.PUBLISH_ADMIN_TOKEN)return publishResponse({error:"preview_not_configured"},503);
 if(request.headers.get("authorization")!==`Bearer ${env.PUBLISH_ADMIN_TOKEN}`)return publishResponse({error:"unauthorized"},401);
 try{
  const payload=await request.json(),board=payload.board,hardware=payload.hardware;validatePublishProfiles(board,hardware);
  const profiles=await Promise.all(board.routes.map(id=>fetchJson(`${REPOSITORY}/config/routes/${id}.json`)));
  const now=Date.now(),resolvedBoard=board.layout==="linear-route-vled"?board:addNodeCoordinates(board,profiles);
  if(resolvedBoard.positioning!=="vehicle-proximity"){
   resolvedBoard.hardware=hardware;
   const arrivals=await liveStationArrivals(resolvedBoard,profiles,now);
   const frame=frameFromStationArrivals(resolvedBoard,hardware,arrivals,now);
   return publishResponse(await stabilizeMotionFrame(env,resolvedBoard,frame,now));
  }
  const vehicles=await liveVehicles(profiles[0].provider.vehicleEndpoint,profiles[0].provider.codespaceId);
  const frame=resolvedBoard.layout==="linear-route-vled"
   ?buildLinearRouteFrame({board:resolvedBoard,profiles,hardware,vehicles,now})
   :buildFrame({board:resolvedBoard,profiles,hardware,vehicles,now});
  return publishResponse(await stabilizeMotionFrame(env,resolvedBoard,frame,now));
 }catch(error){console.error("preview failed",error);return publishResponse({error:"preview_failed",message:error.message},400)}
}

export default {
  async scheduled(controller, env) {
    console.log("Scheduled background checks started", new Date(controller.scheduledTime).toISOString());
    await runBackgroundChecks(env);
    console.log("Scheduled background checks completed");
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/v1/admin/publish") return handlePublish(request, env);
    if (url.pathname === "/v1/admin/preview") return handlePreview(request, env);
    if (url.pathname === "/status" && request.method === "GET") {
      return new Response(statusPage, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/v1/status" && request.method === "GET") {
      const deviceIds = ["trondheim-bus-board", "oslo-metro-board", "grakallbanen-board"];
      if (!env.DEVICE_STATUS) {
        return statusJson({
          generatedAt: new Date().toISOString(),
          devices: deviceIds.map(deviceId => ({ deviceId, latest: null })),
          statusStorage: "disabled_in_preview"
        });
      }
      const devices = await Promise.all(deviceIds.map(async deviceId => {
        const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(deviceId));
        const stored = await stub.fetch("https://status.internal/").then(response => response.json());
        return { deviceId, latest: stored.latest };
      }));
      return statusJson({ generatedAt: new Date().toISOString(), devices });
    }
    const historyMatch = url.pathname.match(/^\/v1\/boards\/([^/]+)\/history$/);
    if (historyMatch && request.method === "GET") {
      const boardId = historyMatch[1];
      if (!BOARD_IDS.has(boardId)) return statusJson({ error: "not_found" }, 404);
      if (!env.DEVICE_STATUS) return statusJson({ latest: null, history: [], statusStorage: "disabled_in_preview" });
      const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(boardId));
      return stub.fetch("https://status.internal/monitor");
    }
    const statusMatch = url.pathname.match(/^\/v1\/devices\/([^/]+)\/status$/);
    if (statusMatch) {
      const deviceId = statusMatch[1];
      if (!BOARD_IDS.has(deviceId)) return statusJson({ error: "not_found" }, 404);
      if (!env.DEVICE_STATUS) return statusJson({ error: "status_storage_unavailable" }, 503);
      const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(deviceId));
      if (request.method === "GET") return stub.fetch("https://status.internal/");
      if (request.method !== "POST") return statusJson({ error: "method_not_allowed" }, 405);
      if (!env.STATUS_INGEST_TOKEN) return statusJson({ error: "status_not_configured" }, 503);
      if (request.headers.get("authorization") !== `Bearer ${env.STATUS_INGEST_TOKEN}`) return statusJson({ error: "unauthorized" }, 401);
      try {
        const sample = cleanStatusPayload(await request.json(), deviceId, Date.now());
        return stub.fetch("https://status.internal/", { method: "POST", body: JSON.stringify(sample) });
      } catch (error) {
        return statusJson({ error: "invalid_status", message: error.message }, 400);
      }
    }
    if (request.method !== "GET") return response({ error: "method_not_allowed" }, 405);
    if (url.pathname === "/" || url.pathname === "/health") return response({ service: "TransitCore LED feed", status: "ok", boardProfiles: [...BOARD_IDS] });
    const match = url.pathname.match(/^\/v1\/boards\/([^/]+)\/frame$/);
    const boardId = match?.[1];
    if (!boardId || !BOARD_IDS.has(boardId)) return response({ error: "not_found" }, 404);
    const monitorSource = request.headers.get("x-transitcore-monitor") === "scheduled" ? "scheduled" : "request";
    try {
      const now = Date.now(), { board, profiles, hardware } = await configuration(boardId, now);
      if (board.positioning !== "vehicle-proximity") {
        board.hardware = hardware;
        const arrivals = await liveStationArrivals(board, profiles, now);
        const frame = await stabilizeMotionFrame(env, board, frameFromStationArrivals(board, hardware, arrivals, now), now);
        await recordBoardMonitor(env, boardId, { ...validFrameSummary(frame, boardId), source: monitorSource });
        return response(frame);
      }
      const vehicles = await liveVehicles(
        profiles[0].provider.vehicleEndpoint,
        profiles[0].provider.codespaceId
      );
      if (board.layout === "linear-route-vled") {
        const frame = buildLinearRouteFrame({ board, profiles, hardware, vehicles, now });
        await recordBoardMonitor(env, boardId, { ...validFrameSummary(frame, boardId), source: monitorSource });
        return response(frame);
      }
      const rawFrame = buildFrame({ board, profiles, hardware, vehicles, now });
      const frame = await stabilizeMotionFrame(env, board, rawFrame, now);
      await recordBoardMonitor(env, boardId, { ...validFrameSummary(frame, boardId), source: monitorSource });
      return response(frame);
    } catch (error) {
      console.error(error);
      await recordBoardMonitor(env, boardId, { state: "FEED_ERROR", detail: error.message, activeLeds: 0, source: monitorSource });
      return response({ error: "feed_unavailable", message: error.message, generatedAt: new Date().toISOString() }, 503);
    }
  }
};

