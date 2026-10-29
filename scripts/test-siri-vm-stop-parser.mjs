import assert from 'node:assert/strict';
import {parseAtbReportedStops} from '../core/providers/entur/siri-vm-stop-parser.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';
import {readFileSync} from 'node:fs';
const ts='2026-10-29T12:00:00Z';
const entry=(call,ref='ATB:Vehicle:test-1',line='ATB:Line:2_11')=>`
<siri:VehicleActivity>
  <siri:RecordedAtTime>${ts}</siri:RecordedAtTime>
  <siri:MonitoredVehicleJourney>
    <siri:LineRef>${line}</siri:LineRef>
    <siri:VehicleRef>${ref}</siri:VehicleRef>
    ${call}
  </siri:MonitoredVehicleJourney>
</siri:VehicleActivity>`;
const stop=atStop=>`<siri:MonitoredCall>
 <siri:StopPointRef>NSR:Quay:75464</siri:StopPointRef>
 <siri:VehicleAtStop>${atStop}</siri:VehicleAtStop></siri:MonitoredCall>`;
const wrap=b=>`<?xml version="1.0" encoding="UTF-8"?>
<siri:Siri xmlns:siri="http://www.siri.org.uk/siri">
<siri:ServiceDelivery><siri:VehicleMonitoringDelivery>${b}
</siri:VehicleMonitoringDelivery></siri:ServiceDelivery></siri:Siri>`;
const raw=wrap([entry(stop('true')),entry(stop('false'),'second'),entry('<siri:OnwardCalls>'+stop('true')+'</siri:OnwardCalls>','third')].join(''));
const reports=parseAtbReportedStops(raw);
assert.equal(reports.length,1);
assert.equal(reports[0].vehicleRef,'ATB:Vehicle:test-1');
assert.equal(reports[0].lineRef,'ATB:Line:2_11');
assert.equal(reports[0].quayId,'NSR:Quay:75464');
assert.equal(reports[0].recordedAt,ts);
assert.equal(parseAtbReportedStops(wrap(entry(stop('true')+stop('true'))).length,0);
assert.equal(parseAtbReportedStops(wrap(entry(stop('true'),'x','RUT:Line:42'))).length,0);
assert.equal(parseAtbReportedStops(wrap(entry(stop('false')))).length,0);
assert.equal(parseAtbReportedStops(wrap(entry(stop('true').replace('NSR:Quay:75464','NSR:StopPlace:43948')))).length,0);
assert.throws(()=>parseAtbReportedStops('<bad>'),/invalid/);
const profile=JSON.parse(readFileSync(new URL('../config/routes/atb-bus-11-live.json',import.meta.url)));
const node={quayId:'NSR:Quay:75464',stationId:'NSR:StopPlace:43948',stopIds:['NSR:Quay:75464'],
 lat:63.4,lon:10.4,routes:[profile.id],routeDirections:{[profile.id]:{directionIds:['0'],destinationMatches:['Stavset']}}};
const vehicle={id:'ATB:Vehicle:test-1',publicCode:'11',destination:'Stavset',
 latitude:63.4,longitude:10.4,timestamp:ts};
const evaluation=evaluateEnturStopEvidence({report:reports[0],vehicle,profile,node,now:Date.parse(ts)+1000});
assert.equal(evaluation.accepted,true);
console.log('SIRI-VM XML explicit at-stop parsing, strict identity/Quay validation, no next-stop inference PASS');
