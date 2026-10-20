// Read-only local shadow. No Worker/admin/device requests and no file writes.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildPixelFrame} from '../core/frame/build-frame.mjs';
import {createStopAccuracyShadow} from '../core/frame/stop-accuracy-shadow.mjs';
import {GPS_PROXIMITY_POLICY} from '../core/engines/stop-evidence.mjs';
import {matchesDirection} from '../core/frame/mapping-support.mjs';
import {normalizeEnturVehicle} from '../core/providers/entur/entur-normalizer.mjs';
import {normalizeStopCall} from '../core/providers/entur/stop-call-evidence.mjs';
import {SIGNAL_POLICY,applyMotionLifecycle} from '../worker/led-feed-worker.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const effective=x=>x?.lifecycle || x?.state || 'OFF';

export function loadDiagnosticContext(routeId='atb-bus-1-live') {
  if(!/^[a-z0-9-]+$/.test(routeId))throw Error('Invalid local route id');
  const profile=read(`config/routes/${routeId}.json`);
  if(routeId==='atb-bus-1-live') return {board:read('config/boards/trondheim-bus-1-visual-test.json'),
    hardware:read('config/hardware/trondheim-bus-1-visual-test-hardware.json'),profiles:[profile],signalPolicy:SIGNAL_POLICY};
  // Diagnostic-only logical view from existing catalogue, NOT a published profile
  // or physical device mapping. No synthetic positions or new route geometry.
  const catalog=read('config/boards/trondheim-city-lines-catalog.json');
  const nodes=catalog.nodes.filter(n=>n.routes.includes(routeId)).map((n,led)=>({...n,led,routes:[routeId]}));
  const id='local-stop-diagnostic';
  const board={...catalog,id,routes:[routeId],nodes,leds:{count:nodes.length},render:{...catalog.render}};
  const hardware={schemaVersion:1,boardProfile:id,leds:{count:nodes.length,brightnessLimit:32},
    assignments:nodes.map(n=>({logicalLed:n.led,physicalLed:n.led}))};
  return {board,hardware,profiles:[profile],signalPolicy:SIGNAL_POLICY};
}

// Mirrors liveStationArrivals selection for comparison ONLY; production stays unchanged.
export function legacyCalls(context,calls,now) {
  const physical=new Map(context.hardware.assignments.map(a=>[a.logicalLed,a.physicalLed]));
  const selected=new Map();
  for(const c of calls) {
    const p=context.profiles.find(p=>String(p.line.publicCode)===String(c.publicCode)) || context.profiles.find(p=>p.line.id===c.lineId); if(!p)continue;
    const window=p.positioning?.stationWindowSeconds || 45;
    const approach=Math.max(window,context.board.render.approachWindowSeconds || 120);
    const when=c.expectedArrival ?? c.expectedDeparture;
    const delta=when==null?NaN:(when-now)/1000;
    if(!Number.isFinite(delta) || delta < -window || delta > approach)continue;
    // Current Worker chooses first node for each quay before filtering route.
    const first=context.board.nodes.find(n=>n.stopIds?.includes(c.quayId));
    for(const n of first && first.routes.includes(p.id) && (!first.routeDirections || matchesDirection(first,p,c.destination))?[first]:[]) {
      const item={id:physical.get(n.led),profile:p,destination:c.destination,vehicleId:c.id,
        deltaSeconds:delta,state:Math.abs(delta)<=window?'AT_STOP':'APPROACHING'};
      const old=selected.get(item.id);
      if(!old || item.state==='AT_STOP' && old.state!=='AT_STOP' || item.state===old.state && Math.abs(delta)<Math.abs(old.deltaSeconds))selected.set(item.id,item);
    }
  }
  return [...selected.values()];
}

export function createComparison(context,{proximity=false}={}) {
  const shadow=createStopAccuracyShadow(context,{enabled:true,...(proximity?{policy:GPS_PROXIMITY_POLICY}:{})});let history={};
  const isCalls=context.profiles[0].positioning?.strategy==='estimated-station-calls';
  return sample=>{
    const {now,vehicles=[],calls=[]}=sample;
    let old=buildPixelFrame({...context,now,vehicles,estimatedCalls:legacyCalls(context,calls,now)},
      {strategy:isCalls?'estimated-calls':context.board.layout,validate:true});
    const afterglow=context.board.render.departureAfterglowSeconds ?? (context.board.id==='trondheim-bus-board'?10:0);
    if(afterglow>0){const r=applyMotionLifecycle(old,history,now,afterglow*1000);history=r.state;old=r.frame;}
    // GPS availability is investigated, but unverified cross-source identity
    // must not silently fuse GPS and call evidence for the same journey.
    const next=shadow.step(isCalls?{...sample,vehicles:[]}:{...sample,calls:[]});
    const ids=new Set([...old.leds,...next.frame.leds].map(x=>x.id));
    return {at:new Date(now).toISOString(),shadowOnly:true,board:context.board.id,
      vehicleCount:vehicles.length,callCount:calls.length,
      comparisons:[...ids].map(id=>({physicalLed:id,old:effective(old.leds.find(l=>l.id===id)),proposed:effective(next.frame.leds.find(l=>l.id===id))})),
      evidence:next.diagnostics};
  };
}

async function request(endpoint,query) {
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','ET-Client-Name':'intransit-stop-shadow'},
    body:JSON.stringify({query}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`Entur HTTP ${response.status}`);
  const result=await response.json();if(result.errors?.length)throw Error('Entur GraphQL query rejected');
  return result.data;
}
export async function capture(context) {
  const p=context.profiles[0],calls=[],vehicles=[];
  const gps=await request(p.provider.vehicleEndpoint,`{vehicles(codespaceId:${JSON.stringify(p.provider.codespaceId)}){vehicleId lastUpdated destinationName line{lineRef publicCode} serviceJourney{serviceJourneyId} location{latitude longitude}}}`);
  for(const v of gps.vehicles || []) if(v.line?.lineRef===p.line.id) {
    const {raw,frameCompatibility,...normalized}=normalizeEnturVehicle(v);
    vehicles.push({...normalized,lineId:v.line.lineRef,
      journeyId:v.serviceJourney?.serviceJourneyId,providerCodespace:p.provider.codespaceId});
  }
  if(p.positioning?.strategy==='estimated-station-calls') {
    const quays=[...new Set(context.board.nodes.flatMap(n=>n.stopIds || []))];
    const start=new Date(Date.now()-75000).toISOString();
    const query='{'+quays.map((id,i)=>`q${i}:quay(id:${JSON.stringify(id)}){id estimatedCalls(startTime:${JSON.stringify(start)} timeRange:675 numberOfDepartures:30){date realtime predictionInaccurate cancellation aimedArrivalTime expectedArrivalTime actualArrivalTime aimedDepartureTime expectedDepartureTime actualDepartureTime destinationDisplay{frontText} serviceJourney{id journeyPattern{line{id publicCode}}}}}`).join('\n')+'}';
    const data=await request(p.positioning.endpoint,query),receivedAt=Date.now();
    for(const q of Object.values(data)) for(const c of q?.estimatedCalls || []) if(c.serviceJourney?.journeyPattern?.line?.id===p.line.id) calls.push(normalizeStopCall(c,q.id,receivedAt));
  }
  return {now:Date.now(),vehicles,calls};
}
async function main() {
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  if(!args.includes('--live') && !args.includes('--replay'))throw Error('Use --live or --replay <normalized-samples.json>; never outputs to a device');
  const context=loadDiagnosticContext(args.includes('--route')?value('--route'):undefined),compare=createComparison(context,{proximity:args.includes('--gps-proximity')});
  if(args.includes('--replay')){for(const sample of JSON.parse(readFileSync(value('--replay'),'utf8')))console.log(JSON.stringify(compare(sample)));return;}
  const count=args.includes('--samples')?Number(value('--samples')):1;
  if(!Number.isInteger(count)||count<1||count>360)throw Error('samples must be 1..360');
  for(let i=0;i<count;i++) {
    if(i)await new Promise(resolve=>setTimeout(resolve,10000));
    try{const sample=await capture(context);console.log(JSON.stringify({input:sample,...compare(sample)}));}
    catch(error){console.log(JSON.stringify({at:new Date().toISOString(),sourceError:error.message,shadowOnly:true}));process.exitCode=1;}
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
