// Authenticated, versioned Trondheim schematic editor drafts in an existing
// Durable Object. All public access is refused by the outer Worker handler.
const KEY="linear:trondheim:current";
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=913&&p.y>=0&&p.y<=1280;
export function validateLinearSnapshot(body){
 if(!body||body.version!==1||typeof body.baseFingerprint!=="string"||!(/^[0-9a-f]{1,8}-[0-9]{3,8}$/.test(body.baseFingerprint)))throw Error("invalid_base_fingerprint");
 const l=body.layout;
 if(l?.schemaVersion!==1||l.id!=="trondheim-white-map"||l.viewBox?.join(" ")!=="0 0 913 1280")throw Error("invalid_layout");
 if(!Array.isArray(l.stops)||l.stops.length<100||l.stops.length>3000||!Array.isArray(l.paths)||l.paths.length>1000)throw Error("invalid_geometry_count");
 const ids=new Set(),stopIds=new Set();
 for(const stop of l.stops){
  if(!stop||typeof stop.id!=="string"||!(/^(original-\d{3}|custom-stop-\d{3,4})$/.test(stop.id))||ids.has(stop.id)||!validPoint(stop)||!validPoint(stop.label)||typeof stop.label.visible!=="boolean"||typeof stop.name!=="string"||stop.name.length>120||!Array.isArray(stop.bindings)||stop.bindings.length>100||!["shared","split"].includes(stop.diodeMode)||!Number.isFinite(stop.radius)||stop.radius<2||stop.radius>20)throw Error("invalid_stop");
  ids.add(stop.id);stopIds.add(stop.id);
 }
 // The source image has original-000..original-101, excluding 022 and 023.
 for(let i=0;i<102;i++)if(i!==22&&i!==23&&!ids.has("original-"+String(i).padStart(3,"0")))throw Error("missing_original_stop");
 for(const path of l.paths){
  if(!path||typeof path.id!=="string"||ids.has(path.id)||!(/^(trace-\d{2}|custom-path-\d{3,4})$/.test(path.id))||!Array.isArray(path.points)||path.points.length<2||path.points.length>1000||!path.points.every(validPoint)||!Array.isArray(path.routes)||path.routes.length>100||!/^#[0-9a-f]{6}$/i.test(path.color)||!Number.isFinite(path.width)||path.width<.5||path.width>15)throw Error("invalid_path");
  ids.add(path.id);
 }
 if(!body.names||typeof body.names!=="object"||Array.isArray(body.names)||Object.keys(body.names).length>l.stops.length)throw Error("invalid_names");
 for(const [id,name] of Object.entries(body.names)){
  if(!stopIds.has(id)||typeof name!=="string"||name.length>80||!name.trim()||name!==name.trim().replace(/\s+/g," "))throw Error("invalid_name");
 }
 return {version:1,baseFingerprint:body.baseFingerprint,layout:l,names:body.names};
}
// Request to the private Durable Object stub. Revisions prevent one device
// silently overwriting edits made in a second tab or another device.
export async function linearDraftStorage(storage,request){
 const url=new URL(request.url);
 if(url.pathname!=="/linear-draft")return respond({error:"not_found"},404);
 if(request.method==="GET"){
  const saved=await storage.get(KEY)||null;
  return respond({snapshot:saved,revision:saved?.revision||0});
 }
 if(request.method!=="PUT")return respond({error:"method_not_allowed"},405);
 const len=Number(request.headers.get("content-length")||0);
 if(len>1500000)return respond({error:"payload_too_large"},413);
 const raw=await request.text();
 if(raw.length>1500000)return respond({error:"payload_too_large"},413);
 let data;
 try{data=JSON.parse(raw);}catch{return respond({error:"invalid_json"},400);}
 const revision=data?.expectedRevision;
 if(!Number.isInteger(revision)||revision<0)return respond({error:"invalid_revision"},400);
 let snapshot;
 try{snapshot=validateLinearSnapshot(data);}catch(error){return respond({error:error.message},400);}
 const previous=await storage.get(KEY)||null;
 const current=previous?.revision||0;
 if(revision!==current)return respond({error:"revision_conflict",revision:current},409);
 const saved={...snapshot,revision:current+1,savedAt:new Date().toISOString()};
 await storage.put(KEY,saved);
 // Previous versions remain available for recovery, with bounded retention.
 if(previous){
  await storage.put("linear:trondheim:backup:"+previous.revision,previous);
  if(previous.revision>10&&typeof storage.delete==="function")
   await storage.delete("linear:trondheim:backup:"+(previous.revision-10));
 }
 return respond({ok:true,revision:saved.revision,savedAt:saved.savedAt});
}
export const linearDraftCors={
 "content-type":"application/json; charset=utf-8","cache-control":"no-store",
 "access-control-allow-origin":"https://5mkbt4m7n8-hue.github.io",
 "access-control-allow-headers":"authorization, content-type",
 "access-control-allow-methods":"GET, PUT, OPTIONS"
};
export async function handleLinearDraft(request,env,authenticate){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:linearDraftCors});
 const reply=(body,status)=>new Response(JSON.stringify(body),{status,headers:linearDraftCors});
 if(!["GET","PUT"].includes(request.method))return reply({error:"method_not_allowed"},405);
 const origin=request.headers.get("origin");
 if(origin&&origin!=="https://5mkbt4m7n8-hue.github.io")return reply({error:"invalid_origin"},403);
 if(!env.PUBLISH_ADMIN_TOKEN)return reply({error:"admin_key_not_configured"},503);
 const authorization=request.headers.get("authorization")||"";
 if(!authorization.startsWith("Bearer ")||!await authenticate(authorization.slice(7),env.PUBLISH_ADMIN_TOKEN))return reply({error:"unauthorized"},401);
 if(!env.DEVICE_STATUS)return reply({error:"draft_storage_unavailable"},503);
 const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName("__trondheim-linear-cloud-draft__"));
 try{
  const response=await stub.fetch("https://status.internal/linear-draft",{
   method:request.method,
   ...(request.method==="PUT"?{headers:{"content-type":"application/json","content-length":request.headers.get("content-length")||""},body:await request.text()}:{})
  });
  return new Response(response.body,{status:response.status,headers:linearDraftCors});
 }catch(error){console.error("linear draft unavailable",error);return reply({error:"draft_storage_error"},503);}
}
