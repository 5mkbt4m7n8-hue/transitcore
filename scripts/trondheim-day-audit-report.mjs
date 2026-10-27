// Final daily evidence report from independently scheduled GitHub Actions artifacts.
// 'Not observed' means sampling/GPS coverage insufficient, NOT a skipped stop.
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadCatalog,auditStats} from './trondheim-day-audit-core.mjs';
const base=process.env.GITHUB_API_URL||'https://api.github.com';
const repository=process.env.GITHUB_REPOSITORY||'5mkbt4m7n8-hue/transitcore';
const token=process.env.GITHUB_TOKEN;
if(!token||!/^[\w.-]+\/[\w.-]+$/.test(repository))
 throw Error('GITHUB_TOKEN / GITHUB_REPOSITORY missing');
async function json(url){
 const r=await fetch(url,{headers:{Authorization:'Bearer '+token,
  Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
  signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('GitHub API status '+r.status);
 return r.json();
}
const root=base+'/repos/'+repository;
const artifacts=[];
for(let page=1;page<=10;page++){
 const response=await json(root+'/actions/artifacts?name=trondheim-buss-gps-20261027&per_page=100&page='+page);
 const entries=(response.artifacts||[]).filter(x=>!x.expired&&x.name==='trondheim-buss-gps-20261027');
 artifacts.push(...entries);
 if((response.artifacts||[]).length<100)break;
}
if(!artifacts.length)throw Error('No evidence artifacts: cannot invent a daily report');
console.log('Evidence archives: '+artifacts.length);
const temp=await mkdtemp(join(tmpdir(),'trondheim-day-')),snapshots=[];
let invalid=0,read=0;
try{
 for(const a of artifacts){
  const response=await fetch(a.archive_download_url,{headers:{
   Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},
   signal:AbortSignal.timeout(25000)});
  if(!response.ok){invalid++;continue;}
  const buf=Buffer.from(await response.arrayBuffer());
  if(buf.length>3_000_000){invalid++;continue;}
  const z=join(temp,String(a.id)+'.zip');
  await writeFile(z,buf);
  try{
   const raw=execFileSync('unzip',['-p',z,'trondheim-day-snapshot.json'],
    {encoding:'utf8',maxBuffer:7_000_000});
   const source=JSON.parse(raw);
   if(source.schemaVersion!==1||source.auditDate!=='2026-10-27'||
     source.routeCount!==47||!Array.isArray(source.snapshots)){invalid++;continue;}
   for(const s of source.snapshots){
    if(typeof s.takenAt!=='string'||!Number.isFinite(Date.parse(s.takenAt)))continue;
    snapshots.push(s);
   }
   read++;
  }catch{invalid++;}
 }
}finally{await rm(temp,{recursive:true,force:true});}
snapshots.sort((a,b)=>a.takenAt.localeCompare(b.takenAt));
if(!snapshots.length)throw Error('No valid observations; unverified day');
const catalog=await loadCatalog();
const stats=auditStats(snapshots,catalog);
const times=snapshots.map(s=>Date.parse(s.takenAt)).filter(Number.isFinite);
const latest=Math.max(...times),earliest=Math.min(...times);
const fmt=(ms)=>new Date(ms).toLocaleString('nb-NO',{timeZone:'Europe/Oslo'});
const csv=(s)=>'"'+String(s??'').replaceAll('"','""').replace(/^[=+@-]/,x=>"'"+x)+'"';
const cells=[];
for(const r of stats.routes){
 for(const stop of catalog.byLine[r.line]){
  const s=r.stopCandidates.find(x=>x.stopId===stop.id);
  cells.push([r.line,stop.id,stop.name,stop.led,
   s?.observations??0,s?.vehicles??0,s?.ambiguous??0,
   s?.frameCompared??0,s?.frameActive??0,s?.frameInactive??0,
   s?.sourceCatalog??0,s?.sourceShared147??0,
   s?'GPS_NAERHET_KANDIDAT':'IKKE_OBSERVERT','IKKE_BEVIS_FOR_AT_STOP']);
 }
}
const headers=['line','quay','stop_name','led_catalog','gps_near_samples',
 'distinct_vehicles_near','ambiguous','frame_compared','led_active',
 'led_inactive','from_catalog_1282','from_shared_147','evidence','stop_registration'];
const fullCsv=[headers,...cells].map(a=>a.map(csv).join(',')).join('\n')+'\n';
const lineCsv=[['line','catalog_stops','vehicles_seen','gps_observations',
 'stops_with_proximity_candidates'],...stats.routes.map(r=>[
 r.line,r.routeStops,r.uniqueVehicles,r.gpsObservations,r.nearStopCandidates
 ])].map(a=>a.map(csv).join(',')).join('\n')+'\n';
const eleven=stats.routes.find(r=>r.line==='11');
const lerkendal=eleven.stopCandidates.filter(x=>/Lerkendal/i.test(x.name));
const md=[
 '# Trondheim buss – GPS-/LED-observasjoner 27.10.2026','',
 '> **VIKTIG:** Dette er en stikkprøvelogg. IKKE OBSERVERT betyr aldri',
 '> at bussen hoppet over et stopp eller at Linear ikke registrerte den.',
 '> GPS-nærhet er ikke en bekreftet stopp-/påstigningshendelse.','',
 '- Observasjonsperiode (Oslo): **'+fmt(earliest)+' – '+fmt(latest)+'**',
 '- Kilde: TransitCore offentlig, lesebasert Entur Vehicle Positions v2 og PixelFrames',
 '- Observasjonsarkiver: '+read+' gyldige / '+invalid+' ugyldige; totalt '+artifacts.length,
 '- Målinger: **'+stats.snapshots+'** (hvorav '+stats.gpsGood+' GPS gyldig, '+stats.gpsErrors+' GPS-feil)',
 '- Katalog: '+stats.routes.length+' linjer; 1282 katalog-LED-punkter',
 '- Den statiske 147-LED Shared Stops-profilen mangler Lerkendal gård','',
 '## Linje 11 ved Lerkendal','',
 '- Lerkendal gård: Quay 73414 (mot Risvollan) og 73415 (mot Stavset)',
 '- Lerkendal: Quay 73420 og 73421',
 '- GPS-nærhet observert: '+(lerkendal.length?lerkendal.map(s=>s.name+' '+s.stopId+' fra '+s.vehicles+' kjøretøy / '+s.observations+' prøver, tidsnær sammenlignbar katalogframe '+(s.frameCompared||0)+' (LED aktiv '+(s.frameActive||0)+', inaktiv '+(s.frameInactive||0)+', fullkatalog '+(s.sourceCatalog||0)+', delt 147 '+(s.sourceShared147||0)+')').join('; '):'Ingen, som ikke automatisk betyr systemfeil'), '',
 '## Datafrekvens og mangler','',
 '- Uttrekk omtrent hvert 20. sekund innenfor tidsavgrensede kjøringer',
 '- GitHub Actions kan forsinkes/hoppes over: ingen garantert kontinuerlig totaldekning',
 '- Ingen rå GPS-koordinater eller kjøretøy-ID-er lagres i audit-artifaktene',
 '- Tavleframe-feil: '+JSON.stringify(stats.frameErrors),
 '- Ved HTTP 503 fra fullkatalogen sammenlignes eksakt Quay+linje mot 147-LED Shared Stops der det finnes; Lerkendal gård finnes ikke i denne tavlen og forblir ukjent.',
 '- LED-aktivitet ved en geografisk stoppekandidat er bare en samtidig indikasjon; den bekrefter ikke samme buss-ID, døråpning eller fysisk stopp.','',
 '## Filer og neste steg','',
 '- trondheim-lines.csv: alle profiler, antall observerte kjøretøy og GPS-prøver.',
 '- trondheim-stop-candidates.csv: alle profilerte stoppepunkter og evidensstatus.',
 '- Sammenlign med fysisk buss og den samme tavleprofilen/boardId.',
 '- Korriger profildekning før endringer i bussens felles bevegelseslogikk.'
].join('\n')+'\n';
await mkdir('out',{recursive:true});
await Promise.all([
 writeFile('out/trondheim-day-report.md',md),
 writeFile('out/trondheim-lines.csv',lineCsv),
 writeFile('out/trondheim-stop-candidates.csv',fullCsv),
 writeFile('out/trondheim-report.json',JSON.stringify({...stats,
  sourceRunArtifacts:read,invalidRunArtifacts:invalid,
  observedFrom:new Date(earliest).toISOString(),
  observedTo:new Date(latest).toISOString()},null,2)+'\n')
]);
console.log('Report complete: '+stats.snapshots+' samples, '+read+' archives');
