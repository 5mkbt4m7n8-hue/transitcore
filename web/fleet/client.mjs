const ORIGIN="https://transitcore-led-feed.lgb84.workers.dev";
export const REFRESH_MS=60000;
export const validId=id=>typeof id==="string"&&/^[a-z0-9_-]{3,120}$/.test(id);
export class ApiError extends Error {constructor(status){super(status===401||status===403?"Tilgang avvist. Koble til på nytt.":status===404?"Enheten finnes ikke.":"API utilgjengelig ("+status+").");this.status=status;}}
/** Operator credential stays in this closure, never in URLs or persistent storage. */
export function createClient(fetcher=globalThis.fetch){
 let token="";
 return {
 setToken(v){token=v.trim();}, clear(){token="";},
 async get(path,signal){
  if(!token)throw new ApiError(401);
  if(!/^\/api\/v1\/devices(?:\?|\/|$)/.test(path))throw new Error("Ugyldig rute");
  const timeout=AbortSignal.timeout(20000);
  const response=await fetcher(ORIGIN+path,{headers:{Authorization:"Bearer "+token},cache:"no-store",credentials:"omit",redirect:"error",referrerPolicy:"no-referrer",signal:signal?AbortSignal.any([signal,timeout]):timeout});
  if(!response.ok)throw new ApiError(response.status);
  return response.json();
 }
 };
}
/** A snapshot consists only of explicitly requested list pages; no device fan-out. */
export class FleetStore {
 constructor(client){this.client=client;this.reset();}
 reset(){this.devices=[];this.unavailable=[];this.nextCursor=null;this.pages=0;this.generatedAt=null;}
 async page(cursor,signal){
  const data=await this.client.get("/api/v1/devices?limit=20"+(cursor?"&cursor="+encodeURIComponent(cursor):""),signal);
  if(!Array.isArray(data.devices)||data.devices.some(d=>!validId(d?.deviceId))||
     !Array.isArray(data.unavailable)||data.unavailable.some(id=>!validId(id))||
     data.nextCursor!==null&&!validId(data.nextCursor))throw new Error("Ugyldig listesvar");
  if(data.nextCursor&&data.nextCursor===cursor)throw new Error("Pagineringen står fast");
  return data;
 }
 async refresh(signal){
  // Refresh only pages already requested by the operator; commit atomically on success.
  const pages=Math.max(1,this.pages),items=[],unavailable=[],seen=new Set();
  let cursor=null,last;
  for(let i=0;i<pages;i++){
   last=await this.page(cursor,signal);items.push(...last.devices);unavailable.push(...last.unavailable);
   cursor=last.nextCursor;
   if(cursor&&seen.has(cursor))throw new Error("Ugyldig paginering");
   if(cursor)seen.add(cursor);
   if(!cursor)break;
  }
  signal?.throwIfAborted();
  this.devices=[...new Map(items.map(d=>[d.deviceId,d])).values()];
  this.unavailable=[...new Set(unavailable)];this.nextCursor=cursor;this.generatedAt=last.generatedAt;
  this.pages=seen.size+(cursor?0:1);
 }
 async more(signal){
  if(!this.nextCursor)return;
  const result=await this.page(this.nextCursor,signal);
  signal?.throwIfAborted();
  this.devices=[...new Map([...this.devices,...result.devices].map(d=>[d.deviceId,d])).values()];
  this.unavailable=[...new Set([...this.unavailable,...result.unavailable])];
  this.nextCursor=result.nextCursor;this.pages++;this.generatedAt=result.generatedAt;
 }
 async detail(id,signal){
  if(!validId(id))throw new Error("Ugyldig enhet");
  const d=await this.client.get("/api/v1/devices/"+encodeURIComponent(id),signal);
  if(d?.deviceId!==id)throw new Error("Feil enhet i svar");
  return d;
 }
}

