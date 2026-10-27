import assert from 'node:assert/strict';
import {ROUTES,loadCatalog,haversine,shortId,isAuditDay,summarizeGps,summarizeFrame,auditStats} from './trondheim-day-audit-core.mjs';
assert.equal(ROUTES.length,47);
assert.equal(new Set(ROUTES).size,47);
assert(isAuditDay(new Date('2026-10-27T04:50:00Z')));
assert(isAuditDay(new Date('2026-10-27T22:50:00Z')));
assert(!isAuditDay(new Date('2026-10-27T23:00:00Z')));
assert(!isAuditDay(new Date('2026-10-26T21:30:00Z')));
assert(Math.abs(haversine(63.413006,10.409538,63.413006,10.409538))<0.0001);
assert.equal(shortId('11','one'),shortId('11','one'));
assert.notEqual(shortId('11','one'),shortId('11','two'));
assert.notEqual(shortId('11','one'),shortId('12','one'));
const catalog=await loadCatalog();
assert.equal(catalog.ledCount,1282);
assert(catalog.byLine['11'].find(s=>s.id==='NSR:Quay:73415'));
assert(catalog.byLine['11'].find(s=>s.id==='NSR:Quay:73414'));
assert.equal(catalog.sharedByLine['11']['NSR:Quay:73421'],76);
assert.equal(catalog.sharedByLine['11']['NSR:Quay:73415'],undefined,
 'Missing Lerkendal gård must remain UNKNOWN in 147 LED profile');
const at=new Date('2026-10-27T12:00:00.000Z');
const source={schemaVersion:1,scope:'catalogued-bus-lines',
 source:'Entur Vehicle Positions v2',observationType:'measured-vehicle-position',
 includedLines:[...ROUTES],quality:{stale:0},vehicles:[
  {id:'vehicle-sensitive-123',line:'11',latitude:63.413006,longitude:10.409538,
   lastUpdated:'2026-10-27T12:00:00.000Z',source:'GPS',provider:'Entur/ATB'},
  {id:'stale-should-not-appear',line:'11',latitude:63.413006,longitude:10.409538,
   lastUpdated:'2026-10-27T11:57:00.000Z',source:'GPS',provider:'Entur/ATB'},
  {id:'no-position',line:'11',latitude:null,longitude:null,
   lastUpdated:'2026-10-27T12:00:00.000Z',source:'GPS',provider:'Entur/ATB'}
 ]};
const result=summarizeGps(source,catalog,at);
assert.equal(result.fresh,1,'No stale or null positions');
assert.equal(result.vehicles[0].nearby.stopId,'NSR:Quay:73415');
assert.equal(result.vehicles[0].nearby.led,617);
assert.equal(result.vehicles[0].nearby.distanceMeters,0);
assert(!JSON.stringify(result).includes('vehicle-sensitive-123'));
assert(!JSON.stringify(result).includes('63.413006'));
assert.equal(result.vehicles[0].vehicle.length,16);
assert.throws(()=>summarizeGps({...source,includedLines:['11']},catalog,at),/not_all_47_lines/);
assert.throws(()=>summarizeGps({...source,observationType:'estimated-station-calls'},catalog,at),/invalid_gps_contract/);
const frame=summarizeFrame({schemaVersion:1,boardProfile:'trondheim-shared-stops-board',
 ledCount:147,generatedAt:at.toISOString(),sequence:5,ttlSeconds:30,
 leds:[{id:77,state:'AT_STOP',vehicle:{id:'raw-id'}},{id:78,state:'OFF'}]},
 'trondheim-shared-stops-board');
assert.equal(frame.active,1);
assert.equal(frame.leds[0].led,77);
assert(!JSON.stringify(frame).includes('raw-id'));
assert.throws(()=>summarizeFrame({schemaVersion:1,boardProfile:'wrong',leds:[]},
 'trondheim-shared-stops-board'),/invalid_frame_contract/);
const snapshots=[{takenAt:at.toISOString(),gps:{status:'ok',...result},
 frames:{'trondheim-shared-stops-board':frame}},
 {takenAt:at.toISOString(),gps:{status:'ok',...result},frames:{}},
 {takenAt:at.toISOString(),gps:{status:'http_404'},frames:{}}];
snapshots[0].frames['trondheim-city-lines-catalog']={
 status:'ok',generatedAt:at.toISOString(),
 leds:[{led:617,state:'AT_STOP'},{led:616,state:'OFF'}]};
const summary=auditStats(snapshots,catalog);
const line=summary.routes.find(r=>r.line==='11');
assert.equal(summary.gpsGood,2);
assert.equal(summary.gpsErrors,1);
assert.equal(line.uniqueVehicles,1);
assert.equal(line.gpsObservations,1,'Duplicate source observation must be deduped');
assert.equal(line.nearStopCandidates,1);
assert.equal(line.stopCandidates[0].stopId,'NSR:Quay:73415');
assert.equal(line.stopCandidates[0].frameCompared,1);
assert.equal(line.stopCandidates[0].frameActive,1);
assert.equal(line.stopCandidates[0].frameInactive,0);
const frameOff=auditStats([{takenAt:at.toISOString(),gps:{status:'ok',...result},
 frames:{'trondheim-city-lines-catalog':{status:'ok',
  generatedAt:at.toISOString(),leds:[]}}}],catalog);
const off=frameOff.routes.find(r=>r.line==='11').stopCandidates[0];
assert.equal(off.frameCompared,1);
assert.equal(off.frameInactive,1);
const lateFrame=auditStats([{takenAt:at.toISOString(),gps:{status:'ok',...result},
 frames:{'trondheim-city-lines-catalog':{status:'ok',
  generatedAt:'2026-10-27T11:50:00Z',leds:[]}}}],catalog);
assert.equal(lateFrame.routes.find(r=>r.line==='11').stopCandidates[0].frameCompared,0,
 'A time-incompatible frame must never be used to judge stop registration');
const onlyShared=auditStats([{takenAt:at.toISOString(),gps:{status:'ok',...result},
 frames:{'trondheim-city-lines-catalog':{status:'http_503'},
  'trondheim-shared-stops-board':{status:'ok',generatedAt:at.toISOString(),
   leds:[{led:76,state:'AT_STOP'}]}}}],catalog);
assert.equal(onlyShared.routes.find(r=>r.line==='11').stopCandidates[0].frameCompared,0,
 'Lerkendal gård cannot be tested by an unmapped 147 LED board');
const atLerkendal=summarizeGps({...source,vehicles:[{
 id:'bus-on-line-11',line:'11',latitude:63.412654,longitude:10.399831,
 lastUpdated:at.toISOString(),source:'GPS',provider:'Entur/ATB'}]},catalog,at);
assert.equal(atLerkendal.vehicles[0].nearby.stopId,'NSR:Quay:73421');
const sharedMatch=auditStats([{takenAt:at.toISOString(),gps:{status:'ok',...atLerkendal},
 frames:{'trondheim-city-lines-catalog':{status:'http_503'},
  'trondheim-shared-stops-board':{status:'ok',generatedAt:at.toISOString(),
   leds:[{led:76,state:'AT_STOP'}]}}}],catalog);
const lerk=sharedMatch.routes.find(r=>r.line==='11').stopCandidates[0];
assert.equal(lerk.frameCompared,1);
assert.equal(lerk.frameActive,1);
assert.equal(lerk.sourceCatalog,0);
assert.equal(lerk.sourceShared147,1);
assert.equal(summary.routes.length,47);
assert.equal(summary.routes.find(r=>r.line==='12').uniqueVehicles,0);
console.log('PASS: 47 route profiles, Lerkendal gård, source/freshness, pseudonymization, GPS/frame separation, dedup and Oslo day bounds');
