import assert from 'node:assert/strict';
import fs from 'node:fs';
import {busAllowlist,usesUnifiedBus,usesStopAccuracy,buildStopAccuracy,stopContextDigest} from '../worker/stop-accuracy.mjs';
import {frameDiagnostics} from '../worker/frame-diagnostics.mjs';
import {apiV1} from '../worker/api/v1.mjs';
import {SIGNAL_POLICY} from '../worker/led-feed-worker.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const ids=['trondheim-bus-1-visual-test','trondheim-bus-board','trondheim-shared-stops-board','trondheim-city-lines-catalog','trondheim-flybuss-live'];
for(const selected of ids){for(const id of ids){
 const board=read('config/boards/'+id+'.json'),profiles=board.routes.map(r=>read('config/routes/'+r+'.json'));
 assert.equal(usesUnifiedBus(board,profiles,{BUS_LIFECYCLE_BOARDS:selected}),id===selected);
 assert.equal(usesUnifiedBus(board,profiles,{BUS_LIFECYCLE_V1:'enabled'}),false,'Old global switch cannot broadly enable');
 assert.equal(usesUnifiedBus(board,profiles,{BUS_LIFECYCLE_BOARDS:'*'}),false);
}}
assert.deepEqual(busAllowlist({BUS_LIFECYCLE_BOARDS:ids.join(',')}),ids);
assert.deepEqual(busAllowlist({BUS_LIFECYCLE_BOARDS:'trondheim-bus-board, *'}),[]);
for(const id of ['grakallbanen-prototype-board','grakallbanen-board','oslo-metro-board']){
 const b=read('config/boards/'+id+'.json');assert(!usesUnifiedBus(b,b.routes.map(r=>read('config/routes/'+r+'.json')),{BUS_LIFECYCLE_BOARDS:id}));
}
assert(usesStopAccuracy(read('config/boards/'+ids[0]+'.json')),'Bus1 existing activation retained independently');
const board=read('config/boards/'+ids[4]+'.json'),hardware=read('config/hardware/'+ids[4]+'-hardware.json'),profiles=board.routes.map(r=>read('config/routes/'+r+'.json'));
const now=Date.parse('2026-10-13T12:00:00Z'),n=board.nodes[0],p=profiles[0];
const ctx={board,hardware,profiles,now,unifiedBus:true,signalPolicy:SIGNAL_POLICY};ctx.bindingDigest=await stopContextDigest(ctx);
const call={id:'trip',lineId:p.line.id,quayId:n.stopIds[0],destination:n.routeDirections[p.id].destinationMatches[0],serviceDate:'2026-10-13',receivedAt:now,realtime:true,expectedArrival:now-1000};
const result=buildStopAccuracy({...ctx,calls:[call]});
assert.equal(result.frame.leds.length,0);
assert(!('diagnostics' in result.frame),'PixelFrame remains unchanged');
const report=frameDiagnostics(JSON.parse(JSON.stringify(result.saved)),board.id,now);
assert.equal(report.sequence,result.frame.sequence);assert(report.uncertain);assert(report.observations[0].reason.includes('forecast expired'));
assert.equal(report.observations[0].state,'OFF');assert.equal(report.status,'CURRENT');
assert.equal(frameDiagnostics(result.saved,board.id,now+400000).status,'STALE');
assert.equal(frameDiagnostics(null,board.id,now).status,'NOT_OBSERVED');
assert.equal(frameDiagnostics(result.saved,'wrong-board',now).status,'NOT_OBSERVED');
const got=await apiV1(new Request('https://test/api/v1/frame/'+board.id+'/diagnostics'),{}, {frameDiagnostics:async id=>Response.json(frameDiagnostics(result.saved,id,now))});
assert.deepEqual(await got.json(),report);
assert.equal((await apiV1(new Request('https://test/api/v1/frame/'+board.id+'/diagnostics',{method:'POST'}),{},{})).status,405);
console.log('Independent allowlist stages, rollback, protected tram/metro, uncertainty sidecar and API contract PASS');
