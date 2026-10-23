// One-shot public Entur vehicle-position probe for FB73 source discovery.
// This does not modify PixelFrame, and never logs bus IDs or coordinates.
// UNI is Værnesekspressen's existing profile code; NBU is an independent
// Flybuss operator and MUST NOT be treated as FB73 without matched line IDs.
const endpoint='https://api.entur.io/realtime/v2/vehicles/graphql';
const query=codespace=>'{vehicles(codespaceId:"'+codespace+'"){lastUpdated line{publicCode} location{latitude longitude}}}';
const lookbackMs=90*1000,now=Date.now();
for(const codespace of ['UNI','NBU']){
  const signal=AbortSignal.timeout(12000);
  try{
    const response=await fetch(endpoint,{
      method:'POST',signal,headers:{'Content-Type':'application/json','ET-Client-Name':'transitcore-fb73-gps-probe'},
      body:JSON.stringify({query:query(codespace)})
    });
    if(!response.ok){console.log(codespace+': HTTP '+response.status+' (source not verified)');continue;}
    const data=await response.json();
    if(data.errors?.length){console.log(codespace+': GraphQL error (source not verified)');continue;}
    if(!Array.isArray(data.data?.vehicles)){console.log(codespace+': response missing vehicles array');continue;}
    const vehicles=data.data.vehicles;
    const fb73=vehicles.filter(v=>String(v.line?.publicCode||'').toUpperCase()==='FB73');
    const withGps=fb73.filter(v=>Number.isFinite(v.location?.latitude)&&Number.isFinite(v.location?.longitude));
    const recent=withGps.filter(v=>{const time=Date.parse(v.lastUpdated||'');return Number.isFinite(time)&&time<=now&&now-time<=lookbackMs;});
    console.log(codespace+': total_positions='+vehicles.length+', line_FB73='+fb73.length+', FB73_coordinates='+withGps.length+', fresh_FB73_coordinates='+recent.length+
      (codespace==='NBU'?' (not identified as Værnesekspressen)':''));
  }catch(e){console.log(codespace+': probe unavailable ('+(e?.name||'fetch error')+'); no source conclusion');}
}

// Independent SIRI-VM endpoint. It is not the same backend as the GraphQL
// vehicle positions API. A dataset-restricted sample is not a permanent
// negative finding; XML contains no per-vehicle sensitive data in logs.
for(const codespace of ['UNI','NBU']){
  try{
    const url='https://api.entur.io/realtime/v1/rest/vm?datasetId='+codespace+'&maxSize=30';
    const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'ET-Client-Name':'transitcore-fb73-gps-probe','Accept':'application/xml'}});
    if(!response.ok){console.log('SIRI-VM '+codespace+': HTTP '+response.status+' (not verified)');continue;}
    const body=await response.text();
    const activityCount=(body.match(/<(?:[a-zA-Z0-9_.-]+:)?VehicleActivity(?:\\s|>)/g)||[]).length;
    const fb73Mention=/(?:UNI:Line:FB73|<[^>]*LineRef[^>]*>\\s*(?:UNI:Line:)?FB73\\s*<)/i.test(body);
    console.log('SIRI-VM '+codespace+': vehicle_activities='+activityCount+', mentions_FB73='+fb73Mention+' (single limited sample)');
  }catch(e){console.log('SIRI-VM '+codespace+': request failed ('+(e?.name||'error')+'); source not verified');}
}

// Output is a one-time sample, not proof that positions are always present.
