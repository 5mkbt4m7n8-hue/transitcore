import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const routeDir=path.join(root,"config","routes");
const registry=JSON.parse(fs.readFileSync(path.join(routeDir,"routes.json"),"utf8"));
const errors=[];
const seenFiles=new Set(),seenIds=new Set();
const fail=(file,message)=>errors.push(`${file}: ${message}`);

if(registry.schemaVersion!==1)fail("routes.json","schemaVersion must be 1");
if(!Array.isArray(registry.routes)||!registry.routes.length)fail("routes.json","routes must be a non-empty array");

for(const entry of registry.routes||[]){
  const file=entry.profile;
  if(typeof file!=="string"||!file.endsWith(".json")){fail("routes.json","every profile must be a JSON filename");continue}
  if(seenFiles.has(file))fail("routes.json",`duplicate profile ${file}`);seenFiles.add(file);
  const full=path.join(routeDir,file);
  if(!fs.existsSync(full)){fail(file,"file does not exist");continue}
  let p;try{p=JSON.parse(fs.readFileSync(full,"utf8"))}catch(e){fail(file,`invalid JSON: ${e.message}`);continue}
  if(p.schemaVersion!==1)fail(file,"schemaVersion must be 1");
  if(typeof p.id!=="string"||!p.id)fail(file,"id is required");
  else if(seenIds.has(p.id))fail(file,`duplicate profile id ${p.id}`);else seenIds.add(p.id);
  if(!p.provider?.codespaceId||!p.provider?.vehicleEndpoint)fail(file,"provider codespaceId and vehicleEndpoint are required");
  if(!p.line?.id||!p.line?.publicCode||!p.line?.mode)fail(file,"line id, publicCode and mode are required");
  if(!Array.isArray(p.directions)||!p.directions.length)fail(file,"at least one direction is required");
  if(!Array.isArray(p.stops)||p.stops.length<2)fail(file,"at least two stops are required");
  if(!Array.isArray(p.shape)||p.shape.length<2)fail(file,"shape must contain at least two points");
  const stopIds=new Set(),directionIds=new Set();let previous=-Infinity;
  for(const d of p.directions||[]){if(directionIds.has(d.id))fail(file,`duplicate direction id ${d.id}`);directionIds.add(d.id);if(!Array.isArray(d.destinationMatches)||!d.destinationMatches.length)fail(file,`direction ${d.id} has no destinationMatches`)}
  for(const [i,s] of (p.stops||[]).entries()){
    if(stopIds.has(s.id))fail(file,`duplicate stop id ${s.id}`);stopIds.add(s.id);
    if(!Number.isFinite(s.lat)||!Number.isFinite(s.lon))fail(file,`stop ${i} has invalid coordinates`);
    if(!Number.isFinite(s.shapeDistanceMeters)||s.shapeDistanceMeters<previous)fail(file,`stop ${i} has invalid shapeDistanceMeters`);previous=s.shapeDistanceMeters;
  }
  if(p.display?.showVled){
    const used=new Set(),total=p.hardwareMapping?.totalVleds;
    if(!Number.isInteger(total)||total<1)fail(file,"hardwareMapping.totalVleds is required for VLED profiles");
    const reserve=(n,label)=>{if(!Number.isInteger(n)||n<0||n>=total)fail(file,`${label} is outside hardware range`);else if(used.has(n))fail(file,`${label} collides at VLED ${n}`);else used.add(n)};
    (p.stops||[]).forEach((s,i)=>{reserve(s.vled,`stop ${i}`);if(i<p.stops.length-1){const m=s.segmentToNext;if(!Number.isInteger(m?.vledStart)||!Number.isInteger(m?.vledCount)||m.vledCount<1)fail(file,`stop ${i} has invalid segmentToNext`);else for(let n=0;n<m.vledCount;n++)reserve(m.vledStart+n,`segment ${i}`)}});
  }
}

if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log(`Route profiles OK: ${seenIds.size} profiles, simultaneous display supported.`);

const boardDir=path.join(root,"config","boards");
if(fs.existsSync(boardDir)){
  const boardFiles=fs.readdirSync(boardDir).filter(file=>file.endsWith(".json"));
  for(const file of boardFiles){
    const board=JSON.parse(fs.readFileSync(path.join(boardDir,file),"utf8"));
    if(![1,2].includes(board.schemaVersion))throw new Error(`${file}: schemaVersion must be 1 or 2`);
    if(!["station-network","route-segments"].includes(board.layout))throw new Error(`${file}: invalid layout`);
    if(!Array.isArray(board.routes)||!board.routes.length)throw new Error(`${file}: routes must be non-empty`);
    for(const route of board.routes)if(!seenIds.has(route))throw new Error(`${file}: unknown route profile ${route}`);
    if(!Number.isInteger(board.leds?.count)||board.leds.count<1)throw new Error(`${file}: invalid LED count`);
    const nodeIds=new Set();
    for(const node of board.nodes||[]){
      if(nodeIds.has(node.id))throw new Error(`${file}: duplicate node ${node.id}`);nodeIds.add(node.id);
      if(!Number.isInteger(node.led)||node.led<0||node.led>=board.leds.count)throw new Error(`${file}: node ${node.id} has invalid LED`);
      if(!Array.isArray(node.stopIds)||!node.stopIds.length)throw new Error(`${file}: node ${node.id} has no stop IDs`);
      if(board.schemaVersion===2){
        if(!board.directionalPlatforms)throw new Error(`${file}: v2 board must enable directionalPlatforms`);
        if(!node.quayId||!node.stationId)throw new Error(`${file}: v2 node ${node.id} needs quayId and stationId`);
        if(!node.routeDirections||typeof node.routeDirections!=="object")throw new Error(`${file}: v2 node ${node.id} needs routeDirections`);
      }
    }
  }
  console.log(`Board profiles OK: ${boardFiles.length} board definitions.`);
}



