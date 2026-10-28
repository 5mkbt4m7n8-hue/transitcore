// Browser-only playback UI; real recording continues on the scheduled Worker.
(function(root){
 "use strict";
 const API="https://transitcore-led-feed.lgb84.workers.dev";
 function create(host,{onFrame,onLive,loadReplayBoard}){
  host.innerHTML='<details class="map-day-history" data-role="dayHistory"><summary>Historikk · dagsopptak og demo</summary><div class="map-day-history-body"><p>Serveren tar et øyeblikksbilde hvert femte minutt. Avspilling er aldri LIVE, og hull i opptaket skjules ikke.</p><div class="map-history-controls"><label>Dato <select data-h="day" aria-label="Historikkdato"></select></label><button type="button" data-h="load">Hent døgn</button><label>Hastighet <select data-h="speed" aria-label="Avspillingshastighet"><option value="2000">0,5×</option><option value="1000" selected>1×</option><option value="500">2×</option><option value="200">5×</option></select></label></div><div class="map-history-controls"><button type="button" data-h="play" disabled>Spill av</button><button type="button" data-h="live" disabled>Tilbake til LIVE</button><button type="button" data-h="export" disabled>Last ned opptak (JSON)</button></div><label class="map-history-timeline">Tidslinje <input type="range" min="0" max="0" step="1" value="0" disabled data-h="timeline" aria-label="Historisk frame"></label><p class="map-history-time" data-h="time">Ingen opptak lastet.</p><p data-h="status" role="status">Åpne historikk for å finne opptak.</p><div class="map-history-pin"><strong>Bevar ett døgn som demo</strong><small>Velg et avsluttet døgn. Arkivet lagrer ett valgt døgn med dets femminuttersmålinger og eventuelle hull. Et nytt valg erstatter den tidligere demoen.</small><label>Administratornøkkel <input data-h="key" type="password" autocomplete="off" placeholder="Kun ved arkivering" aria-label="Administratornøkkel for demo"></label><button type="button" data-h="pin">Bevar valgt døgn som demo</button></div></div></details>';
  const q=name=>host.querySelector('[data-h="'+name+'"]');
  const panel=host.querySelector('[data-role=dayHistory]');
  let index=null,records=[],day="",timer=null,current=-1,loading=false;
  const message=value=>{q("status").textContent=value};
  const clock=stamp=>new Intl.DateTimeFormat("no-NO",{
   timeZone:"Europe/Oslo",hour:"2-digit",minute:"2-digit",second:"2-digit"
  }).format(new Date(stamp));
  const pause=()=>{if(timer!==null)clearInterval(timer);timer=null;q("play").textContent="Spill av"};
  async function json(path,options){
   const response=await fetch(API+path,{cache:"no-store",...options});
   const value=await response.json().catch(()=>({error:"invalid_response"}));
   if(!response.ok)throw Error(value.error||"HTTP "+response.status);
   return value;
  }
  function chooseDays(){
   const selected=q("day").value,days=index?.days||[];
   q("day").replaceChildren(new Option("Velg døgn …",""),
    ...days.map(item=>new Option(item.day+(item.savedAsDemo?" · arkivert demo":"")+
      " · "+item.count+" målinger, "+item.errors+" feil",item.day)));
   q("day").value=days.some(item=>item.day===selected)?selected:index?.archive?.day||days[0]?.day||"";
  }
  async function refresh(){
   index=await json("/v1/trondheim/history");chooseDays();
   message(index.days.length?"Tilgjengelige datoer: "+index.days.length+" · 5 minutters opptaksintervall.":
    "Ingen serveropptak ennå. Oppsamling begynner først når produksjons-Worker med cron er aktiv.");
  }
  function show(i){
   if(i<0||i>=records.length)return;
   current=i;const sample=records[i];q("timeline").value=String(i);
   q("time").textContent=(index?.archive?.day===day?"DEMO":"HISTORIKK")+
    " · "+day+" · "+clock(sample.capturedAt)+" · "+(i+1)+"/"+records.length+
    " · "+(sample.status==="OK"?"Opptak · "+sample.frame.leds.length+" LED-oppføringer":
      "MÅLEFEIL · "+(sample.error||"ukjent"));
   onFrame(sample);
  }
  async function load(){
   if(loading)return;
   pause();loading=true;q("load").disabled=true;
   try{
    const next=q("day").value;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(next))throw Error("Velg en dato");
    const board=await loadReplayBoard();
    if(!board?.board||!board.hardware)throw Error("Historikkprofil kunne ikke lastes");
    const data=[];let cursor=null,loops=0;
    do{
     if(++loops>20)throw Error("For mange historikksider");
     const args=new URLSearchParams({day:next,limit:"40"});if(cursor)args.set("cursor",cursor);
     const page=await json("/v1/trondheim/history?"+args);
     if(page.day!==next||!Array.isArray(page.records))throw Error("Ugyldige historikkdata");
     data.push(...page.records);cursor=page.nextCursor||null;
    }while(cursor);
    if(!data.length)throw Error("Ingen lagrede målinger på denne datoen");
    for(let i=0;i<data.length;i++){
     const v=data[i];
     if(v.day!==next||!Number.isFinite(Date.parse(v.capturedAt))||
       !["OK","ERROR"].includes(v.status)||
       v.status==="OK"&&v.frame?.boardProfile!=="trondheim-shared-stops-board"||
       i>0&&v.slot<=data[i-1].slot)throw Error("Ugyldig opptak eller rekkefølge");
    }
    records=data;day=next;current=-1;
    q("timeline").disabled=false;q("timeline").max=String(data.length-1);
    q("play").disabled=false;q("live").disabled=false;q("export").disabled=false;
    const gaps=data.reduce((n,item,i)=>n+(item.status==="ERROR"?1:0)+
     (i>0&&item.slot-data[i-1].slot>450000?1:0),0);
    message(data.length+" tidspunkter lastet. "+gaps+" registrerte feil eller tidsluker. Ingen interpolering.");
    show(0);
   }catch(error){message("Historikk: "+error.message)}
   finally{loading=false;q("load").disabled=false}
  }
  function play(){
   if(!records.length)return;
   if(timer!==null){pause();return}
   if(current===records.length-1)show(0);
   q("play").textContent="Pause";
   timer=setInterval(()=>{
    if(current+1>=records.length){pause();return}
    show(current+1);
   },Number(q("speed").value)||1000);
  }
  function leave(){
   pause();current=-1;q("time").textContent="LIVE – avspilling avsluttet";
   onLive();q("live").disabled=true;
  }
  async function pin(){
   const selected=q("day").value,admin=q("key").value;q("key").value="";
   try{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(selected))throw Error("Velg en dato");
    if(!admin)throw Error("Administratornøkkel kreves");
    const result=await json("/v1/admin/trondheim/history/demo",{
     method:"POST",headers:{"authorization":"Bearer "+admin,"content-type":"application/json"},
     body:JSON.stringify({day:selected})
    });
    await refresh();q("day").value=selected;
    message("Arkivert som demo: "+result.demo.day+" · "+result.demo.count+" målinger.");
   }catch(error){message("Demo: "+error.message)}
  }
  function exportDay(){
   if(!records.length)return;
   const data={schemaVersion:1,kind:"intransit-trondheim-day-demo",
    boardProfile:"trondheim-shared-stops-board",day,cadenceMinutes:5,
    exportedAt:new Date().toISOString(),records};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:"application/json"}));
   const a=document.createElement("a");a.href=url;a.download="trondheim-historikk-"+day+".json";
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  panel.addEventListener("toggle",()=>{
   if(panel.open&&!index)void refresh().catch(error=>message("Historikk utilgjengelig: "+error.message));
  });
  q("load").onclick=()=>void load();q("play").onclick=play;q("live").onclick=leave;
  q("timeline").oninput=()=>{pause();show(Number(q("timeline").value))};
  q("speed").onchange=()=>{if(timer!==null){pause();play()}};
  q("pin").onclick=()=>void pin();q("export").onclick=exportDay;
  return {open(){panel.open=true},clear(){pause()}};
 }
 root.InTransitDayHistory={create};
})(globalThis);
