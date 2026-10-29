(function(root,factory){const api=factory(typeof module==='object'?require('./board-client-model.js'):root.TransitCoreBoardClient);if(typeof module==='object')module.exports=api;root.TransitCoreFrames=api;})(globalThis,function(Client){
 'use strict';
 const ORIGIN='https://transitcore-led-feed.lgb84.workers.dev';
 const localOrigin=()=>['127.0.0.1','localhost'].includes(globalThis.location?.hostname)?globalThis.location.origin:ORIGIN;
 let panel,identity,ledRows,evidenceText,refreshEvidence,activeClient,evidenceFrame;
 function panelFor(client,published){
  if(!globalThis.document?.body)return;
  if(!panel){
   panel=document.createElement('details');panel.id='canonical-frame-diagnostics';
   panel.style.cssText='margin:16px;padding:12px;border:1px solid #64748b;border-radius:8px;overflow:auto;font:13px system-ui;max-width:100%;box-sizing:border-box';
   const title=document.createElement('summary');title.textContent='PixelFrame / datagrunnlag – diagnostikk';panel.append(title);
   identity=document.createElement('p');panel.append(identity);
   refreshEvidence=document.createElement('button');refreshEvidence.textContent='Kontroller usikkerhet / datakilde';panel.append(refreshEvidence);
   evidenceText=document.createElement('pre');evidenceText.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';panel.append(evidenceText);
   ledRows=document.createElement('pre');ledRows.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto';panel.append(ledRows);
   refreshEvidence.onclick=async()=>{const current=activeClient;refreshEvidence.disabled=true;try{
    const result=await current.diagnostics();if(current!==activeClient)return;
    evidenceFrame={boardId:result.boardId,sequence:result.sequence,generatedAt:result.generatedAt};
    evidenceText.textContent=(result.matchesFrame?'SAMME FRAME':'IKKE BEKREFTET SAMME FRAME')+' · '+result.status+'\n'+(result.reason||'')+'\n'+
     (result.observations||[]).map(d=>'LED '+(d.logicalLed??'?')+' · '+(d.vehicleId??'?')+' · '+d.source+' · '+d.state+' · '+d.confidence+' · '+d.reason).join('\n')+
     (result.uncertain?'\nUSIKKERT: OFF er ikke bekreftelse på tom holdeplass.':'');
   }catch{evidenceText.textContent='Diagnostikk utilgjengelig; ingen fysisk tilstand bekreftet.';}finally{refreshEvidence.disabled=!activeClient?.published;}};
   document.body.append(panel);
  }
  activeClient=client;evidenceFrame=null;refreshEvidence.disabled=!published;
  evidenceText.textContent=published?'Hentes kun på forespørsel. Viser serverevidens, ikke målt hardware.':'UTKAST / SIMULERING: ikke publisert sanntidsdiagnostikk.';
 }
 function create({boardId,ledCount,visual={},published=true,origin=localOrigin(),fetchImpl=globalThis.fetch,clock=()=>Date.now(),monotonic=()=>Math.floor(performance.now())>>>0,timeoutMs=6000,retryDelays=[250,750],sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  if(!/^[a-z0-9-]{3,120}$/.test(boardId))throw Error('Invalid boardId');
  const model=Client.create({boardProfile:boardId,ledCount,visual,strictExpiry:true});
  let frame=null,algorithm='not reported',pending=null;
  let transport={kind:'idle',attempts:0,url:origin+'/api/v1/frame/'+boardId};
  const value=()=>{
   const sample=model.sample(clock(),monotonic());
   // Wire states/identities are never recomputed. Only expired frames become OFF.
   const expired=sample.status==='EXPIRED'||sample.status==='NO_FRAME';
   const result={boardId,algorithm,sample,transport:{...transport},frame:frame?{...structuredClone(frame),leds:expired?[]:structuredClone(frame.leds)}:null};
   if(activeClient===api){
    if(evidenceFrame&&(expired||evidenceFrame.boardId!==boardId||evidenceFrame.sequence!==frame?.sequence||evidenceFrame.generatedAt!==frame?.generatedAt)){
     evidenceText.textContent='Diagnostikk fra en tidligere frame. Hent på nytt for å sammenligne med gjeldende frame.';evidenceFrame=null;
    }
    identity.textContent=(published?'LIVE':'UTKAST')+' · '+boardId+' · '+algorithm+' · sekvens '+sample.sequence+' · '+(frame?.generatedAt||'ingen frame')+' · alder '+sample.ageSeconds+' s · '+sample.status+' · '+transport.kind+' · forsøk '+transport.attempts+' · '+transport.url;
    ledRows.textContent=(result.frame?.leds||[]).map(l=>'LED '+l.id+' · '+(l.vehicle?.id||'?')+' · '+(l.lifecycle||l.state)).join('\n')||'Alle LED-er OFF / ingen gyldig frame.';
   }
   return result;
  };
  const api={url:origin+'/api/v1/frame/'+boardId,published,snapshot:value,
   async diagnostics(){
    if(!published)return {status:'DRAFT',matchesFrame:false,observations:[]};
    const response=await fetchImpl(this.url+'/diagnostics',{cache:'no-store'});
    if(!response.ok)throw Error('Diagnostics HTTP '+response.status);
    const result=await response.json();
    return {...result,matchesFrame:result.boardId===boardId&&frame!=null&&result.sequence===frame.sequence&&result.generatedAt===frame.generatedAt&&result.status==='CURRENT'};
   },
   accept(input,reportedAlgorithm='not reported'){
    if(!model.accept(input,clock(),monotonic()))return false;
    frame=structuredClone(input);algorithm=reportedAlgorithm;return true;
   },
   failed(message){model.failed(message);},
   async refresh(){
    if(pending)return pending;
    pending=(async()=>{
     // Simple CORS GET: no credentials/custom headers, no opaque mode or source fallback.
     // Bound the entire request including JSON body hydration, not only headers.
     for(let attempt=0;attempt<=Math.min(2,retryDelays.length);attempt++){
      const controller=new AbortController();let timer,kind='network',retry=true;
      transport={kind:'fetching',attempts:attempt+1,url:this.url,startedAt:new Date(clock()).toISOString()};
      try{
       const payload=await Promise.race([
        (async()=>{
         const response=await fetchImpl(this.url,{cache:'no-store',mode:'cors',credentials:'omit',signal:controller.signal});
         if(!response.ok){kind='http';retry=[408,429].includes(response.status)||response.status>=500;throw Error('HTTP '+response.status);}
         kind='payload';retry=false;
         let input;
         try{input=await response.json();}catch(error){
          // A broken body stream is transport failure; invalid JSON is not.
          if(!controller.signal.aborted&&error instanceof TypeError){kind='network';retry=true;}
          throw error;
         }
         return {input,algorithm:response.headers.get('x-transitcore-stop-algorithm')||'not reported'};
        })(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{kind='timeout';retry=true;controller.abort();reject(Error('Request timeout'));},timeoutMs);})
       ]);
       if(!this.accept(payload.input,payload.algorithm)){
        transport={...transport,kind:'rejected-frame',generatedAt:payload.input?.generatedAt};break;
       }
       transport={...transport,kind:'ok',generatedAt:payload.input.generatedAt};break;
      }catch(error){
       const detail=kind==='network'?'Nettverk/CORS blokkert eller utilgjengelig (nettleseren oppgir ikke årsaken)':error.message;
       transport={...transport,kind,error:detail};model.failed(kind+': '+detail);
       if(!retry||attempt>=Math.min(2,retryDelays.length))break;
      }finally{clearTimeout(timer);}
      await sleep(retryDelays[attempt]);
     }
     return value();
    })();
    try{return await pending;}finally{pending=null;}
   }
  };
  panelFor(api,published);return api;
 }
 return {create};
});
