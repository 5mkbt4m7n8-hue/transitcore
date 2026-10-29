// Read-only Entur audit. Public stop data only; never fetch vehicle positions.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {safetyCatalog} from '../core/engines/strict-station-gps.mjs';
const board=JSON.parse(readFileSync(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url)));
const endpoint='https://api.entur.io/journey-planner/v3/graphql';
const stations=[...new Set(board.nodes.map(n=>n.stationId))], actual=new Map(), mismatches=[];
for(let i=0;i<stations.length;i+=20){
  const ids=stations.slice(i,i+20);
  const query='{'+ids.map((id,j)=>`s${j}:stopPlace(id:"${id}"){id name quays{id latitude longitude}}`).join(' ')+'}';
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','ET-Client-Name':'transitcore-strict-quay-audit'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
  assert(response.ok,`Entur HTTP ${response.status}`);
  const body=await response.json();assert(!body.errors,JSON.stringify(body.errors));
  for(const stop of Object.values(body.data))for(const quay of stop?.quays||[])actual.set(quay.id,{...quay,stationId:stop.id});
}
for(const node of board.nodes){
  const quay=actual.get(node.quayId);
  if(!quay||quay.stationId!==node.stationId||Math.abs(quay.latitude-node.lat)>0.00001||Math.abs(quay.longitude-node.lon)>0.00001)
    mismatches.push({led:node.led,quayId:node.quayId,configuredStation:node.stationId,configuredLatitude:node.lat,configuredLongitude:node.lon,actual:quay||null});
}
const safe=safetyCatalog(board.nodes),unsafe=safe.filter(node=>{
  const quay=actual.get(node.quayId);
  return !quay||quay.stationId!==node.stationId||Math.abs(quay.latitude-node.lat)>0.00001||Math.abs(quay.longitude-node.lon)>0.00001;
});
for(const quay of actual.values())if(!safe.some(n=>n.quayId===quay.id))unsafe.push(quay);
console.log(JSON.stringify({endpoint,checkedAt:new Date().toISOString(),configuredQuays:board.nodes.length,stopPlaces:stations.length,enturQuays:actual.size,competitorOnlyQuays:safe.filter(n=>n.competitorOnly).length,verified:board.nodes.length-mismatches.length,quarantined:safe.filter(n=>n.quarantined).length,unsafeMismatchCount:unsafe.length,mismatches},null,2));
if(unsafe.length)process.exitCode=1;
