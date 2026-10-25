import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const D=require('../web/linear/diagnostics/model.js');
const C=require('../web/linear/live/catalog.js');
assert.equal(D.API.length,5,'One health check, fleet and three line checks');
assert.deepEqual(D.API.map(x=>x.id),['health','fleet','gps-1','gps-2','gps-3']);
assert(D.API.every(x=>x.url.startsWith('https://transitcore-led-feed.lgb84.workers.dev/api/v1/')));
assert.equal(C.CODES.length,47);
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
for(const code of C.CODES){
 const source=read('config/routes/atb-bus-'+code+'-live.json');
 const original=structuredClone(source),result=C.normalize(source,code);
 assert(result.route.length>=2&&result.stops.length>=2);
 assert.deepEqual(source,original,'Read-only route source');
}
assert.match(D.classifyHttp(404),/finnes ikke/);
assert.match(D.classifyHttp(503),/datakilden/);
assert.match(D.classifyHttp(429),/begrenser/);
assert.match(D.diagnosticsError({name:'TypeError'}).detail,/HTTP-status kan ikke fastslås/);
assert.equal(D.diagnosticsError({name:'TimeoutError'}).status,'timeout');
const time=Date.parse('2026-10-25T20:45:00Z');
const agg=D.gpsAggregate({vehicles:[
 {line:'1',lastUpdated:new Date(time-8000).toISOString(),vehicleId:'private-a',latitude:63.42},
 {line:'2',lastUpdated:new Date(time-4000).toISOString(),id:'private-b',longitude:10.41}
]},time);
assert.equal(agg.freshCount,2);
assert.equal(agg.activeLineCount,2);
assert.equal(agg.newestAgeSeconds,4);
assert.equal(agg.newestGpsIso,new Date(time-4000).toISOString());
assert.deepEqual(D.gpsAggregate({vehicles:[]},time),{
 freshCount:0,newestGpsIso:null,newestAgeSeconds:null,activeLineCount:0
});
const rows=[
 {id:'health',kind:'health',name:'Worker',status:'ok',httpCode:200,durationMs:155},
 {id:'fleet',kind:'gps',name:'Alle busser',status:'empty',httpCode:200,
  freshCount:0,durationMs:200,vehicleId:'should-never-export',
  raw:{vehicleId:'secret',latitude:63.4,longitude:10.4},
  authorization:'Bearer not-for-export'},
 {id:'route-91',kind:'catalog',name:'Linje 91',status:'ok',points:91,stops:31},
 {id:'gps-1',kind:'gps',name:'Linje 1',status:'http-error',httpCode:404}
];
const stats=D.summarize(rows,47);
assert.equal(stats.workerOk,2);
assert.equal(stats.workerUnavailable,1);
assert.equal(stats.catalogLoaded,1);
assert.equal(stats.catalogExpected,47);
assert.equal(stats.freshBuses,0);
const report=D.exportReport(rows,'2026-10-25T21:00:00.000Z');
const encoded=JSON.stringify(report);
assert.equal(report.checks.length,rows.length);
for(const disallowed of ['should-never-export','vehicleId','latitude','longitude',
 'Bearer not-for-export','authorization','raw','secret'])assert(!encoded.includes(disallowed),disallowed);
assert.equal(report.format,'intransit-public-diagnostics-v1');
assert.equal(D.timeLabel(null),'Ingen gyldig måletid');
console.log('InTransit diagnostics: correct source checklist, 47 intact profiles, unambiguous HTTP/CORS, aggregate GPS and private-data-safe export PASS');
