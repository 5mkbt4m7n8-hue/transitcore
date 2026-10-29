import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretStationVehicles} from '../core/engines/position-interpretation.mjs';
import {renderStationFrame} from '../core/frame/frame-renderer.mjs';
import {matchesDirection, color, distance} from '../core/frame/mapping-support.mjs';

const read = path => JSON.parse(readFileSync(new URL('../'+path, import.meta.url)));
const board = read('config/boards/trondheim-city-lines-catalog.json');
const profile = read('config/routes/atb-bus-11-live.json');
const now = Date.parse('2026-10-29T09:00:00Z');
const node = led => board.nodes.find(value => value.led === led);
const vehicle = (at, destination = 'Blakli') => ({id:'bus-8861', publicCode:'11',
  destination, latitude:at.lat, longitude:at.lon, timestamp:new Date(now-2000).toISOString()});
const interpret = (at, destination, override = board) => interpretStationVehicles({
  board:override, profiles:[profile], vehicles:[vehicle(at, destination)], now});
const pick = (...args) => [...interpret(...args).strongest.values()][0];

assert.equal(board.nodes.length,1282);
assert.equal(node(769).name,'Norrkøpingveien');
assert.equal(node(770).name,'Nyborg','770 is not an opposite Norrkøpingveien platform');
assert.notEqual(node(769).stationId,node(770).stationId);
assert(distance(node(134),node(135))>100,'Real Bukkvollan geometry exceeds the old 25m tie-break');
for (const [gpsLed,destination,expected] of [[135,'Blakli',134],[134,'Stavset',135],
  [135,'Risvollan',134],[134,'Blakli',134],[770,'Stavset',771]]) {
  const item = pick(node(gpsLed),destination);
  assert.equal(item.id,expected,`${gpsLed} ${destination}`);
  assert.equal(item.platformEvidence,'route-destination');
  assert.equal(item.nearestQuayLed,gpsLed);
  assert.equal(item.meters,distance(node(gpsLed),node(expected)),'Distance is to selected platform, never invented');
  assert.equal(item.lat,node(gpsLed).lat);
  assert.equal(item.lon,node(gpsLed).lon);
  assert.equal(item.state,'APPROACHING','GPS alone cannot confirm a stop');
  assert.equal(item.platformConfirmed,false);
}
const norr = pick({...node(769),lat:node(769).lat+15/111195},'Blakli');
assert.equal(norr.id,769,'Never jump to Nyborg or manufacture a missing Norr platform');
assert.equal(norr.platformEvidence,'direction-conflict');
assert.equal(norr.withinStopRadius,true);
assert.equal(norr.state,'APPROACHING');
assert.equal(pick(node(769),'Stavset').platformEvidence,'route-destination');
assert.equal(pick(node(770),'Blakli').id,770);
for (const destination of ['', 'Unknown', 'Stav']) {
  const item = pick(node(135),destination);
  assert.equal(item.id,135,'Unknown destination retains measured nearest Quay');
  assert.equal(item.platformEvidence,'gps-only');
}
// Matched Quay outside GPS range cannot attract a vehicle or fabricate AT_STOP.
const limited = {...board,render:{...board.render,approachRadiusMeters:100}};
assert.equal(pick(node(135),'Blakli',limited).id,135);
assert.equal(pick(node(135),'Blakli',limited).platformEvidence,'direction-conflict');
// Multiple matching platforms choose nearest, independent of node ordering.
const extra = {...node(134),led:9000,lat:node(135).lat+0.0001,lon:node(135).lon};
for (const nodes of [[node(135),node(134),extra],[extra,node(134),node(135)]])
  assert.equal(pick(node(135),'Blakli',{...board,nodes}).id,9000);
// Ambiguous two-direction metadata must not override GPS.
const ambiguous = {...node(134),routeDirections:{[profile.id]:{
  directionIds:['0','1'],destinationMatches:['Blakli']}}};
assert.equal(pick(node(135),'Blakli',{...board,nodes:[node(135),ambiguous]}).id,135);
// Exercise every documented catalog position with an unknown/off-route headsign.
for (const at of board.nodes) {
  const item = pick(at,'Unregistered detour');
  assert(item,`GPS must remain visible at LED ${at.led}`);
  assert.equal(item.meters,0);
  assert.equal(item.state,'APPROACHING');
  assert.equal(item.platformConfirmed,false);
  assert(board.nodes.some(candidate=>candidate.led===item.id));
}
// Every line-11 quay with explicit one-direction evidence selects that direction.
for (const at of board.nodes.filter(value=>value.routes.includes(profile.id))) {
  for (const destination of ['Stavset','Blakli']) {
    const sameStation = board.nodes.filter(value=>value.stationId===at.stationId &&
      matchesDirection(value,profile,destination) && distance(at,value)<=board.render.approachRadiusMeters);
    if (sameStation.length && sameStation.every(value=>value.routeDirections[profile.id].directionIds.length===1))
      assert(matchesDirection(node(pick(at,destination).id),profile,destination),`${at.led} ${destination}`);
  }
}
const frame = renderStationFrame({board,hardware:{leds:board.leds},now,
  signalPolicy:{fullBrightness:32}},interpret(node(135),'Blakli'));
const signal = frame.leds[0];
assert.equal(signal.id,134);
assert(signal.vehicle.distanceMeters>85);
for (const value of [signal.vehicle,signal.occupants[0]]) {
  assert.equal(value.platformEvidence,'route-destination');
  assert.equal(value.platformConfirmed,false);
  assert.equal(value.nearestQuayLed,135);
  assert.equal(value.nearestQuayDistanceMeters,0);
  assert.equal(value.withinStopRadius,false);
}
assert.equal(color(profile,'Blakli'),'#66bb6a');
assert.equal(color(profile,'Risvollan'),'#66bb6a');
assert.equal(color(profile,'Stavset'),'#ef5350');
assert.deepEqual(signal.rgb,[102,187,106]);
console.log('Catalog platform direction OK: LED 769/770/771, 134/135, all 1282 GPS positions, measured distances and colors');
