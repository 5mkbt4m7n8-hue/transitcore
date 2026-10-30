import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patternInventory} from '../core/engines/entur-trip-pattern-link.mjs';
import {evaluateTonstadShadowFrame,TONSTAD_QUAY} from './shared-quay-frame-shadow.mjs';

const read=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url)));
const board=read('config/boards/trondheim-city-lines-catalog.json');
const profile=read('config/routes/atb-bus-1-live.json');
const known=board.nodes.filter(n=>n.quayId===TONSTAD_QUAY);
assert.equal(known.length,1,'Exactly one source Quay, exactly one physical LED');
const led=known[0].led;
const now=Date.parse('2026-10-30T14:13:37Z');
const patterns=patternInventory().get('1').patterns;
const north=patterns.find(p=>p.directionType==='inbound'&&p.quays.length===32&&
 p.quays.includes(TONSTAD_QUAY));
const south=patterns.find(p=>p.directionType==='outbound'&&p.quays.length===32&&
 p.quays.includes(TONSTAD_QUAY));
const shortN=patterns.find(p=>p.directionType==='inbound'&&p.quays.length===19&&
 p.quays.includes(TONSTAD_QUAY));
const shortS=patterns.find(p=>p.directionType==='outbound'&&p.quays.length===19&&
 p.quays.includes(TONSTAD_QUAY));
assert(north&&south&&shortN&&shortS);
function make(id,destination,pattern){
 const recordedAt=new Date(now-1000).toISOString();
 const vehicle={id,publicCode:'1',destination,
  latitude:known[0].lat,longitude:known[0].lon,
  timestamp:new Date(now-2000).toISOString()};
 const report={source:'entur-siri-vm',vehicleRef:id,lineRef:profile.line.id,
  quayId:TONSTAD_QUAY,recordedAt,vehicleAtStop:true};
 const sourceId='ATB:ServiceJourney:'+id.split(':').at(-1);
 const proof={siri:{source:'entur-siri-vm',lineRef:profile.line.id,
  vehicleRef:id,recordedAt,datedVehicleJourneyRef:sourceId},
  serviceJourney:{id:sourceId,line:{id:profile.line.id},
   journeyPattern:{id:pattern.id,directionType:pattern.directionType}}};
 return {vehicle,report,proof};
}
const towardRanheim=make('ATB:Vehicle:ranheim','Ranheim',north);
const towardOstre=make('ATB:Vehicle:ostre','Østre Lund',south);
const shortRanheim=make('ATB:Vehicle:strindheim','Strindheim',shortN);
const shortOstre=make('ATB:Vehicle:tillerterminalen','Tillerterminalen',shortS);
function run(fleet,overrides={}){
 return evaluateTonstadShadowFrame({
  board,profile,vehicles:fleet.map(e=>e.vehicle),
  reports:fleet.map(e=>e.report),
  verifiedJourneys:new Map(fleet.map(e=>[e.vehicle.id,e.proof])),
  now,...overrides
 });
}
const empty=run([]);
assert.equal(empty.simulatedLedOn,false);
assert.equal(empty.provenAtStopOccupants,0);
assert.equal(empty.targetLedId,led);
assert.equal(empty.mode,'offline-shadow-no-deploy');
for(const sample of [towardRanheim,towardOstre,shortRanheim,shortOstre]){
 const one=run([sample]);
 assert.equal(one.simulatedLedOn,true,'Shared Quay supports actual source journey in either direction');
 assert.equal(one.provenAtStopOccupants,1);
 assert.equal(one.targetLedId,led);
 assert.equal(one.simulatedState,'AT_STOP');
 assert.equal(one.eligibleForProduction,false);
 assert.equal(one.physicalStopIndependentlyVerified,false);
}
const two=run([towardRanheim,towardOstre]);
assert.equal(two.provenAtStopOccupants,2,'Two buses do not create a duplicate physical LED');
assert.equal(two.targetLedId,led);
const noProof=run([towardRanheim],{verifiedJourneys:new Map()});
assert.equal(noProof.simulatedLedOn,false);
const missingAtStop=run([towardRanheim],{
 reports:[{...towardRanheim.report,vehicleAtStop:false}]
});
assert.equal(missingAtStop.simulatedLedOn,false,'Onward-call / false at-stop cannot illuminate');
const stale=run([towardRanheim],{now:now+70000});
assert.equal(stale.simulatedLedOn,false);
const wrongDest=run([{...towardRanheim,
 vehicle:{...towardRanheim.vehicle,destination:'Østre Lund'}}]);
assert.equal(wrongDest.simulatedLedOn,false);
const gpsFar=run([{...towardRanheim,
 vehicle:{...towardRanheim.vehicle,latitude:known[0].lat+0.005}}]);
assert.equal(gpsFar.simulatedLedOn,false);
const wrongSiri=run([{...towardRanheim,
 proof:{...towardRanheim.proof,siri:{...towardRanheim.proof.siri,
  datedVehicleJourneyRef:'ATB:ServiceJourney:incorrect'}}}]);
assert.equal(wrongSiri.simulatedLedOn,false);
const opposite=run([{...towardRanheim,report:{
 ...towardRanheim.report,quayId:'NSR:Quay:102721'}}]);
assert.equal(opposite.simulatedLedOn,false,'Østre Lund cannot use shared Tonstadkrysset exception');
const duplicateBoard={...board,nodes:[...board.nodes,
 {...known[0],led:known[0].led+1}]};
assert.throws(()=>run([towardRanheim],{board:duplicateBoard}),/invalid-shadow-input/);
const output=JSON.stringify(two);
for(const secret of ['ATB:Vehicle:', 'ATB:ServiceJourney:', 'latitude','longitude','timestamp','gpsObservations','occupants','destination'])
 assert(!output.includes(secret),'No raw source/GPS/vehicle fields in shadow logs: '+secret);
console.log('Full 1282-node board staging-shadow: north/south, short turns, 2 vehicles one LED, fail closed and private PASS');
