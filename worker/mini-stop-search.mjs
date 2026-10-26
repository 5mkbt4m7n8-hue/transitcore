// Public stop-only autocomplete via Entur Geocoder v3 (v1/v2 deprecated).
// Keep API on the Worker so the browser needs no provider headers/CORS.
export const GEOCODER_URL='https://api.entur.io/geocoder/v3/autocomplete';
export const validStopId=value=>typeof value==='string'&&/^NSR:StopPlace:[1-9]\d{0,8}$/.test(value);
export function validQuery(value){
 return typeof value==='string'&&value.trim().length>=2&&value.trim().length<=80&&
  !/[<>\x00-\x1f]/.test(value);
}
export function normalizeStops(payload){
 if(payload?.type!=='FeatureCollection'||!Array.isArray(payload.features)||
   payload.features.length>100)throw Error('invalid_geocoder_response');
 const ids=new Set(),results=[];
 for(const result of payload.features){
  const p=result?.properties;
  if(p?.layer!=='stopPlace'||!validStopId(p?.id)||ids.has(p.id))continue;
  const name=p.names?.default,display=p.names?.display;
  if(typeof name!=='string'||!name.trim()||name.length>150)continue;
  ids.add(p.id);
  results.push({id:p.id,name:name.trim(),label:typeof display==='string'&&display.length<=200&&
   display.trim()?display.trim():name.trim()});
  if(results.length>=12)break;
 }
 return results;
}
export async function searchMiniStops(query,{fetcher=fetch,
 clientName='transitcore-mini-stops'}={}){
 if(!validQuery(query))throw Error('invalid_query');
 const url=new URL(GEOCODER_URL);
 url.searchParams.set('q',query.trim());
 url.searchParams.set('lang','no');
 url.searchParams.set('limit','12');
 url.searchParams.set('layers','stopPlace');
 url.searchParams.set('sources','nsr');
 url.searchParams.set('multimodal','all');
 let reply;
 try{
  reply=await fetcher(url.toString(),{
   method:'GET',headers:{'ET-Client-Name':clientName},
   signal:AbortSignal.timeout(9000)
  });
 }catch{throw Error('geocoder_unavailable');}
 if(!reply.ok)throw Error('geocoder_http_'+reply.status);
 let payload;
 try{payload=await reply.json();}catch{throw Error('invalid_geocoder_json');}
 return {schemaVersion:1,source:'Entur Geocoder v3',query:query.trim(),
  stops:normalizeStops(payload)};
}
