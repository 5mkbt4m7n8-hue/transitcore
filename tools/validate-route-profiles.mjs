import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routesDirectory = join(root, "config", "routes");
const registryPath = join(routesDirectory, "routes.json");
const errors = [];

const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const fail = (file, message) => errors.push(`${file}: ${message}`);
const finiteCoordinate = value => typeof value === "number" && Number.isFinite(value);

function distanceMeters(a, b) {
  const radians = value => value * Math.PI / 180;
  const radius = 6_371_000;
  const p1 = radians(a.lat), p2 = radians(b.lat);
  const dp = radians(b.lat - a.lat), dl = radians(b.lon - a.lon);
  const value = Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function pointSegmentDistance(point, start, end) {
  const lat0 = point.lat * Math.PI / 180;
  const sx = 111_320 * Math.cos(lat0), sy = 110_540;
  const px = point.lon * sx, py = point.lat * sy;
  const ax = start.lon * sx, ay = start.lat * sy;
  const bx = end.lon * sx, by = end.lat * sy;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1,
    ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function nearestShapeDistance(stop, shape) {
  let best = Infinity;
  for (let index = 0; index < shape.length - 1; index++) {
    best = Math.min(best, pointSegmentDistance(stop, shape[index], shape[index + 1]));
  }
  return best;
}

function findForbiddenKey(value, path = "") {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (/password|secret|token|api.?key|ssid/i.test(key)) return childPath;
    const nested = findForbiddenKey(child, childPath);
    if (nested) return nested;
  }
  return null;
}

function validateProfile(file, profile) {
  if (profile.schemaVersion !== 1) fail(file, "schemaVersion must be 1");
  if (!profile.id || !profile.name) fail(file, "id and name are required");
  if (!profile.provider?.codespaceId || !profile.provider?.vehicleEndpoint) {
    fail(file, "provider codespaceId and vehicleEndpoint are required");
  }
  if (!profile.line?.publicCode || !profile.line?.mode) {
    fail(file, "line publicCode and mode are required");
  }
  if (!Array.isArray(profile.directions) || profile.directions.length < 2) {
    fail(file, "at least two directions are required");
  } else {
    for (const direction of profile.directions) {
      if (!direction.id || !direction.label || !direction.color ||
          !Array.isArray(direction.destinationMatches) || !direction.destinationMatches.length) {
        fail(file, `direction ${direction.id || "<missing>"} is incomplete`);
      }
    }
  }

  if (!Array.isArray(profile.stops) || profile.stops.length < 2) {
    fail(file, "at least two stops are required");
  } else {
    let previousDistance = -1;
    for (const [index, stop] of profile.stops.entries()) {
      if (!stop.name || !finiteCoordinate(stop.lat) || !finiteCoordinate(stop.lon)) {
        fail(file, `stop ${index} has invalid name or coordinates`);
      }
      if (typeof stop.shapeDistanceMeters === "number") {
        if (stop.shapeDistanceMeters <= previousDistance && index > 0) {
          fail(file, `stop distances are not increasing at ${stop.name}`);
        }
        previousDistance = stop.shapeDistanceMeters;
      }
    }
  }

  if (profile.display?.layout === "route-live") {
    if (!Array.isArray(profile.shape) || profile.shape.length < 2) {
      fail(file, "route-live requires a shape with at least two points");
    } else {
      for (const stop of profile.stops || []) {
        const distance = nearestShapeDistance(stop, profile.shape);
        if (distance > 250) {
          fail(file, `${stop.name} is ${Math.round(distance)} m from the route shape`);
        }
      }
    }
  }

  if (profile.hardwareMapping) {
    let cursor = 0;
    for (const [index, stop] of profile.stops.entries()) {
      if (stop.vled !== cursor) fail(file, `${stop.name} expected station VLED ${cursor}, got ${stop.vled}`);
      cursor += 1;
      if (index < profile.stops.length - 1) {
        const segment = stop.segmentToNext;
        if (!segment || segment.vledStart !== cursor || !Number.isInteger(segment.vledCount) || segment.vledCount < 1) {
          fail(file, `${stop.name} has a non-contiguous segment VLED map`);
        } else {
          cursor += segment.vledCount;
        }
      }
    }
    if (cursor !== profile.hardwareMapping.totalVleds) {
      fail(file, `hardware map totals ${cursor}, declared ${profile.hardwareMapping.totalVleds}`);
    }
  }

  const forbidden = findForbiddenKey(profile);
  if (forbidden) fail(file, `forbidden secret-like key ${forbidden}`);
}

const registry = await readJson(registryPath);
if (registry.schemaVersion !== 1 || !Array.isArray(registry.routes)) {
  fail("routes.json", "invalid registry structure");
}

const registryFiles = new Set();
const profileIds = new Set();
const lineKeys = new Set();
let validated = 0;

for (const entry of registry.routes || []) {
  if (!entry.enabled) continue;
  const file = entry.profile;
  if (!file || file.includes("/") || file.includes("\\") || !file.endsWith(".json")) {
    fail("routes.json", `invalid profile path ${file}`);
    continue;
  }
  if (registryFiles.has(file)) {
    fail("routes.json", `duplicate profile ${file}`);
    continue;
  }
  registryFiles.add(file);

  try {
    const profile = await readJson(join(routesDirectory, file));
    validateProfile(file, profile);
    if (profileIds.has(profile.id)) fail(file, `duplicate profile id ${profile.id}`);
    profileIds.add(profile.id);
    const lineKey = `${profile.provider?.codespaceId}:${profile.line?.id || profile.line?.publicCode}:${profile.line?.mode}`;
    if (lineKeys.has(lineKey)) fail(file, `duplicate line identity ${lineKey}`);
    lineKeys.add(lineKey);
    validated++;
  } catch (error) {
    fail(file, error.message);
  }
}

if (errors.length) {
  console.error(`Route profile validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Route profile validation OK: ${validated} enabled profiles.`);
}

