import { color, rgb } from "./mapping-support.mjs";
// Wire envelope is shared by GPS and estimated calls; defaults are unchanged.
function frameEnvelope(board, hardware, now) {
  return {
    schemaVersion: 1,
    boardProfile: board.id,
    profileRevision: board.profileRevision ?? 1,
    profileFingerprint: board.profileFingerprint || "",
    generatedAt: new Date(now).toISOString(),
    sequence: Math.floor(now / 1000),
    ttlSeconds: 30,
    ledCount: hardware.leds?.count ?? board.leds.count
  };
}

export function renderStationFrame({ board, hardware, now, signalPolicy: SIGNAL_POLICY }, { strongest, occupantsByLed }) {
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
    ...frameEnvelope(board, hardware, now),
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

export function renderLinearFrame({ board, hardware, now, signalPolicy: SIGNAL_POLICY, atStopConfirmationSeconds }, { strongest, occupantsByLed, profile }) {
  return {
    ...frameEnvelope(board, hardware, now),
    motionPolicy: {
      stationDepartureRadiusMeters: Math.max(board.render.arrivalRadiusMeters, Number(board.render.stationDepartureRadiusMeters) || board.render.arrivalRadiusMeters),
      atStopConfirmationSeconds: Math.max(0, Number(board.render.atStopConfirmationSeconds ??
        atStopConfirmationSeconds) || 0)
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

export function renderArrivalFrame({ board, hardware, now, signalPolicy: SIGNAL_POLICY, estimatedCalls: arrivals }) {
  return {
    ...frameEnvelope(board, hardware, now),
    leds: arrivals.sort((a, b) => a.id - b.id).map(item => ({
      id: item.id,
      rgb: rgb(board.render.lineColors?.[item.profile.line.publicCode] || item.profile.line.color || color(item.profile, item.destination)),
      brightness: Math.min(SIGNAL_POLICY.fullBrightness, hardware.leds?.brightnessLimit ?? SIGNAL_POLICY.fullBrightness),
      state: item.state,
      vehicle: { id: item.vehicleId }
    }))
  };
}
