// Read-only production proof: no Entur calls, no vehicle identifiers,
// no raw frames. A successful GitHub Pages build is not production evidence.
const API='https://transitcore-led-feed.lgb84.workers.dev/v1/trondheim/gps-v22';

// An explicitly limited allow-list. Only counters from the public *daily*
// report; never include vehicle IDs, positions, raw frames or Quay IDs.
const COUNTERS=['frames','gpsPrimary','gpsSecondaryUnlocated','v20Compared',
 'v20Supported','v20Unresolved','v20DifferentLed','v21Compared',
 'v21Supported','v21Unresolved','v21DifferentLed','retained','narrowed',
 'resolved','sourceStop','sequenceConflict','hypothesisLimit'];
const DIAGNOSTICS=['frames','firstSeen','sameVehicleWithin3m',
 'sameVehicleAfter3m','outsideQuayRadius','oneNearbyQuay','multipleNearbyQuays'];
const MEMORY=['frames','coldStart','catalogReset','continued',
 'priorWithin3m','priorAfter3m','priorUnknown'];
const FRAME_MATCH=['frames','priorFrameKnown','priorPrimary','currentPrimary',
 'repeatedPrimary','newSincePrior','absentSincePrior','uncomparablePrimary'];
const V25_BASE_FIELDS=['frames','primary','matchedPrior','compared','supported',
 'retained','narrowed','resolved'];
const V25_FIELDS=['frames','primary','matchedPrior','compared','supported',
 'retained','narrowed','resolved','followupFrames','restoredWithCandidates',
 'restoredAmbiguous','restoredChanged','restoredNarrowed',
 'restoredDirection','restoredABC'];
const V25_STATES=['fresh','restored','expired','catalogChanged','keyRotated'];
const CADENCE_FIELDS=['frames','sameSlotFreshRestored',
 'nextSlotFreshAfterRestored','nextSlotRestoredAfterRestored',
 'threePlusFrameContinuations','maxContinuousFrames'];
const CADENCE_LANES=['catalog','line1-fast','dual-fast'];
const CADENCE_LANE_FIELDS=['frames','fresh','restored'];
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
export function summarizeV22Daily(payload){
 if(payload?.scope!=='trondheim-gps-v22-scheduled-quality')return null;
 const lines=Object.fromEntries(['1','11'].map(code=>[code,{
  ...Object.fromEntries(COUNTERS.map(k=>[k,count(payload.lines?.[code]?.[k])])),
  diagnostics:Object.fromEntries(DIAGNOSTICS.map(k=>[
   k,count(payload.lines?.[code]?.diagnostics?.[k])])),
  frameMatch:Object.fromEntries(FRAME_MATCH.map(k=>[
   k,count(payload.lines?.[code]?.frameMatch?.[k])]))
 }]));
 const sites=Object.fromEntries(['lerkendal-1','lerkendal-11','tonstadkrysset-1']
  .map(key=>[key,{
   frames:count(payload.spots?.[key]?.frames),
   nearGps:count(payload.spots?.[key]?.nearGps),
   overlappingQuays:count(payload.spots?.[key]?.overlappingQuays)
  }]));
 return {day:typeof payload.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(payload.day)?
   payload.day:null,lines,sites,
   memory:Object.fromEntries(MEMORY.map(k=>[k,count(payload.memory?.[k])])),
   v25:{frames:count(payload.v25?.frames),
    states:Object.fromEntries(V25_STATES.map(k=>[k,count(payload.v25?.states?.[k])])),
    restoredTracks:count(payload.v25?.restoredTracks),
    tracksWritten:count(payload.v25?.tracksWritten),
    cadence:payload.v25?.cadence?{
     ...Object.fromEntries(CADENCE_FIELDS.map(k=>[
      k,count(payload.v25.cadence[k])])),
     lanes:Object.fromEntries(CADENCE_LANES.map(k=>[k,
      Object.fromEntries(CADENCE_LANE_FIELDS.map(f=>[
       f,count(payload.v25.cadence.lanes?.[k]?.[f])]))]))
    }:null,
    lines:Object.fromEntries(['1','11'].map(line=>[line,
     Object.fromEntries(V25_FIELDS.map(k=>[k,count(payload.v25?.lines?.[line]?.[k])]))]))
   }};
}

const fresh=stamp=>Number.isFinite(Date.parse(stamp||''))&&
 Date.now()-Date.parse(stamp)>=0&&Date.now()-Date.parse(stamp)<=25*60000;
export function inspect(payload,{now=Date.now()}={}){
 if(payload?.scope!=='trondheim-gps-v22-scheduled-quality'||!payload.lanes)
  return {status:'OLD_WORKER_OR_UNKNOWN_RESPONSE'};
 const full=payload.lanes.catalog?.samples||0;
 const legacyFast=payload.lanes['line1-fast']?.samples||0;
 const dualFast=payload.lanes['dual-fast']?.samples||0;
 const fast=legacyFast+dualFast;
 if(!full&&!fast)return {status:'NO_SAMPLES',full,fast,legacyFast,dualFast};
 if(!Number.isFinite(Date.parse(payload.last||''))||
   now-Date.parse(payload.last)>25*60000||
   now-Date.parse(payload.last)<-60000)
  return {status:'STALE',full,fast,legacyFast,dualFast,last:payload.last||null};
 return {status:'ACTIVE',full,fast,legacyFast,dualFast,last:payload.last,
  line1Frames:payload.lines?.['1']?.frames||0,
  line11Frames:payload.lines?.['11']?.frames||0};
}
export async function probe({fetchImpl=fetch,now=Date.now()}={}){
 const controller=new AbortController();
 let result={status:'NETWORK_UNAVAILABLE'};
 const timeout=setTimeout(()=>controller.abort(),8000);
 try{
  const res=await fetchImpl(API,{cache:'no-store',signal:controller.signal});
  if(!res.ok)result={status:res.status===404?
   'OLD_WORKER_OR_NOT_DEPLOYED':'HTTP_ERROR',httpStatus:res.status};
  else{
   const payload=await res.json();
   result={...inspect(payload,{now}),daily:summarizeV22Daily(payload)};
  }
 }catch{result={status:'NETWORK_UNAVAILABLE'};}
 finally{clearTimeout(timeout);}
 return result;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const proof=await probe();
 const json=JSON.stringify(proof);
 console.log('GPS_V22_PRODUCTION_PROOF',json);
 if(proof.daily)console.log('GPS_V22_DAILY_AUDIT',JSON.stringify(proof.daily));
 if(proof.daily?.v25)console.log('GPS_V25_PRODUCTION_PROOF',JSON.stringify(proof.daily.v25));
 if(process.env.GITHUB_STEP_SUMMARY){
  const {appendFile}=await import('node:fs/promises');
  await appendFile(process.env.GITHUB_STEP_SUMMARY,
   '\n### Trondheim GPS V2.2 production proof\n\n'+
   '| Status | Full katalog-prøver | Linje 1 ekstra prøver | Linje 1 frames | Linje 11 frames | Siste prøve |\n'+
   '|---|---:|---:|---:|---:|---|\n'+
   '| '+proof.status+' | '+(proof.full??'—')+' | '+(proof.fast??'—')+
   ' | '+(proof.line1Frames??'—')+' | '+(proof.line11Frames??'—')+
   ' | '+(proof.last??'—')+' |\n\n'+
   'Ingen GPS- eller kjøretøy-ID-er er hentet. Nye V2.5-pseudonymer blir ikke lest av denne kontrollen.\n'+
   (proof.daily?.v25?.frames?('\n### GPS V2.5 — 3-minutters gjenoppretting mellom DO-kaldstarter\n\n'+
    '| Måleframes | Nytt korttidsminne | Gjenopprettet | Utløpt | Katalogendret | Nøkkelrotasjon | Gjenopprettede spor |\n'+
    '|---:|---:|---:|---:|---:|---:|---:|\n'+
    [proof.daily.v25.frames,...V25_STATES.map(k=>proof.daily.v25.states[k]??'—'),
     proof.daily.v25.restoredTracks].join(' | ')+'\n\n'+
    '| Linje | Frames | Primær-GPS | Samme pseudonym gjenkjent | V2.1 vurdert | Støttet | Beholdt flere Quays | Innsnevret | Avklart |\n'+
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|\n'+
    ['1','11'].map(line=>{const m=proof.daily.v25.lines[line];return '| '+line+' | '+
     V25_BASE_FIELDS.map(k=>m[k]??'—').join(' | ')+' |';}).join('\n')+
    '\n\nDette er kun kildemønster-hypoteser; ikke bekreftede fysiske busspasseringer.\n'+
    '\n### V2.6 – gjenopprettede spor med kandidatbevis (bare ny dekning)\n\n'+
    '| Linje | V2.6 frames | Tidligere kandidater | Tidligere tvetydig | Endret Quay-kandidatsett | Innsnevret | Retningskandidat | Trepunkt-kandidat |\n'+
    '|---|---:|---:|---:|---:|---:|---:|---:|\n'+
    ['1','11'].map(line=>{const m=proof.daily.v25.lines[line];return '| '+line+' | '+
     ['followupFrames','restoredWithCandidates','restoredAmbiguous','restoredChanged',
      'restoredNarrowed','restoredDirection','restoredABC'].map(k=>m[k]??'—').join(' | ')+' |';}).join('\n')+
    '\n\nTrepunkt-kandidat er aldri attestert faktisk holdeplasspassering.\n'+
    (proof.daily.v25.cadence?('\n### V2.7 – målekjede og 3-minutters minne\n\n'+
     '| Observasjoner | Katalog nye | Katalog gjenopprettet | Fast nye | Fast gjenopprettet | Par innen tidsluke | Ny start etter fast | Fortsettelse etter fast | ≥3 sammenhengende frames | Lengste kjede |\n'+
     '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n'+
     [proof.daily.v25.cadence.frames,
      proof.daily.v25.cadence.lanes.catalog.fresh,
      proof.daily.v25.cadence.lanes.catalog.restored,
      proof.daily.v25.cadence.lanes['dual-fast'].fresh,
      proof.daily.v25.cadence.lanes['dual-fast'].restored,
      proof.daily.v25.cadence.sameSlotFreshRestored,
      proof.daily.v25.cadence.nextSlotFreshAfterRestored,
      proof.daily.v25.cadence.nextSlotRestoredAfterRestored,
      proof.daily.v25.cadence.threePlusFrameContinuations,
      proof.daily.v25.cadence.maxContinuousFrames].map(x=>x??'—').join(' | ')+' |\n\n'+
     'Dette gjelder testminnets rammer, ikke tre observerte holdeplasser.\n'):''))
    :'')+
   (proof.daily?'\n### GPS V2.4 memory lifecycle (only new V2.4-sample frames)\n\n'+
    '| V2.4 frames | Fresh volatile state | Catalog reset | Continued | Prior ≤3m | Prior >3m | Prior unknown |\n'+
    '|---:|---:|---:|---:|---:|---:|---:|\n'+
    MEMORY.map(k=>proof.daily.memory[k]??'—').join(' | ')+'\n\n'+
    '| Line | V2.4 frames | Previous frame known | Previous primary | Current primary | Same ID as previous | New to previous | Missing vs previous | Cannot compare |\n'+
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|\n'+
    ['1','11'].map(line=>{const m=proof.daily.lines[line].frameMatch;return '| '+line+' | '+
     FRAME_MATCH.map(k=>m[k]??'—').join(' | ')+' |';}).join('\n')+
    '\n\n**Missing from consecutive frame ≠ changed vehicle identity. Cold-start ≠ verified Cloudflare eviction.**\n':'')+
   (proof.daily?'\n### GPS V2.3 kilde-/tidsbrudd per linje (bare målt V2.3-dekning)\n\n'+
    '| Linje | Måleframes med V2.3 | Først sett | Samme GPS-buss innen 3 min | Samme GPS-buss etter 3 min | 0 Quays | 1 Quay | Flere Quays |\n'+
    '|---|---:|---:|---:|---:|---:|---:|---:|\n'+
    ['1','11'].map(line=>{const d=proof.daily.lines[line].diagnostics;return '| '+line+' | '+
     ['frames','firstSeen','sameVehicleWithin3m','sameVehicleAfter3m',
      'outsideQuayRadius','oneNearbyQuay','multipleNearbyQuays']
      .map(k=>d[k]??'—').join(' | ')+' |';}).join('\n')+'\n':'')+
   '\n**GPS-kandidat er ikke bekreftet Quay eller holdeplass.**\n'+
   (proof.daily?'\n### Sammenligning per linje – summer av observasjoner, ikke unike busser\n\n'+
    '| Linje | Frames | Primær-GPS | V2.0 vurdert | V2.0 støttet | V2.0 uavklart | V2.1 vurdert | V2.1 støttet | V2.1 uavklart | Beholdt flere Quays | Innsnevret | Entydig etter ny observasjon |\n'+
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n'+
    ['1','11'].map(line=>{const s=proof.daily.lines[line];return '| '+line+' | '+
    ['frames','gpsPrimary','v20Compared','v20Supported','v20Unresolved','v21Compared','v21Supported','v21Unresolved','retained','narrowed','resolved']
      .map(k=>s[k]??'—').join(' | ')+' |';}).join('\n')+
    '\n\n### Geografisk nærhet (ikke faktisk stopp)\n\n'+
    '| Sted | Frames med dekning | GPS innen 85m | Konkurrerende Quays |\n'+
    '|---|---:|---:|---:|\n'+
    [['lerkendal-1','Lerkendal linje 1'],['lerkendal-11','Lerkendal linje 11'],
     ['tonstadkrysset-1','Tonstadkrysset linje 1']].map(([key,name])=>{
     const s=proof.daily.sites[key];return '| '+name+' | '+s.frames+' | '+s.nearGps+' | '+s.overlappingQuays+' |';
    }).join('\n')+'\n\n**Viktig:** V2.1-kandidatstøtte er ikke GPS-fasit. Fem minutter mellom linje 11-prøver er for glissent for bekreftet A→B→C-sporing.\n':'')
  );
 }
}
