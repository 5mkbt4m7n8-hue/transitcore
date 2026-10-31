// Pulls actual, not guessed, JourneyPattern / Quay metadata in GitHub CI.
// Diagnostic-only: never updates production data from this probe.
const endpoint='https://api.entur.io/transit-data/v1beta/graphql';
const query=`query Probe($id: String!) {
  line(id:$id) {
    id
    journeyPatterns {
      id
      name
      directionType
      quays { id }
    }
  }
}`;
for(const lineCode of ['2','3']){
 const id='ATB:Line:2_'+lineCode;
 try{
  const response=await fetch(endpoint,{method:'POST',
   headers:{'content-type':'application/json','ET-Client-Name':'intransit-pattern-audit'},
   body:JSON.stringify({query,variables:{id}}),
   signal:AbortSignal.timeout(12000)});
  const raw=await response.text();
  let json;try{json=JSON.parse(raw);}catch{throw Error('non-json HTTP '+response.status);}
  const line=json.data?.line,pat=line?.journeyPatterns;
  console.log('ENTUR_PATTERN_PROBE '+JSON.stringify({
   code:lineCode,http:response.status,errors:json.errors?.map(e=>e.message).slice(0,5),
   id:line?.id,shape:Array.isArray(pat)?'array':typeof pat,
   count:Array.isArray(pat)?pat.length:pat?.nodes?.length,
   example:Array.isArray(pat)?pat[0]:pat?.nodes?.[0]
  }).slice(0,3400));
 }catch(e){console.log('ENTUR_PATTERN_PROBE '+JSON.stringify({code:lineCode,error:String(e.message).slice(0,200)}));}
}
