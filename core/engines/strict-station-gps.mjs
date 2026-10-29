import {distance} from '../frame/mapping-support.mjs';
import {catalogIndex} from './catalog-index.mjs';
import competitors from '../../config/gps/trondheim-quay-competitors.json' with {type:'json'};

// Ordinary Trondheim bus boards, including the immutable 147-point mapping.
// Other modes (tram, FB73 estimates, recordings) keep their own interpreters.
export const usesStrictStationGps = board => board.id === 'trondheim-city-lines-catalog' ||
  board.id === 'trondheim-bus-board' || board.id === 'trondheim-shared-stops-board';
const terminal = text => String(text || '').normalize('NFC').trim().toLowerCase().split(/\s+via\s+/)[0];
const exact = (values, text) => values?.some(value => terminal(value) === text && text !== '');
// Entur StopPlace/Quay audit 2026-10-29: these four catalog coordinates
// changed. Use current positions as competitors, quarantine LED assignment
// until the catalog is deliberately refreshed. Never change map geometry here.
const auditedCoordinates = new Map([
  ['NSR:Quay:102735',[63.44047,10.1979]], ['NSR:Quay:103687',[63.44005,10.19803]],
  ['NSR:Quay:73377',[63.420029,10.754617]], ['NSR:Quay:73378',[63.419972,10.756136]]
]);
const safetyCatalogs = new WeakMap();
const quayMaps = new WeakMap();
export function safetyCatalog(nodes) {
  if (!safetyCatalogs.has(nodes)) {
    const stations = new Set(nodes.map(n=>n.stationId)), quays = new Set(nodes.map(n=>n.quayId));
    const extra = competitors.quays.filter(([id,station])=>stations.has(station)&&!quays.has(id))
      .map(([quayId,stationId,lat,lon],i)=>({quayId,stationId,lat,lon,stopIds:[quayId],routes:[],
        // Internal tie-break sentinel only. No route => never an active LED.
        led:-1-i,competitorOnly:true}));
    safetyCatalogs.set(nodes,[...nodes.map(node=>{
      const coords=auditedCoordinates.get(node.quayId);
      return coords && (Math.abs(coords[0]-node.lat)>0.00001 || Math.abs(coords[1]-node.lon)>0.00001)
        ? {...node,lat:coords[0],lon:coords[1],quarantined:true} : node;
    }),...extra]);
  }
  return safetyCatalogs.get(nodes);
}

export function strictDirection(node, profile, destination) {
  const text = terminal(destination), rule = node.routeDirections?.[profile.id];
  if (!text || !node.routes?.includes(profile.id) || !rule || rule.directionIds?.length !== 1) return false;
  const alias = Object.entries(profile.destinationDirectionAliases || {}).find(([name]) => terminal(name) === text);
  // Aliases are explicit GTFS direction IDs, never shape orientation guesses.
  if (alias) return String(alias[1]) === String(rule.directionIds[0]);
  return exact(rule.destinationMatches, text) || exact(rule.headsigns, text);
}

export function interpretStrictStationGps({board, profiles, vehicles, now}) {
  const catalog = board.id === 'trondheim-city-lines-catalog' ? board.nodes : board.gpsMatchingNodes;
  const index = catalogIndex(safetyCatalog(catalog || board.nodes)), byLine = new Map();
  if (!quayMaps.has(board.nodes)) quayMaps.set(board.nodes,new Map(board.nodes.map(node => [node.quayId,node])));
  const boardQuays = quayMaps.get(board.nodes);
  for (const profile of profiles) {
    const code = String(profile.line.publicCode);
    byLine.set(code, byLine.has(code) ? null : profile);
  }
  const strongest = new Map(), occupantsByLed = new Map(), observations = [], latest = new Map();
  // Deduplicate before validation: a newer bad sample must extinguish an older
  // good placement. Equal-time conflicting samples have no safe winner.
  for (const v of vehicles) {
    const key = v.id || Symbol(), previous = latest.get(key);
    const time = Date.parse(v.timestamp), oldTime = Date.parse(previous?.timestamp);
    if (!previous || !Number.isFinite(time) || Number.isFinite(oldTime) && time > oldTime) latest.set(key, v);
    else if (time === oldTime && ['publicCode','destination','latitude','longitude'].some(k => v[k] !== previous[k]))
      latest.set(key, {...v, conflictingSample:true});
  }
  for (const v of latest.values()) {
    const profile = byLine.get(String(v.publicCode || '')), updated = Date.parse(v.timestamp || '');
    const validGps = typeof v.latitude === 'number' && typeof v.longitude === 'number' &&
      Number.isFinite(v.latitude) && Number.isFinite(v.longitude) && Math.abs(v.latitude) <= 90 && Math.abs(v.longitude) <= 180;
    const raw = {id:v.id || null, line:v.publicCode || null, destination:v.destination || '',
      timestamp:v.timestamp || null, latitude:validGps?v.latitude:null, longitude:validGps?v.longitude:null,
      status:'unresolved', reason:'invalid-gps', platformConfirmed:false};
    observations.push(raw);
    if (!validGps) continue;
    const vehicle = {lat:v.latitude, lon:v.longitude};
    // Fixed safety policy: 60m maximum, at least 25m assumed uncertainty,
    // and >2*uncertainty+10m separation from every competing catalog Quay.
    // Entur currently provides no accuracy/trip/platform evidence in this feed.
    const uncertainty = Math.max(25, v.accuracyMeters ?? 25), radius = Math.min(60, board.render.arrivalRadiusMeters ?? 60);
    const search = radius + 2 * 25 + 10;
    const nearby = index.candidates(vehicle.lat, vehicle.lon, search / 110000,
      search / (111000 * Math.max(.2, Math.cos(vehicle.lat * Math.PI / 180))));
    let nearest, meters = Infinity, runnerUp = Infinity;
    for (const candidate of nearby) {
      const value = distance(vehicle, candidate);
      if (value < meters || value === meters && candidate.led < nearest?.led) {
        runnerUp = meters; meters = value; nearest = candidate;
      } else if (value < runnerUp) runnerUp = value;
    }
    if (nearest && meters <= search) {
      raw.nearestQuayId = nearest.quayId; raw.nearestStopPlaceId = nearest.stationId;
      raw.nearestQuayDistanceMeters = Math.round(meters);
    }
    const reject = reason => {raw.reason = reason;};
    if (!v.id || v.conflictingSample) {reject('conflicting-or-missing-identity');continue;}
    if (!Number.isFinite(updated) || !/(Z|[+-]\d\d:\d\d)$/.test(v.timestamp || '') || updated > now || now-updated > Math.min(30,board.render.freshnessSeconds ?? 30)*1000) {reject('stale-or-invalid-time');continue;}
    if (!profile) {reject('unknown-or-ambiguous-line');continue;}
    if (!catalog) {reject('missing-competition-catalog');continue;}
    if (v.accuracyMeters != null && (typeof v.accuracyMeters !== 'number' || v.accuracyMeters < 0) ||
        !Number.isFinite(uncertainty) || uncertainty > 25) {reject('gps-uncertainty');continue;}
    if (!nearest || meters > radius) {reject('outside-safe-radius');continue;}
    if (nearest.quarantined) {reject('outdated-catalog-quay');continue;}
    if (!nearest.quayId || !nearest.stationId || !nearest.stopIds?.includes(nearest.quayId)) {reject('missing-quay-identity');continue;}
    if (!strictDirection(nearest, profile, v.destination)) {reject('route-or-direction-unresolved');continue;}
    if (runnerUp - meters <= 2*uncertainty + 10) {reject('competing-quay');continue;}
    const boardNode = boardQuays.get(nearest.quayId);
    if (!boardNode || !strictDirection(boardNode,profile,v.destination)) {reject('quay-not-on-board');continue;}
    // Never search for a farther matching route or an opposite platform.
    raw.status = 'matched'; raw.reason = 'route-destination-separated-quay';
    raw.quayId = nearest.quayId; raw.stopPlaceId = nearest.stationId;
    const item = {id:boardNode.led, profile, vehicleId:v.id, updated, destination:v.destination,
      state:'APPROACHING', meters, lat:vehicle.lat, lon:vehicle.lon,
      positionType:'gps-route-quay', routeListedHere:true, platformEvidence:'route-destination',
      platformConfirmed:false, nearestQuayLed:nearest.led, nearestQuayDistanceMeters:meters,
      withinStopRadius:true, quayId:nearest.quayId, stopPlaceId:nearest.stationId};
    const occupants = occupantsByLed.get(item.id) || [];
    occupants.push(item); occupantsByLed.set(item.id,occupants);
    if (!strongest.has(item.id) || meters < strongest.get(item.id).meters) strongest.set(item.id,item);
  }
  return {strongest, occupantsByLed, observations};
}
