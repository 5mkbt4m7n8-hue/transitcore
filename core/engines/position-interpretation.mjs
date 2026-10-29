import { distance, matchesDirection, vehicleAllowedByBoard, nearestRoutePosition } from "../frame/mapping-support.mjs";

// Route profiles are configuration, never provider observations.
export function interpretStationVehicles({ board, profiles, hardware, vehicles, now = Date.now() }) {
  const byLine = new Map(profiles.map(profile => [String(profile.line.publicCode), profile]));
  const catalogProximity = board.id === "trondheim-city-lines-catalog";
  // Empty headsigns are not direction evidence (legacy physical boards retain
  // their existing matching semantics).
  const catalogMatches = (node, vehicle) => {
    const text = vehicle.destination.trim().toLowerCase();
    if (!text) return false;
    const configured = node.routeDirections?.[vehicle.profile.id]?.destinationMatches ||
      vehicle.profile.directions?.flatMap(direction => direction.destinationMatches || []) || [];
    const explicit = configured.some(value => value.trim() && text.includes(value.toLowerCase())) ||
      Object.keys(vehicle.profile.destinationDirectionAliases || {}).some(value => value.toLowerCase() === text);
    return explicit && matchesDirection(node, vehicle.profile, vehicle.destination);
  };
  const dedupe = new Map();
  for (const vehicle of vehicles) {
    const profile = byLine.get(String(vehicle.publicCode || ""));
    const updated = Date.parse(vehicle.timestamp || "");
    if (!profile || (!catalogProximity && !vehicleAllowedByBoard(board, profile, vehicle.destination)) || vehicle.latitude == null || !Number.isFinite(updated) || (now - updated) / 1000 > board.render.freshnessSeconds) continue;
    const previous = dedupe.get(vehicle.id);
    if (!previous || updated > previous.updated) dedupe.set(vehicle.id, { vehicleId: String(vehicle.id || ""), profile, updated, destination: vehicle.destination || "", lat: Number(vehicle.latitude), lon: Number(vehicle.longitude) });
  }
  const strongest = new Map(), occupantsByLed = new Map();
  for (const vehicle of dedupe.values()) {
    let node, meters = Infinity, proximity;
    if (catalogProximity) {
      // This is a physical proximity display, NOT a timetable/route validator.
      // A bus can be on an unexpected route or have a different headsign.
      // Select the closest documented Quay independently of its route list.
      // Bounding-box first: avoid 1282 haversine calculations per bus.
      const radius = Math.max(Number(board.render.approachRadiusMeters) || 250, 1);
      const latLimit = radius / 110000;
      const lonLimit = radius / (111000 * Math.max(0.2, Math.cos(vehicle.lat * Math.PI / 180)));
      for (const candidate of board.nodes) {
        if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lon) ||
            Math.abs(candidate.lat - vehicle.lat) > latLimit ||
            Math.abs(candidate.lon - vehicle.lon) > lonLimit) continue;
        const value = distance(vehicle, candidate);
        if (value < meters || value === meters && candidate.led < node.led) { node = candidate; meters = value; }
      }
      // Preserve the measured nearest Quay separately from the inferred platform.
      // Only explicit, unambiguous destination evidence at this same StopPlace
      // may resolve the platform. A route cannot move GPS to another StopPlace,
      // or outside the measured approach radius.
      const nearestNode = node, nearestMeters = meters;
      if (node?.stationId) {
        const matched = board.nodes.filter(candidate =>
          candidate.stationId === node.stationId &&
          candidate.routes?.includes(vehicle.profile.id) &&
          catalogMatches(candidate, vehicle));
        const directionIds = new Set(matched.flatMap(candidate =>
          candidate.routeDirections?.[vehicle.profile.id]?.directionIds || []));
        if (directionIds.size === 1) {
          let selected, selectedMeters = Infinity;
          for (const candidate of matched) {
            const value = distance(vehicle, candidate);
            if (value <= radius && (value < selectedMeters ||
                value === selectedMeters && candidate.led < selected.led)) {
              selected = candidate; selectedMeters = value;
            }
          }
          if (selected) { node = selected; meters = selectedMeters; }
        }
      }
      if (node) proximity = {
        nearestQuayLed: nearestNode.led, nearestQuayDistanceMeters: nearestMeters,
        platformEvidence: node.routes?.includes(vehicle.profile.id) &&
          catalogMatches(node, vehicle) ? "route-destination" :
          node.routes?.includes(vehicle.profile.id) && vehicle.profile.directions?.some(direction =>
            direction.destinationMatches?.some(value => value && vehicle.destination.toLowerCase().includes(value.toLowerCase()))) &&
          node.routeDirections?.[vehicle.profile.id] ? "direction-conflict" : "gps-only",
        // GPS and a headsign do not confirm a stop, even at a matching platform.
        platformConfirmed: false
      };
    } else {
      // Preserve strict route/side matching for existing physical boards.
      const routeNodes = board.nodes.filter(node => node.routes.includes(vehicle.profile.id));
      const directionNodes = routeNodes.filter(node => matchesDirection(node, vehicle.profile, vehicle.destination));
      const hasDirectionMetadata = routeNodes.some(node => node.routeDirections?.[vehicle.profile.id]);
      if (hasDirectionMetadata && !directionNodes.length) continue;
      const candidates = directionNodes.length ? directionNodes : routeNodes;
      for (const candidate of candidates) {
        const value = distance(vehicle, candidate);
        if (value < meters) { node = candidate; meters = value; }
      }
    }
    const approachRadius = board.render.approachRadiusMeters ?? 250;
    const arrivalRadius = board.render.arrivalRadiusMeters ?? 85;
    if (!node || meters > approachRadius) continue;
    const state = !catalogProximity && meters <= arrivalRadius ? "AT_STOP" : "APPROACHING";
    const id = node.led;
    const candidate = { id, profile: vehicle.profile, vehicleId: vehicle.vehicleId, updated: vehicle.updated, destination: vehicle.destination, state, meters, lat: vehicle.lat, lon: vehicle.lon,
      ...(catalogProximity ? {positionType:"gps-nearest-stop", routeListedHere:node.routes?.includes(vehicle.profile.id) === true,
        ...proximity, withinStopRadius: meters <= arrivalRadius} : {}) };
    const occupants = occupantsByLed.get(id) || [];
    occupants.push(candidate);
    occupantsByLed.set(id, occupants);
    const previous = strongest.get(id);
    if (!previous || state === "AT_STOP" && previous.state !== "AT_STOP" || state === previous.state && meters < previous.meters) strongest.set(id, candidate);
  }
  return { strongest, occupantsByLed };
}
export function interpretLinearVehicles({ board, profiles, hardware, vehicles, now = Date.now() }) {
  const profile = profiles[0];
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
  for (const observation of vehicles) {
    const updated = Date.parse(observation.timestamp || "");
    if (String(observation.publicCode || "") !== String(profile.line.publicCode) || !vehicleAllowedByBoard(board, profile, observation.destination) || observation.latitude == null ||
        !Number.isFinite(updated) || (now - updated) / 1000 > board.render.freshnessSeconds) continue;
    const previous = dedupe.get(observation.id);
    if (!previous || updated > previous.updated) dedupe.set(observation.id, {
      vehicleId: String(observation.id), updated, destination: observation.destination || "", lat: Number(observation.latitude), lon: Number(observation.longitude)
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
    const nearestStationLed = nearestStationNode ? nearestStationNode.led : null;
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
    const id = logicalLed;
    const candidate = { id, state, meters, destination: vehicle.destination, vehicleId: vehicle.vehicleId, positionType, stationDistanceMeters: stopMeters, nearestStationLed, isTerminalStation, lat: vehicle.lat, lon: vehicle.lon };
    const occupants = occupantsByLed.get(id) || [];
    occupants.push(candidate);
    occupantsByLed.set(id, occupants);
    const previous = strongest.get(id);
    if (!previous || state === "AT_STOP" && previous.state !== "AT_STOP" || state === previous.state && meters < previous.meters) {
      strongest.set(id, candidate);
    }
  }
  return { strongest, occupantsByLed, profile };
}
