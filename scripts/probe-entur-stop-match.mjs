// Read-only AtB exact-join quality gate; only aggregated counters leave this
// process. Reports are provider-reported, never independent physical proof.
import {readFile} from 'node:fs/promises';
import {fetchAtbFleetGps} from '../worker/atb-fleet-gps.mjs';
import {parseAtbReportedStops} from '../core/providers/entur/siri-vm-stop-parser.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';

const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const board=await read('config/boards/trondheim-city-lines-catalog.json');
const profiles=await Promise.all(board.routes.map(id=>read('config/routes/'+id+'.json')));
const byLine=new Map(profiles.map(p=>[String(p.line.publicCode),p]));
const byQuay=new Map(board.nodes.map(n=>[n.quayId,n]));
const now=Date.now();
const gps=await fetchAtbFleetGps({now,clientName:'transitcore-stop-evidence-audit'});
const byId=new Map(gps.vehicles.map(v=>[v.id,v]));
const siri=await fetch('https://api.entur.io/realtime/v1/rest/vm?maxSize=1500',{
 headers:{'ET-Client-Name':'transitcore-stop-evidence-audit','Accept':'application/xml'},
 signal:AbortSignal.timeout(18000)});
if(!siri.ok)throw Error('SIRI VM HTTP '+siri.status);
const reports=parseAtbReportedStops(await siri.text());
const summary={atbGpsVehicles:byId.size,providerAtStopReports:reports.length,
 matchedGpsIdentity:0,cataloguedQuay:0,passedExactGate:0,
 reasons:{}};
for(const report of reports){
 const obs=byId.get(report.vehicleRef);
 if(!obs)continue;
 summary.matchedGpsIdentity++;
 const node=byQuay.get(report.quayId);
 if(node)summary.cataloguedQuay++;
 const vehicle={id:obs.id,publicCode:obs.line,destination:obs.destination,
   latitude:obs.latitude,longitude:obs.longitude,timestamp:obs.lastUpdated};
 const result=evaluateEnturStopEvidence({
   report,vehicle,profile:byLine.get(String(obs.line)),node,now:Date.now()});
 if(result.accepted)summary.passedExactGate++;
 const reason=result.reason||'unknown';
 summary.reasons[reason]=(summary.reasons[reason]||0)+1;
}
console.log('ATB_REPORTED_STOP_JOIN '+JSON.stringify({...summary,
 note:'Single public SIRI VM sample, first 1500 activities only. Requires source identity, exact Quay/route/direction, synchronized fresh timestamps, nearby measured GPS. No ID/GPS logging, no deploy, no LED changes.'
}));
