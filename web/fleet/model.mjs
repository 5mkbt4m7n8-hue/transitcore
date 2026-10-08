export const UNKNOWN="Ikke rapportert";
export const STATUSES=["ONLINE","DEGRADED","OFFLINE","ERROR","DISABLED"];
export const value=(v,suffix="")=>v===null||v===undefined||v===""?UNKNOWN:String(v)+suffix;
export const yesNo=v=>typeof v==="boolean"?(v?"Ja":"Nei"):UNKNOWN;
export const escape=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function date(v){const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toLocaleString("nb-NO"):UNKNOWN;}
export const status=v=>STATUSES.includes(v)?v:"UKJENT";
export const activeErrors=d=>Array.isArray(d.health?.errors)?d.health.errors.filter(e=>e.active===true).length:null;
export function filterDevices(devices,{search="",status:state="",board="",firmware=""}={}){
 const q=search.trim().toLocaleLowerCase();
 return devices.filter(d=>(!q||[d.deviceId,d.label].some(v=>String(v||"").toLocaleLowerCase().includes(q)))&&
 (!state||status(d.status)===state)&&(!board||d.boardProfile===board)&&(!firmware||d.firmwareVersion===firmware));
}
export function summary(devices){
 const counts=Object.fromEntries(STATUSES.map(s=>[s,0])),boards={},firmware={};
 for(const d of devices){const s=status(d.status);counts[s]=(counts[s]||0)+1;
 for(const [target,key] of [[boards,d.boardProfile],[firmware,d.firmwareVersion]]){const label=value(key);target[label]=(target[label]||0)+1;}}
 return {total:devices.length,counts,boards,firmware};
}
const badge=s=>'<span class="badge '+status(s)+'">'+status(s)+'</span>';
export function duration(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return UNKNOWN;
 const minutes=Math.floor(seconds/60);
 return `${Math.floor(minutes/1440)}d ${Math.floor(minutes/60)%24}h ${minutes%60}m`;
}
const soakBadge=d=>'<span class="badge">SOAK: '+escape(d.soak?.status||"NOT STARTED")+'</span>';
const rebootLabel=d=>!d.soak?.current?"Ingen aktuell testperiode":d.soak?.bootChangedSincePrevious?"NY BOOT / RESET":d.soak?.lastRestartAt?"Siste reset: "+date(d.soak.lastRestartAt):"Ingen observert reset";
const soakSummary=d=>soakBadge(d)+'<small>'+escape('Oppetid: '+duration(d.health?.uptimeSeconds))+'</small><small>'+escape(rebootLabel(d))+'</small><small>'+escape('Min heap: '+value(d.soak?.current?.minObservedHeap,' B')+(d.soak?.current?.heapDropCount?' (synkende minimum)':'')+' · Feed-feil: '+value(d.health?.failedPolls))+'</small><small>'+escape('Wi-Fi-brudd: '+value(d.health?.wifiOutages))+'</small>';
export function listRows(devices){
 return devices.map(d=>'<tr><td><button class="device" data-device="'+escape(d.deviceId)+'">'+escape(value(d.label||d.deviceId))+'</button><small>'+escape(d.deviceId)+'</small>'+soakSummary(d)+'</td>'+
 [value(d.boardProfile),value(d.hardwareProfile),badge(d.status),value(d.firmwareVersion),date(d.lastSeen),
 value(d.health?.wifiRssi," dBm"),value(d.health?.lastFrameAgeSeconds," s"),value(activeErrors(d)),value(d.health?.lastOtaResult)]
 .map((v,i)=>'<td>'+(i===2?v:escape(v))+'</td>').join("")+'</tr>').join("");
}
export function details(d){
 const h=d.health||{};
 const fields=[
 ["Enhet",d.deviceId],["Navn",d.label],["Tavle",d.boardProfile],["Hardware",d.hardwareProfile],
 ["Status",status(d.status)],["Årsaker",(d.reasons||[]).join(", ")],["Opprettet",date(d.createdAt)],["Sist sett",date(d.lastSeen)],
 ["Firmware",d.firmwareVersion],["Ønsket firmware",d.desiredFirmwareVersion],["OTA aktivert",yesNo(d.otaEnabled)],
 ["Oppdatering tilgjengelig",yesNo(d.updateAvailable)],["Siste OTA-resultat",h.lastOtaResult],
 ["OTA-steg",h.otaStage],["Konfigurasjonskilde",h.configSource],["Konfigurasjonshenting",h.configFetchResult],
 ["Oppetid",duration(h.uptimeSeconds)],["RSSI",value(h.wifiRssi," dBm")],["Ledig heap",value(h.freeHeap," byte")],
 ["Laveste heap",value(h.minimumFreeHeap," byte")],["Oppstarter",h.bootCount],["Boot-ID",h.bootId],["Reset-årsak",h.resetReason],
 ["Frame-alder ved rapport",value(h.lastFrameAgeSeconds," s")],["Frame-sekvens",h.lastFrameSequence],
 ["Vellykkede hentinger",h.successfulPolls],["Mislykkede hentinger",h.failedPolls],["Wi-Fi-brudd",h.wifiOutages],
 ["Wi-Fi tilkoblet (ved rapport)",yesNo(h.wifiConnected)],["Wi-Fi tilbake",h.wifiRecoveries],
 ["Frame gyldig",yesNo(h.frameValid)],["Profilversjon",h.profileRevision],["Profilfingeravtrykk",h.profileFingerprint],
 ["Soak",d.soak?.status],["Soak-merknad",d.soak?.reason],["Observert sammenhengende test",duration(d.soak?.current?.observedSeconds)],
 ["Testperiode startet",date(d.soak?.current?.firstSeenAt)],["Reset siden forrige rapport",d.soak?yesNo(d.soak.bootChangedSincePrevious):UNKNOWN],
 ["Observerte restarter",d.soak?.restartCount],["Siste reset",date(d.soak?.lastRestartAt)],
 ["Laveste observerte heap",value(d.soak?.current?.minObservedHeap," B")],
 ["Heap-minimum synker",d.soak?.current?.heapDropCount?"OBS: "+d.soak.current.heapDropCount+" fall; sist "+date(d.soak.current.lastHeapDropAt):"Ingen observert nedgang"],
 ["Aktive feil",activeErrors(d)]];
 const runs=d.soak?.history||[];
 return '<dl class="metrics">'+fields.map(([k,v])=>'<div><dt>'+escape(k)+'</dt><dd>'+escape(value(v))+'</dd></div>').join("")+'</dl>'+
 '<h3>Serverlagret soak-historikk</h3><p>Opptil 20 tidligere perioder. PASS er observert drift, ikke full release-godkjenning. Målinger gjelder siste rapport.</p>'+
 (runs.length?'<div class="scroll"><table><thead><tr><th>Boot-ID</th><th>Start</th><th>Slutt</th><th>Varighet</th><th>Resultat / årsak</th><th>Milepæler</th></tr></thead><tbody>'+[...runs].reverse().map(r=>'<tr>'+[r.bootId,date(r.firstSeenAt),date(r.endedAt),duration(r.observedSeconds),r.outcome+' / '+r.endReason,Object.keys(r.milestones||{}).join(' / ')+' h'].map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<p>Ingen tidligere lagrede perioder.</p>');
}
export function errorRows(errors){
 return [...errors].sort((a,b)=>Number(b.active)-Number(a.active)||Date.parse(b.lastSeen)-Date.parse(a.lastSeen)).map(e=>
 '<tr class="'+(e.count>1?"repeated":"")+'">'+[e.active===true?"Aktiv":e.active===false?"Avsluttet":"Ukjent",e.code,e.severity,date(e.firstSeen),date(e.lastSeen),value(e.count)+(e.count>1?" · Gjentatt":""),e.message]
 .map(v=>'<td>'+escape(value(v))+'</td>').join("")+'</tr>').join("");
}
export function historyRows(history){
 return [...history].reverse().map(s=>'<tr>'+[date(s.receivedAt),status(s.status),value(s.health?.wifiRssi," dBm"),
 value(s.health?.lastFrameAgeSeconds," s"),value(s.health?.freeHeap," byte"),value(s.health?.failedPolls)]
 .map(v=>'<td>'+escape(v)+'</td>').join("")+'</tr>').join("");
}
