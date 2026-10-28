// Optional authenticated cloud sync; local autosave always remains the fallback.
// Only this editing session holds the key (never in localStorage / sessionStorage).
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 root.InTransitCloudDraft=api;
})(globalThis,function(){
 "use strict";
 const ENDPOINT="https://transitcore-led-feed.lgb84.workers.dev/v1/admin/linear-draft";
 const PUBLISH_ENDPOINT="https://transitcore-led-feed.lgb84.workers.dev/v1/admin/linear-publish";
 function create({baseFingerprint,getLocal,applyRemote,hasLocal,status,endpoint=ENDPOINT,fetcher=fetch}){
  let token="",mode="disconnected",revision=0,saved=null,dirty=false,busy=false,timer=null,retryDelay=5000;
  const report=(message,kind="info")=>status({mode,message,kind,revision,dirty,busy});
  const buttons=()=>{
   return {mode,revision,dirty,busy};
  };
  function cancelTimer(){if(timer!==null){clearTimeout(timer);timer=null;}}
  function disconnect(){
   cancelTimer();token="";mode="disconnected";dirty=false;saved=null;
   report("Kun lokal lagring. Koble til skyen for permanent lagring på tvers av enheter.");
  }
  const request=async(method,body)=>{
   const response=await fetcher(endpoint,{method,cache:"no-store",headers:{
    "authorization":"Bearer "+token,...(body?{"content-type":"application/json"}:{})
   },...(body?{body:JSON.stringify(body)}:{})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){const error=Error(result.error||"HTTP "+response.status);error.status=response.status;error.data=result;throw error;}
   return result;
  };
  const current=()=>({version:1,baseFingerprint,...getLocal()});
  const differs=remote=>{
   const local=current();
   return JSON.stringify(local.layout)!==JSON.stringify(remote.layout)||
    JSON.stringify(local.names)!==JSON.stringify(remote.names);
  };
  async function connect(key){
   const candidate=String(key||"").trim();
   if(!candidate){report("Skriv inn administratornøkkelen.","warn");return false;}
   cancelTimer();token=candidate;mode="connecting";dirty=false;report("Kobler til skylagring …");
   try{
    const result=await request("GET");
    if(mode!=="connecting")return false;
    revision=result.revision||0;saved=result.snapshot||null;
    if(saved&&saved.baseFingerprint!==baseFingerprint){
     mode="mismatch";report("Skyutgaven er laget fra en annen kartversjon. Eksporter lokal JSON før videre redigering.","warn");
     return false;
    }
    if(saved&&hasLocal()&&differs(saved)){
     mode="conflict";report("Skyen og denne enheten har forskjellige endringer. Velg hvilken versjon som skal beholdes.","warn");return true;
    }
    if(saved){applyRemote(saved);}
    mode="ready";report(saved?"Skyutgaven er hentet. Alle nye endringer lagres automatisk.":"Skylagring aktiv. Nye endringer lagres automatisk.","success");
    if(!saved&&hasLocal())changed();
    return true;
   }catch(error){
    mode="disconnected";token="";report("Skylagring ikke aktiv: "+error.message+". Lokal arbeidskopi er beholdt.","warn");return false;
   }
  }
  function changed(){
   if(mode!=="ready")return;
   dirty=true;report("Endringer venter på skylagring …");schedule(650);
  }
  function schedule(delay){
   if(mode!=="ready")return;
   cancelTimer();timer=setTimeout(()=>{timer=null;void flush();},delay);
  }
  async function flush(){
   if(mode!=="ready"||!token||busy||!dirty)return;
   cancelTimer();busy=true;dirty=false;
   const snapshot=current();
   report("Lagrer i skyen …");
   try{
    const result=await request("PUT",{...snapshot,expectedRevision:revision});
    if(mode!=="ready")return;
    revision=result.revision;saved={...snapshot,revision,savedAt:result.savedAt};retryDelay=5000;
    report("Lagret permanent i skyen · "+new Date(result.savedAt).toLocaleTimeString("nb-NO"),"success");
   }catch(error){
    if(mode!=="ready")return;
    dirty=true;
    if(error.status===409){mode="conflict";saved=null;revision=error.data?.revision??revision;
     report("Noen andre har endret skyutgaven. Velg Hent fra skyen eller Bruk lokal versjon. Ingen endringer er overskrevet.","warn");
    }else if(error.status===401||error.status===403){
     mode="disconnected";token="";report("Skylagring stoppet: ugyldig tilgang. Endringene finnes fortsatt lokalt.","warn");
    }else{
     report("Skyen svarte ikke ("+error.message+"). Lagret lokalt; prøver automatisk igjen.","warn");
     schedule(retryDelay);retryDelay=Math.min(retryDelay*2,30000);
    }
   }finally{
    busy=false;
    if(mode==="ready"&&dirty&&timer===null)schedule(250);
    // Re-announce the acknowledgement after unlocking the editor, so the
    // publish button becomes available only for a completed cloud write.
    if(mode==="ready"&&!dirty&&saved?.savedAt)
     report("Lagret permanent i skyen · "+new Date(saved.savedAt).toLocaleTimeString("nb-NO"),"success");
   }
  }
  async function chooseRemote(){
   if(mode!=="conflict")return false;
   try{
    const result=await request("GET"),remote=result.snapshot;
    if(!remote||remote.baseFingerprint!==baseFingerprint)throw Error("Kan ikke bruke en annen kartversjon");
    applyRemote(remote);revision=result.revision;mode="ready";dirty=false;saved=remote;
    report("Skyutgaven er hentet og lokal arbeidskopi oppdatert.","success");return true;
   }catch(error){report("Kunne ikke hente skyutgaven: "+error.message,"warn");return false;}
  }
  async function chooseLocal(){
   if(mode!=="conflict")return false;
   try{
    const result=await request("GET");
    if(result.snapshot&&result.snapshot.baseFingerprint!==baseFingerprint)throw Error("Kartversjonene er ulike");
    revision=result.revision;mode="ready";saved=result.snapshot||null;
    report("Du valgte denne enhetens versjon. Lagrer den i skyen …");changed();
    return true;
   }catch(error){report("Kunne ikke synkronisere: "+error.message,"warn");return false;}
  }
  async function publishDraft(){
   if(mode!=="ready"||!token)throw Error("Koble til skylagringen først.");
   if(busy||dirty)throw Error("Vent på bekreftelsen «Lagret permanent i skyen» før publisering.");
   if(revision<1)throw Error("Ingen skyversjon er lagret ennå.");
   const response=await fetcher(PUBLISH_ENDPOINT,{
    method:"POST",cache:"no-store",
    headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
    body:JSON.stringify({expectedRevision:revision})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.message||result.error||"HTTP "+response.status);
   return result;
  }
  function beforeLeaving(){if(mode==="ready"&&dirty)void flush();}
  return {connect,disconnect,changed,flush,chooseRemote,chooseLocal,beforeLeaving,publishDraft,buttons};
 }
 return {create};
});
