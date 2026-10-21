// Offline, reproducible diagnostic. Reads repository route profiles; never
// calls a live feed, changes the map, or asserts full network coverage.
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const base=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const M=require('../web/linear/network/model.js');
const read=path=>JSON.parse(readFileSync(join(base,path),'utf8'));
const layout=read('web/linear/network/trondheim-layout.json');
const catalog=read('config/boards/trondheim-city-lines-catalog.json');
const routeFiles=readdirSync(join(base,'config/routes')).filter(f=>/^atb-bus-\d+-live\.json$/.test(f));
const profiles=routeFiles.map(file=>read('config/routes/'+file));
const exact=M.verifiedSegments(layout,profiles);
const enhanced=M.verifiedSegments(layout,profiles,[catalog]);
const edgeKey=e=>e.pathId+'/'+e.edgeIndex;
const originalKeys=new Set(exact.map(edgeKey));
assert(enhanced.every(e=>e.routes.length),'No colored segment without route evidence');
assert(enhanced.length>=exact.length,'StopPlace evidence must never reduce exact coverage');
assert(originalKeys.size===exact.length,'Duplicate exact edge');
assert(enhanced.filter(e=>e.pathId==='trace-07'&&e.edgeIndex===0).every(e=>e.routes.every(r=>r.evidence!=='unique-stopplace')),'Samfundet platforms must not be combined');
const byPath=layout.paths.map(p=>{
 const direct=exact.filter(e=>e.pathId===p.id);
 const all=enhanced.filter(e=>e.pathId===p.id);
 return {id:p.id,segments:p.points.length-1,exactQuay:direct.length,documented:all.length,newStopPlace:all.filter(e=>!originalKeys.has(edgeKey(e))).length,unresolved:p.points.length-1-all.length};
});
const totals={allRoutesLoaded:profiles.length,mapPoints:layout.stops.length,paths:layout.paths.length,segments:byPath.reduce((sum,p)=>sum+p.segments,0),exactQuayEdges:exact.length,catalogVerifiedEdges:enhanced.length,additionalEdges:enhanced.length-exact.length,unresolvedEdges:byPath.reduce((sum,p)=>sum+p.unresolved,0),unmappedStops:layout.stops.filter(s=>!s.bindings.length).length};
const result={status:'partial',notLiveCoverage:true,source:'local route profiles and board catalog',totals,byPath,additionalEvidence:enhanced.filter(e=>!originalKeys.has(edgeKey(e))).map(e=>({path:e.pathId,edge:e.edgeIndex,from:e.from,to:e.to,routes:e.routes.map(r=>({id:r.id,type:r.evidence}))}))};
console.log('InTransit route evidence (offline):',JSON.stringify(totals));
for(const item of byPath)console.log(item.id+': '+item.documented+'/'+item.segments+' documented ('+item.exactQuay+' exact, '+item.newStopPlace+' new StopPlace)');
const dir=process.env.INTRANSIT_AUDIT_DIR;
if(dir){mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'route-evidence-audit.json'),JSON.stringify(result,null,2)+'\n');}
