// Conservative, deterministic vehicle progress tracker. GPS checkpoint visits
// establish travel orientation on the *configured* route, NEVER a confirmed
// arrival or Quay. This is a diagnostic/shadow component until live validation.
import {distance} from '../frame/mapping-support.mjs';

const MAX_AGE_MS=30000;
const MAX_GAP_MS=120000;
const MAX_SEQUENCE_MS=300000;
const MAX_SPEED_MPS=35;
const CHECKPOINT_RADIUS_METERS=105;
const CHECKPOINT_SEPARATION_METERS=25;
const MIN_LEG_MS=6000;
const MAX_STEP_GAP=4;

function routeRevision(profile) {
  let hash=2166136261>>>0;
  const value=(profile.stops||[]).map(s=>s.id).join('|');
  for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619)>>>0;
  return hash.toString(16);
}

function checkpoint(profile,vehicle) {
  const stops=profile.stops||[];
  let best=-1,first=Infinity,second=Infinity;
  for(let i=0;i<stops.length;i++){
    const s=stops[i];
    if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon))continue;
    const meters=distance({lat:vehicle.latitude,lon:vehicle.longitude},s);
    if(meters<first){second=first;first=meters;best=i;}
    else if(meters<second)second=meters;
  }
  // No guess in dense stop clusters; one stop in a profile is insufficient
  // to establish a movement sequence.
  if(first>CHECKPOINT_RADIUS_METERS||second-first<=CHECKPOINT_SEPARATION_METERS)return null;
  const s=stops[best];
  return {index:best,quayId:s.id,meters:Math.round(first)};
}

function orientation(visited) {
  if(visited.length<3)return null;
  const [a,b,c]=visited.slice(-3);
  const d1=b.index-a.index,d2=c.index-b.index;
  if(!d1||!d2||Math.sign(d1)!==Math.sign(d2)||
    Math.abs(d1)>MAX_STEP_GAP||Math.abs(d2)>MAX_STEP_GAP||
    b.at-a.at<MIN_LEG_MS||c.at-b.at<MIN_LEG_MS||
    c.at-a.at>MAX_SEQUENCE_MS)return null;
  return d1>0?'forward':'reverse';
}

// Caller supplies previousState, typically from a single sequential state
// owner. Do not share per-process memory between Worker isolates.
export function updateRouteProgress({profiles,vehicles,previousState={},now=Date.now()}) {
  const byLine=new Map();
  for(const profile of profiles){
    const code=String(profile.line?.publicCode||'');
    if(byLine.has(code))byLine.set(code,null);
    else byLine.set(code,profile);
  }
  const old=previousState?.tracks||{};
  const tracks=Object.create(null),results=[];
  const latest=new Map();
  for(const v of vehicles){
    if(typeof v.id!=='string'||!v.id||v.id.length>120||!v.publicCode)continue;
    const key=String(v.publicCode)+':'+v.id;
    const timestamp=Date.parse(v.timestamp||'');
    const previous=latest.get(key);
    if(!previous||timestamp>Date.parse(previous.timestamp||''))latest.set(key,v);
  }
  for(const [key,v] of latest){
    const profile=byLine.get(String(v.publicCode));
    const time=Date.parse(v.timestamp||'');
    const valid=profile&&Number.isFinite(time)&&time<=now&&now-time<=MAX_AGE_MS&&
      typeof v.latitude==='number'&&typeof v.longitude==='number'&&
      Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)&&
      Math.abs(v.latitude)<=90&&Math.abs(v.longitude)<=180;
    if(!valid){results.push({key,status:'unresolved',reason:'invalid-or-stale'});continue;}
    const revision=routeRevision(profile),prior=old[key];
    const ongoing=prior?.revision===revision&&
      time>prior.lastAt&&time-prior.lastAt<=MAX_GAP_MS&&
      prior.line===String(v.publicCode);
    let visits=ongoing?[...(prior.visits||[])].slice(-3):[];
    let reason='insufficient-checkpoints';
    if(ongoing&&prior.lastPoint){
      const delta=distance({lat:v.latitude,lon:v.longitude},prior.lastPoint);
      const seconds=(time-prior.lastAt)/1000;
      if(seconds>0&&delta/seconds>MAX_SPEED_MPS){
        // GPS teleportation cannot preserve old direction confidence.
        visits=[];reason='implausible-jump';
      }
    }
    const cp=checkpoint(profile,v);
    if(cp){
      if(!visits.length||visits.at(-1).index!==cp.index){
        if(visits.length&&Math.abs(cp.index-visits.at(-1).index)>MAX_STEP_GAP){
          visits=[];reason='discontinuous-route';
        }
        visits.push({index:cp.index,at:time});
      }
    }
    visits=visits.slice(-3);
    const orient=orientation(visits);
    if(orient)reason='ordered-gps-checkpoints';
    const proposed=profile.directions?.filter(direction=>
      orient==='forward'?direction.reverseShape===false:orient==='reverse'?direction.reverseShape===true:false)||[];
    const direction=orient&&proposed.length===1?proposed[0]:null;
    const result={key,status:direction?'direction-tracked':'unresolved',
      reason:direction?'ordered-gps-checkpoints':reason,
      orientation:direction?orient:null,directionLabel:direction?.label||null,
      // These are candidates, never statements that a bus physically stopped.
      lastNearQuayId:cp?.quayId||null,checkpointCount:visits.length};
    results.push(result);
    tracks[key]={line:String(v.publicCode),revision,lastAt:time,
      lastPoint:{lat:v.latitude,lon:v.longitude},visits};
  }
  // Missing vehicles and expired trips disappear. No stale direction latch.
  return {state:{version:1,tracks},results};
}
