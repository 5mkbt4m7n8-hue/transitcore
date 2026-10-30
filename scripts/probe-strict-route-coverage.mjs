// Credential-free, read-only live comparison of the unchanged 60 m production
// candidate rule versus an explicit 85 m WHAT-IF. No GPS, IDs or timestamps logged.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {interpretStationVehicles} from '../core/engines/position-interpretation.mjs';
import {interpretStrictStationGps} from '../core/engines/strict-station-gps.mjs';
import {fetchAtbFleetGps} from '../worker/atb-fleet-gps.mjs';

const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const board=await read('config/boards/trondheim-city-lines-catalog.json');
const profiles=await Promise.all(board.routes.map(id=>read('config/routes/'+id+'.json')));
const versions=['60','85'],samples=6;
const tallies=Object.fromEntries(versions.map(v=>[v,{samples:0,observations:0,accepted:0,rejected:0,reasons:{},lines:{}}]));
let gained85=0,lost85=0,below60Gain=0,above60Gain=0;
function percentage(n,d){return d?Math.round(1000*n/d)/10:null;}
function record(t,rows){
  t.samples++;t.observations+=rows.length;
  for(const row of rows){
    const matched=row.status==='matched',reason=String(row.reason||'unspecified');
    t[matched?'accepted':'rejected']++;
    t.reasons[reason]=(t.reasons[reason]||0)+1;
    const line=String(row.line||'unknown');
    const x=t.lines[line]??={observations:0,accepted:0};
    x.observations++;if(matched)x.accepted++;
  }
}
console.log('WHAT_IF_CONFIG '+JSON.stringify({boardArrivalRadiusMeters:board.render?.arrivalRadiusMeters,defaultMaxDistanceMeters:60,candidateMaxDistanceMeters:85,note:'No change to deployed 60 m strict policy.'}));
for(let poll=1;poll<=samples;poll++){
  if(poll>1)await delay(8000);
  const now=Date.now(),source=await fetchAtbFleetGps({now});
  const vehicles=source.vehicles.map(v=>({
    id:v.id,publicCode:v.line,destination:v.destination,
    latitude:v.latitude,longitude:v.longitude,timestamp:v.lastUpdated
  }));
  const input={board,profiles,vehicles,now};
  const first=interpretStationVehicles(input).observations;
  const second=interpretStrictStationGps({...input,maxDistanceMeters:85}).observations;
  if(first.length!==vehicles.length||second.length!==first.length)throw Error('Observation counts differ');
  record(tallies['60'],first);record(tallies['85'],second);
  const sample={poll,observations:first.length,accepted60:0,accepted85:0,new85:0,
    line1:{observations:0,accepted60:0,accepted85:0},
    line11:{observations:0,accepted60:0,accepted85:0}};
  for(let i=0;i<first.length;i++){
    const a=first[i],b=second[i];if(a.id!==b.id)throw Error('Comparison order differs');
    const oldOK=a.status==='matched',newOK=b.status==='matched';
    if(oldOK)sample.accepted60++;
    if(newOK)sample.accepted85++;
    const line=a.line==='1'?'line1':a.line==='11'?'line11':null;
    if(line){sample[line].observations++;if(oldOK)sample[line].accepted60++;if(newOK)sample[line].accepted85++;}
    if(oldOK&&!newOK)lost85++;
    if(!oldOK&&newOK){
      gained85++;sample.new85++;
      if(b.nearestQuayDistanceMeters>60)above60Gain++;else below60Gain++;
    }
  }
  console.log('STRICT_RADIUS_SAMPLE '+JSON.stringify(sample));
}
const summarize=t=>({
  samples:t.samples,observations:t.observations,accepted:t.accepted,
  acceptancePercent:percentage(t.accepted,t.observations),rejected:t.rejected,
  line1:{observations:t.lines['1']?.observations||0,accepted:t.lines['1']?.accepted||0,percent:percentage(t.lines['1']?.accepted||0,t.lines['1']?.observations||0)},
  line11:{observations:t.lines['11']?.observations||0,accepted:t.lines['11']?.accepted||0,percent:percentage(t.lines['11']?.accepted||0,t.lines['11']?.observations||0)},
  rejectionReasons:t.reasons
});
console.log('STRICT_RADIUS_COMPARISON '+JSON.stringify({
  radius60:summarize(tallies['60']),radius85:summarize(tallies['85']),
  additionalAcceptedAt85:gained85,acceptedLostAt85:lost85,
  additionalAt60To85Meters:above60Gain,additionalBelow60Meters:below60Gain,
  note:'Observations include repeated buses and may be far from stops. Acceptance does not prove actual quay correctness. No production deployment.'
}));
if(tallies['60'].observations===0||lost85!==0)throw Error('No observations or 85 m regression');
