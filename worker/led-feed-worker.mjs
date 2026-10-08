import { mtaLine7Response } from "./mta-line7.mjs";
import { normalizeHealthStatus } from "../core/models/health-status.mjs";
import { healthPolicy } from "../core/models/device-record.mjs";
import { storeTelemetry, publicSample, publicEvent } from "./devices/telemetry.mjs";
import { fleetResponse } from "./devices/fleet.mjs";
import { apiV1 } from "./api/v1.mjs";
import { validateDeviceSettings } from "../core/models/device-config.mjs";
import { createEnturProvider } from "../core/providers/entur/entur-provider.mjs";
import { normalizeEnturVehicle } from "../core/providers/entur/entur-normalizer.mjs";
import { buildPixelFrame } from "../core/frame/build-frame.mjs";
import { distance, color, rgb, matchesDirection, vehicleAllowedByBoard, validateConfiguration } from "../core/frame/mapping-support.mjs";
export { matchesDirection, vehicleAllowedByBoard, validateConfiguration };
import { diagnosticsRequest, selectOtaRelease } from "./device-diagnostics.mjs";
import { boundedOperation, boundedFetchJson, FRAME_BUDGET_MS, MONITOR_TIMEOUT_MS } from "./feed-timing.mjs";

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

export function attachSignalPolicy(frame) {
  return { ...frame, signalPolicy: SIGNAL_POLICY };
}

const REPOSITORY = "https://raw.githubusercontent.com/5mkbt4m7n8-hue/transitcore/main";
const BOARD_IDS = new Set([
  "trondheim-bus-board", "oslo-metro-board", "oslo-metro-board-direction-a",
  "oslo-metro-board-direction-b", "oslo-metro-wizard-separate",
  "oslo-metro-wizard-shared", "grakallbanen-board", "grakallbanen-prototype-board"
]);
const GRAKALL_BOARD_IDS = new Set(["grakallbanen-board", "grakallbanen-prototype-board"]);
export const validBoardId = value => typeof value === "string" && /^[a-z0-9-]{3,120}$/.test(value);
const CLIENT_NAME = "lgb-transitcore-led-feed";
const CONFIG_TTL_MS = 5 * 60 * 1000;
const configCache = new Map();
const LIVE_VEHICLE_TTL_MS = 8 * 1000;
const enturProvider = createEnturProvider({fetchJson,clientName:CLIENT_NAME,ttlMs:LIVE_VEHICLE_TTL_MS});

const statusJson = (body, status = 200) => new Response(
  JSON.stringify(body, null, 2) + "\n",
  { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } }
);

export async function attachProfileIdentity(board,hardware){
 const configured=Number(board.profileRevision);
 board.profileRevision=Number.isInteger(configured)&&configured>0?configured:1;
 const source=JSON.stringify({board:{...board,profileFingerprint:undefined},hardware});
 const hash=seed=>{let value=seed>>>0;for(let index=0;index<source.length;index++)value=Math.imul(value^source.charCodeAt(index),16777619);return(value>>>0).toString(16).padStart(8,"0")};
 board.profileFingerprint=hash(2166136261)+hash(2246822507);
 return board;
}

function makePassedLed(led) {
  const vehicle = led.vehicle ? { ...led.vehicle, rgb: led.rgb, state: "PASSED" } : null;
  return {
    ...led,
    state: "AT_STOP",
    lifecycle: "PASSED",
    brightness: Math.min(SIGNAL_POLICY.afterglowBrightness, led.brightness),
    // Afterglow belongs only to the most recently departed vehicle.
    // Keeping older occupants here made one LED alternate between stale line colours.
    occupants: vehicle ? [vehicle] : []
  };
}

function makeParkedLed(led) {
  const rgb = [...SIGNAL_POLICY.parkedRgb];
  const vehicle = led.vehicle ? { ...led.vehicle, rgb, state: "PARKED" } : null;
  return { ...led, rgb, state: "AT_STOP", lifecycle: "PARKED", brightness: SIGNAL_POLICY.fullBrightness, occupants: vehicle ? [vehicle] : [] };
}

function promoteRemainingOccupant(led, departingVehicleId) {
  const priority = value => SIGNAL_POLICY.priorities[value?.state] || 0;
  const remaining = (led.occupants || [])
    .filter(value => String(value.id || "") !== departingVehicleId && priority(value) > SIGNAL_POLICY.priorities.PASSED)
    .sort((a, b) => priority(b) - priority(a) || Number(a.distanceMeters ?? Infinity) - Number(b.distanceMeters ?? Infinity));
  if (!remaining.length) return null;
  const winner = remaining[0], highest = priority(winner);
  const occupants = remaining.filter(value => priority(value) === highest);
  return {
    ...led,
    rgb: Array.isArray(winner.rgb) ? winner.rgb : led.rgb,
    brightness: SIGNAL_POLICY.fullBrightness,
    state: winner.state,
    lifecycle: undefined,
    vehicle: {
      ...led.vehicle,
      id: winner.id,
      line: winner.line,
      destination: winner.destination,
      distanceMeters: winner.distanceMeters,
      stationDistanceMeters: winner.stationDistanceMeters,
      nearestStationLed: winner.nearestStationLed,
      positionType: winner.positionType,
      latitude: winner.latitude,
      longitude: winner.longitude
    },
    occupants
  };
}

function distanceBetweenCoordinates(latitudeA, longitudeA, latitudeB, longitudeB) {
  return distance({ lat: latitudeA, lon: longitudeA }, { lat: latitudeB, lon: longitudeB });
}

export function normalizeLedEntries(entries = [], ledCount = Infinity) {
  const byId = new Map();
  const effectiveState = led => led?.lifecycle || led?.state || "OFF";
  const priority = led => SIGNAL_POLICY.priorities[effectiveState(led)] || 0;
  const occupants = led => Array.isArray(led?.occupants) && led.occupants.length
    ? led.occupants
    : led?.vehicle ? [{ ...led.vehicle, rgb: led.rgb, state: effectiveState(led) }] : [];

  for (const led of entries) {
    const id = Number(led?.id);
    if (!Number.isInteger(id) || id < 0 || id >= ledCount) continue;
    const current = byId.get(id);
    if (!current || priority(led) > priority(current)) {
      byId.set(id, { ...led, id });
      continue;
    }
    if (priority(led) < priority(current)) continue;

    const mergedOccupants = [...occupants(current), ...occupants(led)];
    const uniqueOccupants = [...new Map(mergedOccupants.map(value => [String(value?.id || JSON.stringify(value)), value])).values()];
    byId.set(id, { ...current, occupants: uniqueOccupants });
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function applyMotionLifecycle(frame, previous = {}, now = Date.now(), afterglowMs = SIGNAL_POLICY.departureAfterglowSeconds * 1000) {
  // Invisible departure memory is independent of the visible afterglow.
  // Bound its lifetime so missing vehicles cannot remain latched indefinitely.
  previous = Object.fromEntries(Object.entries(previous).filter(([, value]) =>
    !value.hiddenUntil || value.hiddenUntil > now));
  afterglowMs = Math.max(0, Number(afterglowMs) || 0);
  const atStopConfirmationSeconds = Math.max(0, Number(frame.motionPolicy?.atStopConfirmationSeconds) || 0);
  const next = {};
  const leds = [];
  const seen = new Set();
  const activeVehicleIds = new Set((frame.leds || []).map(led => String(led.vehicle?.id || "")).filter(Boolean));
  const previousByVehicle = new Map(Object.entries(previous).filter(([, value]) => value.vehicleId).map(entry => [entry[1].vehicleId, entry]));

  for (const incomingLed of frame.leds || []) {
    let led = incomingLed;
    let id = String(led.id);
    const vehicleId = String(led.vehicle?.id || "");
    const hasCollision = (led.occupants || []).length > 1;
    const previousPosition = previousByVehicle.get(vehicleId);
    const stationDepartureRadius = Number(frame.motionPolicy?.stationDepartureRadiusMeters);
    const stationDistance = Number(led.vehicle?.stationDistanceMeters);
    const nearestStationLed = String(led.vehicle?.nearestStationLed ?? "");
    const previousPositionType = previousPosition?.[1].led.vehicle?.positionType;
    const stationOnlyDeparture = frame.boardProfile === "grakallbanen-prototype-board" &&
      !hasCollision && led.state === "APPROACHING" && previousPosition && previousPosition[0] !== id &&
      (previousPositionType === "station" || previousPositionType === "station-approach");
    if (stationOnlyDeparture && previousPosition[1].state === "AT_STOP") {
      const [passedId, passedBefore] = previousPosition;
      const passed = makePassedLed(passedBefore.led);
      leds.push(passed);
      next[passedId] = { ...passedBefore, state: "PASSED", expiresAt: now + afterglowMs, led: passed };
      seen.add(id);
      seen.add(passedId);
      continue;
    }
    if (stationOnlyDeparture && previousPosition[1].state === "PASSED" && previousPosition[1].expiresAt > now) {
      const [passedId, passedBefore] = previousPosition;
      const passed = makePassedLed(passedBefore.led);
      leds.push(passed);
      next[passedId] = { ...passedBefore, led: passed };
      seen.add(id);
      seen.add(passedId);
      continue;
    }
    if (!hasCollision && GRAKALL_BOARD_IDS.has(frame.boardProfile) && led.state === "APPROACHING" && previousPosition &&
        previousPosition[0] !== id && (previousPosition[1].state === "AT_STOP" || previousPosition[1].state === "PASSED") &&
        previousPosition[1].led.vehicle?.positionType === "station" && Number.isFinite(stationDepartureRadius) &&
        nearestStationLed === previousPosition[0] && Number.isFinite(stationDistance) && stationDistance <= stationDepartureRadius) {
      const [passedId, passedBefore] = previousPosition;
      const passed = makePassedLed(passedBefore.led);
      leds.push(passed);
      next[passedId] = { ...passedBefore, state: "PASSED", expiresAt: 0, led: passed };
      seen.add(id);
      seen.add(passedId);
      continue;
    }
    if (!hasCollision && GRAKALL_BOARD_IDS.has(frame.boardProfile) && previousPosition) {
      const previousId = Number(previousPosition[0]), currentId = Number(id), gap = Math.abs(currentId - previousId);
      if (Number.isInteger(previousId) && Number.isInteger(currentId) && gap > 1 && gap <= 4) {
        const interpolatedId = previousId + Math.sign(currentId - previousId);
        led = {
          ...led,
          id: interpolatedId,
          state: "APPROACHING",
          occupants: (led.occupants || []).map(occupant => ({ ...occupant, state: "APPROACHING" }))
        };
        id = String(interpolatedId);
      }
    }
    const reportedDistance = Number(led.vehicle?.distanceMeters);
    const distanceFromStation = Number(led.vehicle?.stationDistanceMeters);
    const distance = Number.isFinite(reportedDistance) ? reportedDistance : distanceFromStation;
    const before = previous[id];
    const sameVehicle = before && before.vehicleId === vehicleId;
    if (!hasCollision && sameVehicle && before.state === "PASSED" &&
        before.expiresAt > 0 && before.expiresAt <= now) {
      // Continued observations at the same point are not evidence of a new
      // arrival. Expire this memory only after observations stop, or advance.
      next[id] = { ...before, hiddenUntil: now + 120000 };
      seen.add(id);
      continue;
    }
    const latitude = Number(led.vehicle?.latitude), longitude = Number(led.vehicle?.longitude);
    const hasPosition = Number.isFinite(latitude) && Number.isFinite(longitude);
    const anchorLatitude = Number(before?.stationaryAnchorLatitude);
    const anchorLongitude = Number(before?.stationaryAnchorLongitude);
    const movementMeters = sameVehicle && hasPosition && Number.isFinite(anchorLatitude) && Number.isFinite(anchorLongitude)
      ? distanceBetweenCoordinates(latitude, longitude, anchorLatitude, anchorLongitude)
      : Infinity;
    const remainsStationary = sameVehicle && movementMeters <= SIGNAL_POLICY.parkedMovementThresholdMeters;
    const stationarySince = remainsStationary ? Number(before.stationarySince || now) : now;
    const stationaryAnchorLatitude = remainsStationary ? anchorLatitude : latitude;
    const stationaryAnchorLongitude = remainsStationary ? anchorLongitude : longitude;
    if (hasPosition && now - stationarySince >= SIGNAL_POLICY.parkedAfterSeconds * 1000) {
      const parked = makeParkedLed(led);
      leds.push(parked);
      next[id] = { vehicleId, state: "PARKED", distance, expiresAt: 0, led: parked, latitude, longitude, stationarySince, stationaryAnchorLatitude, stationaryAnchorLongitude };
      seen.add(id);
      continue;
    }
    // Once this vehicle has started leaving a station, a short GPS regression
    // into the arrival radius must not place it back at the stop. Keep PASSED
    // latched until the live position advances outside the departure zone.
    // A genuine later return is unaffected because the vehicle will first have
    // owned another LED and this old per-LED state will have been removed.
    if (!hasCollision && led.state === "AT_STOP" && sameVehicle && before.state === "PASSED") {
      const passed = makePassedLed(led);
      leds.push(passed);
      next[id] = {
        vehicleId,
        state: "PASSED",
        distance,
        expiresAt: before.expiresAt,
        led: passed,
        latitude,
        longitude,
        stationarySince,
        stationaryAnchorLatitude,
        stationaryAnchorLongitude
      };
      seen.add(id);
      continue;
    }
    // GPS proximity alone does not prove that a vehicle has stopped. Keep the
    // station LED pulsing until one complete feed interval confirms that the
    // same vehicle remains within the stationary tolerance. This also prevents
    // a moving vehicle from jumping directly from a pulsing segment LED to a
    // fixed station LED.
    if (led.state === "AT_STOP" && hasPosition && atStopConfirmationSeconds > 0 && now - stationarySince < atStopConfirmationSeconds * 1000) {
      led = {
        ...led,
        state: "APPROACHING",
        occupants: (led.occupants || []).map(occupant => ({
          ...occupant,
          state: occupant.state === "AT_STOP" ? "APPROACHING" : occupant.state
        }))
      };
    }
    // Distance can increase while a stationary tram's GPS wanders inside the
    // station radius. Only a change out of AT_STOP may begin departure.
    // APPROACHING means the vehicle has not reached this point yet. GPS
    // movement away from an approach target must therefore not manufacture a
    // PASSED event. PASSED is allowed only after this vehicle was actually
    // AT_STOP at the same station (or is already in its latched PASSED state).
    const departing = led.state === "APPROACHING" && sameVehicle &&
      (before.state === "AT_STOP" || before.state === "PASSED");
    seen.add(id);

    if (departing) {
      // Lifecycle is tracked by the leading vehicle, but one physical LED may
      // contain another live vehicle. When the leader departs, that remaining
      // APPROACHING/AT_STOP vehicle must replace PASSED instead of disappearing
      // behind the departing vehicle's afterglow.
      const replacement = promoteRemainingOccupant(led, vehicleId);
      if (replacement) {
        const replacementVehicleId = String(replacement.vehicle?.id || "");
        const replacementDistance = Number(replacement.vehicle?.distanceMeters ?? replacement.vehicle?.stationDistanceMeters);
        leds.push(replacement);
        next[id] = {
          vehicleId: replacementVehicleId,
          state: replacement.state,
          distance: replacementDistance,
          expiresAt: 0,
          led: replacement,
          latitude: Number(replacement.vehicle?.latitude),
          longitude: Number(replacement.vehicle?.longitude),
          stationarySince: now,
          stationaryAnchorLatitude: Number(replacement.vehicle?.latitude),
          stationaryAnchorLongitude: Number(replacement.vehicle?.longitude)
        };
        continue;
      }
      const expiresAt = before.state === "PASSED" ? before.expiresAt : now + afterglowMs;
      if (expiresAt > now) {
        const passed = makePassedLed(led);
        leds.push(passed);
        next[id] = { vehicleId, state: "PASSED", distance, expiresAt, led: passed, latitude, longitude, stationarySince, stationaryAnchorLatitude, stationaryAnchorLongitude };
      } else {
        next[id] = { ...before, hiddenUntil: before.hiddenUntil || now + 120000 };
      }
      continue;
    }

    leds.push(led);
    next[id] = { vehicleId, state: led.state, distance, expiresAt: 0, led, latitude, longitude, stationarySince, stationaryAnchorLatitude, stationaryAnchorLongitude };
  }

  for (const [id, before] of Object.entries(previous)) {
    if (seen.has(id)) continue;
    // A vehicle can own only one physical LED. Once it appears at its new
    // position, its old afterglow must disappear instead of creating a clone.
    if (before.vehicleId && activeVehicleIds.has(before.vehicleId)) continue;
    // A linear GPS board must never invent PASSED on an intermediate LED or
    // keep a stale vehicle alive without a current position sample.
    if (GRAKALL_BOARD_IDS.has(frame.boardProfile)) {
      if (before.state === "PASSED") next[id] = {
        ...before, hiddenUntil: before.hiddenUntil || now + 120000
      };
      continue;
    }
    const expiresAt = before.state === "PASSED" ? before.expiresAt : now + afterglowMs;
    if (expiresAt <= now) continue;
    const passed = makePassedLed(before.led);
    leds.push(passed);
    next[id] = { ...before, state: "PASSED", expiresAt, led: passed };
  }

  const normalizedLeds = normalizeLedEntries(leds, Number(frame.ledCount) || Infinity);
  const normalizedState = {};
  for (const [id, value] of Object.entries(next)) {
    if (value.hiddenUntil && !normalizedLeds.some(led => String(led.id) === id)) {
      normalizedState[id] = value;
    }
  }
  for (const led of normalizedLeds) {
    const id = String(led.id), vehicleId = String(led.vehicle?.id || "");
    const matching = Object.values(next).find(value => value.vehicleId === vehicleId) || next[id];
    normalizedState[id] = matching
      ? { ...matching, vehicleId, state: led.lifecycle || led.state, led }
      : { vehicleId, state: led.lifecycle || led.state, expiresAt: 0, led };
  }
  return { frame: { ...frame, leds: normalizedLeds }, state: normalizedState };
}

export function holdTransientEmptyFrame(frame, previous = null, now = Date.now(), holdMs = 0) {
  const hasSignals = Array.isArray(frame.leds) && frame.leds.length > 0;
  if (hasSignals) return { frame, previous: { frame, receivedAt: now } };
  const age = now - Number(previous?.receivedAt || 0);
  if (!previous?.frame || previous.frame.profileFingerprint !== frame.profileFingerprint ||
      previous.frame.ledCount !== frame.ledCount || age < 0 || age > Math.max(0, Number(holdMs) || 0)) {
    return { frame, previous };
  }
  return {
    frame: { ...previous.frame, generatedAt: frame.generatedAt, sequence: frame.sequence,
      ttlSeconds: Math.max(10, Math.min(frame.ttlSeconds, Math.ceil((holdMs - age) / 1000))),
      dataQuality: { state: "held", reason: "empty_feed", ageSeconds: Math.floor(age / 1000),
        lastLiveAt: new Date(previous.receivedAt).toISOString() } },
    previous
  };
}

export function buildSignalTestSequence({
  boardProfile,
  profileRevision = 1,
  profileFingerprint = "",
  ledCount,
  ledId,
  firstLine,
  secondLine,
  brightness = SIGNAL_POLICY.fullBrightness,
  now = Date.now(),
  afterglowMs = SIGNAL_POLICY.departureAfterglowSeconds * 1000
}) {
  const base = {
    schemaVersion: 1,
    signalPolicy: SIGNAL_POLICY,
    boardProfile,
    profileRevision,
    profileFingerprint,
    ttlSeconds: 30,
    ledCount
  };
  const testLed = (line, state, distanceMeters) => ({
    id: ledId,
    rgb: line.rgb,
    brightness,
    state,
    vehicle: {
      id: `signal-test-${line.code}`,
      line: String(line.code),
      destination: "SIGNALTEST",
      ageSeconds: 0,
      distanceMeters
    },
    occupants: [{
      id: `signal-test-${line.code}`,
      line: String(line.code),
      destination: "SIGNALTEST",
      rgb: line.rgb,
      state,
      ageSeconds: 0,
      distanceMeters
    }]
  });
  const raw = [
    [testLed(firstLine, "APPROACHING", 140)],
    [testLed(firstLine, "AT_STOP", 10)],
    [],
    [testLed(secondLine, "APPROACHING", 140)],
    [testLed(firstLine, "AT_STOP", 10)],
    [testLed(secondLine, "AT_STOP", 10)],
    [],
    []
  ];
  const offsets = [0, 1000, 2000, 3000, 4000, 5000, 6000, 6000 + afterglowMs + 1];
  let lifecycle = {};
  return raw.map((leds, index) => {
    const timestamp = now + offsets[index];
    const input = {
      ...base,
      generatedAt: new Date(timestamp).toISOString(),
      sequence: Math.floor(timestamp / 1000),
      leds
    };
    const result = applyMotionLifecycle(input, lifecycle, timestamp, afterglowMs);
    lifecycle = result.state;
    return result.frame;
  });
}

export class DeviceStatus {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/logs" || url.pathname === "/logs/session")
      return diagnosticsRequest(this.state.storage, request);
    if (url.pathname === "/registry-page" && request.method === "GET") {
      const limit=Math.max(1,Math.min(50,Number(url.searchParams.get("limit"))||20));
      const after=url.searchParams.get("after")||"";
      const values=await this.state.storage.list({prefix:"device:",limit:limit+1,...(after?{startAfter:"device:"+after}:{})});
      const entries=[...values.values()];
      return statusJson({devices:entries.slice(0,limit),nextCursor:entries.length>limit?entries[limit-1].deviceId:null});
    }
    if (url.pathname === "/registry") {
      if (request.method === "GET") {
        const stored = await this.state.storage.list({ prefix: "device:" });
        const devices = [...stored.values()].map(({ tokenHash, ...device }) => device)
          .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
        return statusJson({ devices });
      }
      if (request.method === "POST") {
        const command = await request.json();
        const key = `device:${command.deviceId}`;
        const current = await this.state.storage.get(key);
        if (command.action === "create") {
          if (current) return statusJson({ error: "device_exists" }, 409);
          const device = {
            deviceId: command.deviceId,
            boardProfile: command.boardProfile,
            label: command.label,
            tokenHash: command.tokenHash,
            enabled: true,
            createdAt: command.changedAt,
            rotatedAt: command.changedAt
          };
          await this.state.storage.put(key, device);
          return statusJson({ ok: true });
        }
        if (!current) return statusJson({ error: "not_found" }, 404);
        if (command.action === "configure") {
          if (!validBoardId(command.hardwareProfile) || !validateDeviceSettings(command.deviceConfig).valid)
            return statusJson({ error: "invalid_device_config" }, 400);
          const {pollIntervalSeconds,statusIntervalSeconds,brightnessLimit,otaEnabled,featureFlags}=command.deviceConfig;
          await this.state.storage.put(key, {...current, hardwareProfile:command.hardwareProfile,
            deviceConfig:{pollIntervalSeconds,statusIntervalSeconds,brightnessLimit,otaEnabled,featureFlags,
              ...(command.deviceConfig.visual===undefined?{}:{visual:command.deviceConfig.visual})},
            configuredAt:command.changedAt});
          return statusJson({ok:true});
        }
        if (command.action === "rotate") {
          await this.state.storage.put(key, { ...current, tokenHash: command.tokenHash, enabled: true, rotatedAt: command.changedAt });
          return statusJson({ ok: true });
        }
        if (command.action === "revoke") {
          await this.state.storage.put(key, { ...current, enabled: false, revokedAt: command.changedAt });
          return statusJson({ ok: true });
        }
        return statusJson({ error: "invalid_action" }, 400);
      }
      return statusJson({ error: "method_not_allowed" }, 405);
    }
    const registryDeviceMatch = url.pathname.match(/^\/registry\/([^/]+)$/);
    if (registryDeviceMatch && request.method === "GET") {
      const device = await this.state.storage.get(`device:${registryDeviceMatch[1]}`);
      return device ? statusJson(device) : statusJson({ error: "not_found" }, 404);
    }
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
      const { frame, now, afterglowMs, emptyFrameHoldMs } = await request.json();
      const timestamp = Number(now) || Date.now();
      const previousNonEmpty = (await this.state.storage.get("motionLastNonEmpty")) || null;
      const holdMs = GRAKALL_BOARD_IDS.has(frame.boardProfile) ? 300000 : emptyFrameHoldMs;
      const rendered = await this.state.storage.get("motionLastRendered");
      const held = holdTransientEmptyFrame(frame, rendered || previousNonEmpty, timestamp, holdMs);
      if (held.frame.dataQuality?.state === "held") {
        // Do not replay old GPS samples through motion/parked detection.
        return statusJson(held.frame);
      }
      const previous = (await this.state.storage.get("motion")) || {};
      const result = applyMotionLifecycle(held.frame, previous, timestamp, afterglowMs);
      if (GRAKALL_BOARD_IDS.has(frame.boardProfile)) result.frame.ttlSeconds = 300;
      // Lifecycle suppression can make a nonempty input produce an empty
      // display. Guard that output too, without rolling back motion memory.
      const display = GRAKALL_BOARD_IDS.has(frame.boardProfile)
        ? holdTransientEmptyFrame(result.frame, rendered, timestamp, holdMs).frame
        : result.frame;
      if (frame.leds?.length && result.frame.leds.length) {
        await this.state.storage.put("motionLastRendered", { frame: result.frame, receivedAt: timestamp });
      }
      await this.state.storage.put("motion", result.state);
      return statusJson(display);
    }
    if (url.pathname === "/telemetry" && request.method === "GET") {
      const stored=await this.state.storage.get("latest")||null;
      const latest=stored?{...publicSample(stored),health:stored.health,
        _telemetry:{deltas:stored._telemetry?.deltas,reboots:stored._telemetry?.reboots}}:null;
      const soak=await this.state.storage.get("soak")||null;
      if(url.searchParams.get("detail")!=="1")return statusJson({latest,soak:soak?{...soak,history:undefined}:null});
      const history=await this.state.storage.get("history")||[];
      const errors=await this.state.storage.get("errors")||[];
      return statusJson({latest,history,errors,soak});
    }
    if (request.method === "POST") {
      const result=await storeTelemetry(this.state.storage,await request.json());
      const response=statusJson(result.body,result.status);
      if(result.retryAfter)response.headers.set("retry-after",String(result.retryAfter));
      return response;
    }
    const latest = await this.state.storage.get("latest");
    const history = await this.state.storage.get("history") || [];
    const errors = await this.state.storage.get("errors") || [];
    return statusJson({ latest: publicSample(latest), history: history.map(publicSample), errors:errors.map(publicEvent) });
  }
}

export function resolveDeviceRegistration(env, deviceId) {
  let registrations = {};
  try {
    registrations = JSON.parse(env.DEVICE_INGEST_TOKENS || "{}");
  } catch {
    throw Error("invalid DEVICE_INGEST_TOKENS secret");
  }
  const entry = registrations[deviceId];
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const token = String(entry.token || "");
    const boardProfile = String(entry.boardProfile || "");
    if (entry.enabled === false || token.length < 32 || !validBoardId(boardProfile)) return null;
    return { deviceId, boardProfile, token, legacy: false };
  }
  // Temporary migration path: existing installations use the board profile as
  // device ID and the old shared secret. New installations must use the map.
  if (BOARD_IDS.has(deviceId) && env.STATUS_INGEST_TOKEN) {
    return { deviceId, boardProfile: deviceId, token: String(env.STATUS_INGEST_TOKEN), legacy: true };
  }
  return null;
}

async function secureTokenEquals(actual, expected) {
  const encode = value => new TextEncoder().encode(String(value));
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode(actual)),
    crypto.subtle.digest("SHA-256", encode(expected))
  ]);
  const left = new Uint8Array(actualHash), right = new Uint8Array(expectedHash);
  let different = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    different |= (left[index] || 0) ^ (right[index] || 0);
  }
  return different === 0;
}

async function tokenHash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))));
  return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function lookupDeviceRegistration(env, deviceId) {
  if (env.DEVICE_STATUS) {
    const registry = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName("__device-registry__"));
    const response = await registry.fetch(`https://status.internal/registry/${encodeURIComponent(deviceId)}`);
    if (response.ok) {
      const entry = await response.json();
      if (entry.enabled && validBoardId(entry.boardProfile) && /^[0-9a-f]{64}$/.test(entry.tokenHash || "")) {
        return { ...entry, legacy: false };
      }
      return null;
    }
    if(response.status!==404)throw Error("Device registry unavailable");
  }
  return resolveDeviceRegistration(env, deviceId);
}

export function cleanStatusPayload(value, deviceId, boardProfile, receivedAt) {
  const firmware = String(value?.firmware || "");
  if (!value || value.schemaVersion !== 1 || (value.deviceId && value.deviceId !== deviceId) || value.boardProfile !== boardProfile || !["1.0.4","1.0.5","1.0.6","1.0.7","1.0.8","1.0.9","1.0.10","1.1.0","1.1.1","1.1.2","1.1.3","1.1.4","1.1.5","1.1.6","1.1.7","1.1.8","1.1.9","1.2.0","1.2.1","1.2.2","1.2.3","1.2.4","1.2.5","1.2.6","1.2.7","1.2.8","1.2.9","1.2.10","1.2.11","1.2.12","1.2.13"].includes(firmware)) {
    throw Error("invalid status payload");
  }
  const profileRevision = Number(value.profileRevision || 0);
  const profileFingerprint = String(value.profileFingerprint || "");
  if (!Number.isInteger(profileRevision) || profileRevision < 0 || profileRevision > 0xffffffff ||
      (profileRevision > 0) !== (profileFingerprint.length > 0) ||
      (profileFingerprint && !/^[0-9a-f]{16}$/.test(profileFingerprint))) {
    throw Error("invalid profile identity");
  }
  const number = (name, max = 0xffffffff) => {
    const result = Number(value[name]);
    if (!Number.isFinite(result) || result < 0 || result > max) throw Error(`invalid ${name}`);
    return Math.floor(result);
  };
  const cleanError = (input, requireId = false) => {
    const code = String(input?.code || "");
    const detail = String(input?.detail || "");
    if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(code) || detail.length > 160 || /[\u0000-\u001f\u007f]/.test(detail)) {
      throw Error("invalid lastError");
    }
    const occurredAtUptimeSeconds = Number(input.occurredAtUptimeSeconds);
    const occurrences = Number(input.occurrences);
    if (!Number.isInteger(occurredAtUptimeSeconds) || occurredAtUptimeSeconds < 0 ||
        !Number.isInteger(occurrences) || occurrences < 1 || occurrences > 0xffffffff) {
      throw Error("invalid lastError counters");
    }
    const id = input.id == null ? null : Number(input.id);
    if ((requireId || id != null) && (!Number.isInteger(id) || id < 1 || id > 0xffffffff)) throw Error("invalid error id");
    return id == null ? { code, detail, occurredAtUptimeSeconds, occurrences } : { id, code, detail, occurredAtUptimeSeconds, occurrences };
  };
  const lastError = value.lastError == null ? null : cleanError(value.lastError);
  if (value.errorQueue != null && (!Array.isArray(value.errorQueue) || value.errorQueue.length > 10)) throw Error("invalid errorQueue");
  const errorQueue = (value.errorQueue || []).map(error => cleanError(error, true));
  return {
    schemaVersion: 1,
    deviceId,
    boardProfile,
    firmware,
    resetReason: value.resetReason == null ? 0 : number("resetReason", 20),
    profileRevision,
    profileFingerprint,
    receivedAt: new Date(receivedAt).toISOString(),
    uptimeSeconds: number("uptimeSeconds"),
    wifiOutages: number("wifiOutages"),
    wifiRecoveries: number("wifiRecoveries"),
    feedSuccesses: number("feedSuccesses"),
    feedFailures: number("feedFailures"),
    frameAgeSeconds: number("frameAgeSeconds"),
    frameValid: Boolean(value.frameValid),
    freeHeap: number("freeHeap", 1000000),
    minimumFreeHeap: number("minimumFreeHeap", 1000000),
    lastError,
    errorQueue
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

async function runBackgroundChecks(env) {
  await Promise.all([...BOARD_IDS].map(async boardId => {
    // Run the same pipeline directly; workers.dev self-fetches can return 404.
    await boardFrameResponse(boardId, env, "scheduled");
  }));
}

const statusPage = `<!doctype html><html lang="no"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TransitCore status</title><style>body{font:16px system-ui;background:#0b1220;color:#e5edf8;margin:0;padding:24px}.wrap{max-width:720px;margin:auto}h1{margin:0 0 6px}.sub{color:#9fb0c8;margin-bottom:22px}.card{background:#131d2e;border:1px solid #26344b;border-radius:16px;padding:18px;margin:12px 0}.row{display:flex;justify-content:space-between;gap:16px;margin:8px 0}.dot{width:12px;height:12px;border-radius:50%;display:inline-block;margin-right:8px}.ok{background:#22c55e}.warn{background:#f59e0b}.off{background:#ef4444}.muted{color:#9fb0c8}.device-error{margin-top:12px;padding:10px;border-radius:9px;background:#4b2025;color:#ffb4b4}code{color:#cfe3ff}</style><div class="wrap"><h1>TransitCore status</h1><div class="sub">Oppdateres automatisk hvert 30. sekund</div><div id="cards">Laster…</div></div><script>const names={'trondheim-bus-board':'Trondheim buss','oslo-metro-board':'Oslo T-bane','oslo-metro-wizard-separate':'Oslo linje 1 – separate LED-er','grakallbanen-board':'Gråkallbanen'};function esc(x){return String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}function deviceName(d){return d.label||names[d.boardProfile]||names[d.deviceId]||d.deviceId}async function load(){const data=await fetch('/v1/status',{cache:'no-store'}).then(r=>r.json());cards.innerHTML=data.devices.map(d=>{if(!d.latest)return '<div class="card"><div><span class="dot off"></span>'+esc(deviceName(d))+'</div><p class="muted">Ingen status mottatt</p></div>';const s=d.latest,age=Math.max(0,Math.floor((Date.now()-Date.parse(s.receivedAt))/1000)),state=age<=420&&s.frameValid?'ok':age<=900?'warn':'off',label=state==='ok'?'Online':state==='warn'?'Varsel':'Frakoblet',lastError=s.lastError||d.mostRecentError,deviceError=lastError?'<div class="device-error"><b>Siste feil: '+esc(lastError.code)+'</b><br>'+esc(lastError.detail)+' · '+lastError.occurrences+' gang(er) · '+d.errorCount+' lagret</div>':'';return '<div class="card"><div><span class="dot '+state+'"></span><b>'+esc(deviceName(d))+'</b> · '+label+'</div><div class="row"><span>Sist sett</span><span>'+age+' s siden</span></div><div class="row"><span>Firmware</span><code>'+esc(s.firmware)+'</code></div><div class="row"><span>Oppetid</span><span>'+Math.floor(s.uptimeSeconds/60)+' min</span></div><div class="row"><span>Wi‑Fi brudd / tilbake</span><span>'+s.wifiOutages+' / '+s.wifiRecoveries+'</span></div><div class="row"><span>Feed OK / feil</span><span>'+s.feedSuccesses+' / '+s.feedFailures+'</span></div><div class="row"><span>Heap / minimum</span><span>'+s.freeHeap+' / '+s.minimumFreeHeap+'</span></div>'+deviceError+'</div>'}).join('')}load().catch(e=>cards.textContent='Status kunne ikke lastes: '+e.message);setInterval(load,30000)</script></html>`;

const efficientStatusPage = statusPage
  .replace("Oppdateres automatisk hvert 30. sekund", "Oppdateres automatisk hvert 2. minutt mens fanen er synlig")
  .replace("setInterval(load,30000)", "let timer=setInterval(()=>{if(!document.hidden)load()},120000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()})");

// Preserve existing raw-input exports for downstream tests/legacy callers.
function frameContext(input) {
  return {...input, signalPolicy: SIGNAL_POLICY,
    atStopConfirmationSeconds: GRAKALL_BOARD_IDS.has(input.board.id) ? 0 : SIGNAL_POLICY.atStopConfirmationSeconds};
}
export function buildFrame(input) {
  return buildPixelFrame(frameContext({...input, vehicles: input.vehicles.map(normalizeEnturVehicle)}), {strategy: "station-network"});
}
export function buildLinearRouteFrame(input) {
  return buildPixelFrame(frameContext({...input, vehicles: input.vehicles.map(normalizeEnturVehicle)}), {strategy: "linear-route-vled"});
}

async function fetchJson(url, options) {
  return boundedFetchJson(url, options);
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
  await attachProfileIdentity(board,resolvedHardware);
  const value = { board, profiles, hardware: resolvedHardware };
  configCache.set(boardId, { loadedAt: now, value });
  return value;
}

async function liveVehicles(endpoint, codespaceId) {
  return enturProvider.loadVehicles({endpoint,codespaceId});
}

export function vehicleProviderGroups(profiles) {
  const groups = new Map();
  for (const profile of profiles) {
    const endpoint = profile.provider?.vehicleEndpoint;
    const codespaceId = profile.provider?.codespaceId;
    if (!endpoint || !codespaceId) throw Error(`Vehicle provider missing for ${profile.id}`);
    const key = `${endpoint}|${codespaceId}`;
    if (!groups.has(key)) groups.set(key, { endpoint, codespaceId });
  }
  return [...groups.values()];
}

async function liveVehiclesForProfiles(profiles) {
  const batches = await Promise.all(vehicleProviderGroups(profiles).map(provider =>
    liveVehicles(provider.endpoint, provider.codespaceId)
  ));
  return batches.flat();
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

function frameFromStationArrivals(board, hardware, estimatedCalls, now) {
  return buildPixelFrame(frameContext({board, hardware, estimatedCalls, now}), {strategy: "estimated-calls"});
}

async function liveFrameForConfiguration(board, profiles, hardware, now) {
  const arrivalProfiles = profiles.filter(profile => profile.positioning?.strategy === "estimated-station-calls");
  const vehicleProfiles = profiles.filter(profile => profile.positioning?.strategy !== "estimated-station-calls");
  const frames = [];
  if (vehicleProfiles.length) {
    const vehicles = await liveVehiclesForProfiles(vehicleProfiles);
    frames.push(buildPixelFrame(frameContext({ board, profiles: vehicleProfiles, hardware, vehicles, now })));
  }
  if (arrivalProfiles.length) {
    board.hardware = hardware;
    const arrivals = await liveStationArrivals(board, arrivalProfiles, now);
    frames.push(frameFromStationArrivals(board, hardware, arrivals, now));
  }
  if (!frames.length) throw Error("No live positioning strategy configured");
  const frame = frames[0];
  if (frames.length > 1) frame.leds = normalizeLedEntries(frames.flatMap(value => value.leds), frame.ledCount);
  return frame;
}

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" };
const response = (body, status = 200) => new Response(JSON.stringify(body, null, 2) + "\n", { status, headers });

async function boardFrameResponse(boardId, env, source) {
  const now = Date.now(), deadline = now + FRAME_BUDGET_MS;
  let stage = "configuration";
  const step = (name, operation) => {
    stage = name;
    return boundedOperation(name, operation, deadline - Date.now(), { boardId, source });
  };
  let result, sample;
  try {
    const { board, profiles, hardware } = await step("configuration", () => configuration(boardId, now));
    const rawFrame = await step("live_data", () => liveFrameForConfiguration(board, profiles, hardware, now));
    const frame = await step("motion", () => stabilizeMotionFrame(env, board, rawFrame, now));
    sample = { ...validFrameSummary(frame, boardId), source };
    result = response(frame);
  } catch (error) {
    console.error(JSON.stringify({ event: "feed_request_failed", boardId, source, stage,
      elapsedMs: Date.now() - now, code: error.code || "FEED_ERROR" }));
    sample = { state: "FEED_ERROR", detail: `${stage}: ${error.message}`, activeLeds: 0, source };
    result = response({ error: "feed_unavailable", stage, generatedAt: new Date().toISOString() }, 503);
  }
  // A monitoring-storage problem must not discard a valid LED frame.
  try {
    await boundedOperation("monitor", () => recordBoardMonitor(env, boardId, sample),
      MONITOR_TIMEOUT_MS, { boardId, source });
  } catch { /* The bounded operation already logged the monitoring failure. */ }
  return result;
}

async function stabilizeMotionFrame(env, board, frame, now) {
  const configured = board.render?.departureAfterglowSeconds;
  const afterglowSeconds = configured == null && (board.id === "trondheim-bus-board" || GRAKALL_BOARD_IDS.has(board.id))
    ? SIGNAL_POLICY.departureAfterglowSeconds
    : Math.max(0, Math.min(SIGNAL_POLICY.departureAfterglowSeconds, Number(configured) || 0));
  const emptyFrameHoldSeconds = Math.max(0, Math.min(60, Number(board.render?.emptyFrameHoldSeconds) || 0));
  if (!afterglowSeconds || !env.DEVICE_STATUS) return attachSignalPolicy(frame);
  const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(board.id));
  const result = await stub.fetch("https://status.internal/motion", {
    method: "POST",
    body: JSON.stringify({ frame, now, afterglowMs: afterglowSeconds * 1000, emptyFrameHoldMs: emptyFrameHoldSeconds * 1000 })
  });
  if (!result.ok) throw Error(`motion state: HTTP ${result.status}`);
  return attachSignalPolicy(await result.json());
}

// Git-connected deploys reuse the encrypted publishing secrets configured in Cloudflare.
const publishCors={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"https://5mkbt4m7n8-hue.github.io","access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"POST, OPTIONS"};
const publishResponse=(body,status=200)=>new Response(JSON.stringify(body,null,2)+"\n",{status,headers:publishCors});
export function validatePublishProfiles(board,hardware){
 if(!board||!hardware||![1,2].includes(board.schemaVersion)||hardware.schemaVersion!==1)throw Error("Unsupported profile format");
 if(typeof board.id!=="string"||!/^[a-z0-9-]+$/.test(board.id))throw Error("Invalid board id");
 if(hardware.boardProfile!==board.id)throw Error("Board/hardware profile mismatch");
 const nodes=Array.isArray(board.nodes)?board.nodes:[],assignments=Array.isArray(hardware.assignments)?hardware.assignments:[],routes=Array.isArray(board.routes)?board.routes:[];
 if(!routes.length||routes.some(id=>typeof id!=="string"||!id)||new Set(routes).size!==routes.length)throw Error("Invalid or duplicate board route");
 if(!nodes.length||board.leds?.count!==nodes.length||hardware.leds?.count!==nodes.length||assignments.length!==nodes.length)throw Error("LED count mismatch");
 const afterglow=Number(board.render?.departureAfterglowSeconds||0);
 if(!Number.isFinite(afterglow)||afterglow<0||afterglow>10)throw Error("Departure afterglow must be between 0 and 10 seconds");
 if(!Number.isInteger(hardware.leds?.brightnessLimit)||hardware.leds.brightnessLimit<1||hardware.leds.brightnessLimit>255)throw Error("Invalid hardware brightness limit");
 const routeSet=new Set(routes),nodeById=new Map(nodes.map(n=>[n.id,n])),logical=new Set(),physical=new Set(),sources=new Set();
 if(nodeById.size!==nodes.length)throw Error("Duplicate board node id");
 for(const node of nodes){
  if(typeof node.id!=="string"||!node.id||typeof node.name!=="string"||!node.name.trim())throw Error("Node is missing id or name");
  if(!Number.isInteger(node.led)||node.led<0||logical.has(node.led))throw Error("Duplicate or invalid logical LED");
  const linearSegment=board.layout==="linear-route-vled"&&node.type==="segment";
  if(!Array.isArray(node.stopIds)||(!linearSegment&&!node.stopIds.length)||node.stopIds.some(id=>typeof id!=="string"||!id))throw Error("Node is missing valid stop id");
  if(!Array.isArray(node.routes)||!node.routes.length||node.routes.some(id=>!routeSet.has(id)))throw Error("Node references unknown or missing route");
  const directions=node.routeDirections;
  if(directions!==undefined){
   if(!directions||typeof directions!=="object"||Array.isArray(directions))throw Error("Invalid route direction map");
   for(const [routeId,value] of Object.entries(directions)){
    if(!node.routes.includes(routeId)||!value||!Array.isArray(value.directionIds)||!value.directionIds.length)throw Error("Invalid route direction mapping");
    if(value.directionIds.some(id=>typeof id!=="string"&&typeof id!=="number"))throw Error("Invalid direction id");
   }
  }
  const hasLat=node.lat!==undefined&&node.lat!==null,hasLon=node.lon!==undefined&&node.lon!==null;
  if(hasLat!==hasLon)throw Error("Node coordinates must contain both latitude and longitude");
  if(hasLat&&(!Number.isFinite(node.lat)||!Number.isFinite(node.lon)||node.lat< -90||node.lat>90||node.lon< -180||node.lon>180))throw Error("Node has invalid coordinates");
  logical.add(node.led);
 }
 for(const a of assignments){
  const node=nodeById.get(a.sourceNodeId);
  if(!node||node.led!==a.logicalLed||sources.has(a.sourceNodeId))throw Error("Invalid hardware source mapping");
  if(!Number.isInteger(a.physicalLed)||a.physicalLed<0||a.physicalLed>=nodes.length||physical.has(a.physicalLed))throw Error("Duplicate or invalid physical LED");
  sources.add(a.sourceNodeId);physical.add(a.physicalLed);
 }
 if([...physical].sort((a,b)=>a-b).some((value,index)=>value!==index))throw Error("Physical LEDs are not continuous");
 return true;
}
function base64Utf8(value){const bytes=new TextEncoder().encode(value);let binary="";for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary)}
async function githubApi(env,path,options={}){
 const result=await fetch("https://api.github.com"+path,{...options,headers:{"accept":"application/vnd.github+json","authorization":`Bearer ${env.GITHUB_PUBLISH_TOKEN}`,"x-github-api-version":"2022-11-28","user-agent":"TransitCore-Publisher",...(options.headers||{})}});
 const body=await result.json().catch(()=>({}));if(!result.ok)throw Error(`GitHub ${result.status}: ${body.message||"request failed"}`);return body;
}
function randomCredential(byteCount=32){
 const bytes=crypto.getRandomValues(new Uint8Array(byteCount));
 let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
}
function deviceRegistry(env){return env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName("__device-registry__"))}
export async function handleDevices(request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:publishCors});
 if(!env.PUBLISH_ADMIN_TOKEN)return publishResponse({error:"device_admin_not_configured"},503);
 if(request.headers.get("authorization")!==`Bearer ${env.PUBLISH_ADMIN_TOKEN}`)return publishResponse({error:"unauthorized"},401);
 if(!env.DEVICE_STATUS)return publishResponse({error:"device_storage_unavailable"},503);
 const registry=deviceRegistry(env);
 if(request.method==="GET")return publishResponse(await registry.fetch("https://status.internal/registry").then(response=>response.json()));
 if(request.method!=="POST")return publishResponse({error:"method_not_allowed"},405);
 try{
  const payload=await request.json(),action=String(payload.action||"");
  const changedAt=new Date().toISOString();
  if(action==="create"){
   const boardProfile=String(payload.boardProfile||"");
   if(!validBoardId(boardProfile))return publishResponse({error:"invalid_board_profile"},400);
   try{await configuration(boardProfile,Date.now())}catch{return publishResponse({error:"board_profile_not_published"},404)}
   const label=String(payload.label||boardProfile).trim().slice(0,80);
   for(let attempt=0;attempt<4;attempt++){
    const deviceId=`${boardProfile}-${randomCredential(6).toLowerCase()}`,token=randomCredential(32);
    const response=await registry.fetch("https://status.internal/registry",{method:"POST",body:JSON.stringify({action,deviceId,boardProfile,label,tokenHash:await tokenHash(token),changedAt})});
    if(response.ok)return publishResponse({ok:true,device:{deviceId,boardProfile,label,enabled:true,createdAt:changedAt},token},201);
    if(response.status!==409)return publishResponse({error:"device_create_failed"},response.status);
   }
   return publishResponse({error:"device_id_collision"},409);
  }
  const deviceId=String(payload.deviceId||"");
  if(!/^[a-z0-9_-]{3,120}$/.test(deviceId))return publishResponse({error:"invalid_device_id"},400);
  if(action==="configure"){
   if(!validBoardId(payload.hardwareProfile)||!validateDeviceSettings(payload.deviceConfig).valid)
    return publishResponse({error:"invalid_device_config"},400);
   const found=await registry.fetch(`https://status.internal/registry/${encodeURIComponent(deviceId)}`);
   if(!found.ok)return publishResponse({error:"not_found"},found.status);
   const entry=await found.json();
   let resolved;
   try{resolved=await configuration(entry.boardProfile,Date.now())}
   catch{return publishResponse({error:"board_configuration_unavailable"},503)}
   if(resolved.hardware.id!==payload.hardwareProfile)return publishResponse({error:"profile_mismatch"},409);
   if(payload.deviceConfig.brightnessLimit>(resolved.hardware.leds?.brightnessLimit??32))
    return publishResponse({error:"brightness_exceeds_hardware_limit"},409);
   const response=await registry.fetch("https://status.internal/registry",{method:"POST",body:JSON.stringify({
    action,deviceId,hardwareProfile:payload.hardwareProfile,deviceConfig:payload.deviceConfig,changedAt})});
   return publishResponse(await response.json(),response.status);
  }
  if(action==="rotate"){
   const token=randomCredential(32),response=await registry.fetch("https://status.internal/registry",{method:"POST",body:JSON.stringify({action,deviceId,tokenHash:await tokenHash(token),changedAt})});
   if(!response.ok)return publishResponse(await response.json(),response.status);
   return publishResponse({ok:true,deviceId,token,rotatedAt:changedAt});
  }
  if(action==="revoke"){
   const response=await registry.fetch("https://status.internal/registry",{method:"POST",body:JSON.stringify({action,deviceId,changedAt})});
   return publishResponse(await response.json(),response.status);
  }
  return publishResponse({error:"invalid_action"},400);
 }catch(error){console.error("device administration failed",error);return publishResponse({error:"device_admin_failed",message:error.message},400)}
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

async function handleSignalTest(request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:publishCors});
 if(request.method!=="POST")return publishResponse({error:"method_not_allowed"},405);
 if(!env.PUBLISH_ADMIN_TOKEN)return publishResponse({error:"signal_test_not_configured"},503);
 if(request.headers.get("authorization")!==`Bearer ${env.PUBLISH_ADMIN_TOKEN}`)return publishResponse({error:"unauthorized"},401);
 try{
  const payload=await request.json(),boardId=String(payload.boardId||payload.board?.id||"");
  let board,profiles,hardware;
  const now=Date.now();
  if(payload.board&&payload.hardware){
   board=payload.board;hardware=payload.hardware;validatePublishProfiles(board,hardware);await attachProfileIdentity(board,hardware);
   profiles=await Promise.all(board.routes.map(id=>fetchJson(`${REPOSITORY}/config/routes/${id}.json`)));
  }else{
   if(!validBoardId(boardId))return publishResponse({error:"not_found"},404);
   ({board,profiles,hardware}=await configuration(boardId,now));
  }
  const requestedPhysical=Number(payload.physicalLed);
  const assignment=Number.isInteger(requestedPhysical)?hardware.assignments.find(item=>item.physicalLed===requestedPhysical):null;
  const node=assignment?board.nodes.find(item=>item.led===assignment.logicalLed):board.nodes.find(n=>n.routes.filter(id=>profiles.some(p=>p.id===id)).length>1)||board.nodes[0];
  if(!node)return publishResponse({error:"test_node_not_found"},400);
  const available=profiles.filter(p=>node.routes.includes(p.id)),first=available[0]||profiles[0],second=available[1]||profiles.find(p=>p!==first)||first;
  const physical=new Map(hardware.assignments.map(item=>[item.logicalLed,item.physicalLed]));
  const line=p=>({code:String(p.line.publicCode),rgb:rgb(p.line.color||color(p))});
  const frames=buildSignalTestSequence({boardProfile:board.id,profileRevision:board.profileRevision??1,profileFingerprint:board.profileFingerprint||"",ledCount:hardware.leds?.count??board.leds.count,ledId:physical.get(node.led)??node.led,firstLine:line(first),secondLine:line(second),brightness:Math.min(SIGNAL_POLICY.fullBrightness,hardware.leds?.brightnessLimit??SIGNAL_POLICY.fullBrightness),now,afterglowMs:SIGNAL_POLICY.departureAfterglowSeconds*1000});
  return publishResponse({schemaVersion:1,boardProfile:board.id,profileRevision:board.profileRevision??1,profileFingerprint:board.profileFingerprint||"",testNode:{name:node.name,logicalLed:node.led,physicalLed:physical.get(node.led)??node.led},stepMilliseconds:[0,1000,2000,3000,4000,5000,6000,16001],frames});
 }catch(error){console.error("signal test failed",error);return publishResponse({error:"signal_test_failed",message:error.message},400)}
}

async function handlePreview(request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:publishCors});
 if(request.method!=="POST")return publishResponse({error:"method_not_allowed"},405);
 if(!env.PUBLISH_ADMIN_TOKEN)return publishResponse({error:"preview_not_configured"},503);
 if(request.headers.get("authorization")!==`Bearer ${env.PUBLISH_ADMIN_TOKEN}`)return publishResponse({error:"unauthorized"},401);
 try{
  const payload=await request.json(),board=payload.board,hardware=payload.hardware;validatePublishProfiles(board,hardware);
  const profiles=await Promise.all(board.routes.map(id=>fetchJson(`${REPOSITORY}/config/routes/${id}.json`)));
  const now=Date.now(),resolvedBoard=board.layout==="linear-route-vled"?board:addNodeCoordinates(board,profiles);await attachProfileIdentity(resolvedBoard,hardware);
  const frame=await liveFrameForConfiguration(resolvedBoard,profiles,hardware,now);
  return publishResponse(await stabilizeMotionFrame(env,resolvedBoard,frame,now));
 }catch(error){console.error("preview failed",error);return publishResponse({error:"preview_failed",message:error.message},400)}
}

async function handleOtaManifest(request,env){
 if(request.method!=="GET")return statusJson({error:"method_not_allowed"},405);
 const deviceId=String(request.headers.get("x-transitcore-device")||""),boardProfile=String(request.headers.get("x-transitcore-board")||""),authorization=request.headers.get("authorization")||"";
 if(!deviceId||!validBoardId(boardProfile)||!authorization.startsWith("Bearer "))return statusJson({error:"unauthorized"},401);
 let registration;
 try{registration=await lookupDeviceRegistration(env,deviceId)}catch{return statusJson({error:"ota_not_configured"},503)}
 if(!registration||registration.boardProfile!==boardProfile)return statusJson({error:"unauthorized"},401);
 const suppliedToken=authorization.slice(7),authenticated=registration.tokenHash
  ?await secureTokenEquals(await tokenHash(suppliedToken),registration.tokenHash)
  :await secureTokenEquals(suppliedToken,registration.token);
 if(!authenticated)return statusJson({error:"unauthorized"},401);
 if(registration.deviceConfig?.otaEnabled===false)return new Response(null,{status:204,headers:{"cache-control":"no-store"}});
 if(!env.OTA_RELEASE_MANIFEST)return new Response(null,{status:204,headers:{"cache-control":"no-store"}});
 try{
  const releases=JSON.parse(env.OTA_RELEASE_MANIFEST),release=selectOtaRelease(releases,deviceId,boardProfile,request.headers);
  if(!release)return new Response(null,{status:204,headers:{"cache-control":"no-store"}});
  return statusJson(release);
 }catch(error){console.error("Invalid OTA_RELEASE_MANIFEST",error);return statusJson({error:"ota_manifest_invalid"},503)}
}

const worker = {
  async scheduled(controller, env) {
    console.log("Scheduled background checks started", new Date(controller.scheduledTime).toISOString());
    await runBackgroundChecks(env);
    console.log("Scheduled background checks completed");
  },
  async fetch(request, env) {
    const v1=await apiV1(request,env,{
      legacy: forwarded=>worker.fetch(forwarded,env),
      configuration: boardId=>configuration(boardId,Date.now()),
      cachedProfiles: ()=>configCache.size,
      fleet: (request)=>fleetResponse(request,env,{registry:()=>deviceRegistry(env),
        authenticate:token=>secureTokenEquals(token,env.PUBLISH_ADMIN_TOKEN),
        policy:()=>healthPolicy(JSON.parse(env.HEALTH_POLICY||"{}"))}),
      registration: async deviceId=>{
        const response=await deviceRegistry(env).fetch(`https://status.internal/registry/${encodeURIComponent(deviceId)}`);
        if(response.status===404)return null;
        if(!response.ok)throw Error("Registry unavailable");
        return response.json();
      },
      authenticate: async (token,entry)=>secureTokenEquals(await tokenHash(token),entry.tokenHash)
    });
    if(v1)return v1;
    const url = new URL(request.url);
    if (url.pathname === "/v1/international/nyc-subway-7" && request.method === "GET") {
      try {
        const result = await mtaLine7Response(env);
        return statusJson(result.body, result.status);
      } catch (error) {
        console.error("MTA line 7 failed", error);
        return statusJson({ error:"mta_feed_unavailable", message:error.message }, 503);
      }
    }
    if (url.pathname === "/v1/admin/publish") return handlePublish(request, env);
    if (url.pathname === "/v1/admin/devices") return handleDevices(request, env);
    if (url.pathname === "/v1/admin/signal-test") return handleSignalTest(request, env);
    if (url.pathname === "/v1/admin/preview") return handlePreview(request, env);
    if (url.pathname === "/v1/firmware/manifest") return handleOtaManifest(request, env);
    const logMatch = url.pathname.match(/^\/v1\/devices\/([a-z0-9-]{3,120})\/logs(\/session)?$/);
    if (logMatch) {
      const cors = {"access-control-allow-origin":"*", "access-control-allow-headers":"Authorization, Content-Type",
        "access-control-allow-methods":"GET, POST, OPTIONS", "cache-control":"no-store"};
      if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
      if (!env.DEVICE_STATUS) return statusJson({error:"status_storage_unavailable"},503);
      const authorization=request.headers.get("authorization")||"";
      if (!authorization.startsWith("Bearer ")) return statusJson({error:"unauthorized"},401);
      const supplied=authorization.slice(7);
      const admin=Boolean(env.PUBLISH_ADMIN_TOKEN) && await secureTokenEquals(supplied,env.PUBLISH_ADMIN_TOKEN);
      const deviceId=logMatch[1];
      const registration=await lookupDeviceRegistration(env,deviceId);
      if (!registration) return statusJson({error:"not_found"},404);
      let device=false;
      if (!logMatch[2] && request.method==="POST" && supplied) device=registration.tokenHash
        ?await secureTokenEquals(await tokenHash(supplied),registration.tokenHash)
        :await secureTokenEquals(supplied,registration.token);
      if (!admin && !device) return statusJson({error:"unauthorized"},401);
      if (request.method==="POST" && (Number(request.headers.get("content-length")||0)>12000))
        return statusJson({error:"body_too_large"},413);
      const body=request.method==="POST"?await request.text():undefined;
      if (body && body.length>12000) return statusJson({error:"body_too_large"},413);
      const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(deviceId));
      const result=await stub.fetch("https://status.internal/logs"+(logMatch[2]||""),{method:request.method,body});
      return new Response(result.body,{status:result.status,headers:{...cors,"content-type":"application/json"}});
    }
    if (url.pathname === "/status" && request.method === "GET") {
      return new Response(efficientStatusPage, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/v1/status" && request.method === "GET") {
      const fallbackDevices = ["trondheim-bus-board", "oslo-metro-board", "grakallbanen-board"]
        .map(deviceId => ({ deviceId, boardProfile: deviceId, label: "" }));
      if (!env.DEVICE_STATUS) {
        return statusJson({
          generatedAt: new Date().toISOString(),
          devices: fallbackDevices.map(device => ({ ...device, latest: null })),
          statusStorage: "disabled_in_preview"
        });
      }
      const registry = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName("__device-registry__"));
      const registered = await registry.fetch("https://status.internal/registry")
        .then(response => response.ok ? response.json() : { devices: [] })
        .catch(() => ({ devices: [] }));
      const targets = registered.devices?.filter(device => device.enabled !== false).map(device => ({
        deviceId: device.deviceId,
        boardProfile: device.boardProfile,
        label: device.label || ""
      })) || [];
      const visibleDevices = targets.length ? targets : fallbackDevices;
      const devices = await Promise.all(visibleDevices.map(async device => {
        const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(device.deviceId));
        const stored = await stub.fetch("https://status.internal/").then(response => response.json());
        return { ...device, latest: stored.latest, errorCount: stored.errors?.length || 0, mostRecentError: stored.errors?.at(-1) || null };
      }));
      return statusJson({ generatedAt: new Date().toISOString(), devices });
    }
    const historyMatch = url.pathname.match(/^\/v1\/boards\/([^/]+)\/history$/);
    if (historyMatch && request.method === "GET") {
      const boardId = historyMatch[1];
      if (!validBoardId(boardId)) return statusJson({ error: "not_found" }, 404);
      if (!env.DEVICE_STATUS) return statusJson({ latest: null, history: [], statusStorage: "disabled_in_preview" });
      const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(boardId));
      return stub.fetch("https://status.internal/monitor");
    }
    const statusMatch = url.pathname.match(/^\/v1\/devices\/([^/]+)\/status$/);
    if (statusMatch) {
      const deviceId = statusMatch[1];
      if (!env.DEVICE_STATUS) return statusJson({ error: "status_storage_unavailable" }, 503);
      if (request.method === "GET" && BOARD_IDS.has(deviceId)) {
        const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(deviceId));
        return stub.fetch("https://status.internal/");
      }
      let registration;
      try {
        registration = await lookupDeviceRegistration(env, deviceId);
      } catch (error) {
        console.error(error);
        return statusJson({ error: "status_not_configured" }, 503);
      }
      if (!registration) return statusJson({ error: "not_found" }, 404);
      const stub = env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(deviceId));
      if (request.method === "GET") return stub.fetch("https://status.internal/");
      if (request.method !== "POST") return statusJson({ error: "method_not_allowed" }, 405);
      const authorization = request.headers.get("authorization") || "";
      const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
      const authenticated = registration.tokenHash
        ? await secureTokenEquals(await tokenHash(suppliedToken), registration.tokenHash)
        : await secureTokenEquals(suppliedToken, registration.token);
      if (!authorization.startsWith("Bearer ") || !authenticated) {
        return statusJson({ error: "unauthorized" }, 401);
      }
      try {
        if(Number(request.headers.get("content-length")||0)>32768)return statusJson({error:"body_too_large"},413);
        const body=await request.text();
        if(body.length>32768)return statusJson({error:"body_too_large"},413);
        const raw=JSON.parse(body),now=Date.now();
        const health=normalizeHealthStatus(raw,registration,now);
        const sample=raw.firmware!=null?cleanStatusPayload(raw,deviceId,registration.boardProfile,now):{
          schemaVersion:1,deviceId,boardProfile:registration.boardProfile,firmware:health.firmwareVersion,
          receivedAt:health.receivedAt,uptimeSeconds:health.uptimeSeconds,frameValid:health.frameValid,
          frameAgeSeconds:health.lastFrameAgeSeconds,freeHeap:health.freeHeap,minimumFreeHeap:health.minimumFreeHeap,
          feedSuccesses:health.successfulPolls,feedFailures:health.failedPolls,
          wifiOutages:health.wifiOutages,wifiRecoveries:health.wifiRecoveries};
        let policy;
        try{
          const configured=JSON.parse(env.HEALTH_POLICY||"{}");
          policy=healthPolicy({...configured,heartbeatSeconds:registration.deviceConfig?.statusIntervalSeconds||configured.heartbeatSeconds||300});
        }catch{return statusJson({error:"health_policy_invalid"},503)}
        sample.health=health;sample._healthPolicy=policy;
        try{
          return await boundedOperation("telemetry_write",()=>stub.fetch("https://status.internal/", {
            method:"POST",body:JSON.stringify(sample)}),1500);
        }catch{return statusJson({error:"status_storage_unavailable"},503)}
      } catch (error) {
        return statusJson({ error: "invalid_status", message: error.message }, 400);
      }
    }
    if (request.method !== "GET") return response({ error: "method_not_allowed" }, 405);
    if (url.pathname === "/" || url.pathname === "/health") return response({ service: "TransitCore LED feed", status: "ok", boardProfiles: [...BOARD_IDS] });
    const match = url.pathname.match(/^\/v1\/boards\/([^/]+)\/frame$/);
    const boardId = match?.[1];
    if (!validBoardId(boardId)) return response({ error: "not_found" }, 404);
    const monitorSource = request.headers.get("x-transitcore-monitor") === "scheduled" ? "scheduled" : "request";
    return boardFrameResponse(boardId, env, monitorSource);
  }
};
export default worker;

