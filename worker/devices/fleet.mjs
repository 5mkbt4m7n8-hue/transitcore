import {deviceRecord,healthPolicy} from "../../core/models/device-record.mjs";
import {validDeviceId} from "../../core/models/device-config.mjs";
import {safeEvent} from "./telemetry.mjs";
import {normalizeHealthStatus} from "../../core/models/health-status.mjs";
const json=(body,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
export async function fleetResponse(request,env,services) {
  if(!env.PUBLISH_ADMIN_TOKEN)return json({error:"admin_not_configured"},503);
  const auth=request.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer ")||!await services.authenticate(auth.slice(7)))return json({error:"unauthorized"},401);
  if(request.method!=="GET")return json({error:"method_not_allowed"},405);
  if(!env.DEVICE_STATUS)return json({error:"device_storage_unavailable"},503);
  const url=new URL(request.url),id=url.pathname.split("/")[4];
  const cursor=url.searchParams.get("cursor")||"";
  const limit=Number(url.searchParams.get("limit")||20);
  if(!Number.isInteger(limit)||limit<1||limit>50||cursor&&!validDeviceId(cursor))return json({error:"invalid_pagination"},400);
  try{
    const policy=services.policy(),now=Date.now();
    const registry=services.registry();
    const read=async(registration,detail=false)=>{
      if(!validDeviceId(registration.deviceId)||typeof registration.boardProfile!=="string"||typeof registration.enabled!=="boolean")throw Error("Invalid registry");
      const stub=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName(registration.deviceId));
      const response=await stub.fetch("https://status.internal/telemetry"+(detail?"?detail=1":""));
      if(!response.ok)throw Error("Telemetry unavailable");
      const data=await response.json();
      if(data.latest&&!data.latest.health){
        try{data.latest.health=normalizeHealthStatus(data.latest,registration,Date.parse(data.latest.receivedAt));}
        catch{} // Invalid historical sample is surfaced as LEGACY_UNNORMALIZED.
      }
      const p=healthPolicy({...policy,heartbeatSeconds:registration.deviceConfig?.statusIntervalSeconds||policy.heartbeatSeconds});
      const record=deviceRecord(registration,data.latest,now,p);
      if(!detail)return record;
      return {...record,
        history:(data.history||[]).filter(s=>now-Date.parse(s.receivedAt)<=p.historyHours*3600000)
          .slice(-p.historyLimit).map(s=>({receivedAt:s.receivedAt,status:s.status||null,health:s.health||null})),
        errors:(data.errors||[]).filter(e=>now-Date.parse(e.lastSeen||e.receivedAt)<=p.errorDays*86400000).slice(-p.errorLimit).map(safeEvent)};
    };
    if(id) {
      const found=await registry.fetch("https://status.internal/registry/"+encodeURIComponent(id));
      if(found.status===404)return json({error:"not_found"},404);
      if(!found.ok)throw Error("Registry unavailable");
      return json(await read(await found.json(),true));
    }
    const page=await registry.fetch("https://status.internal/registry-page?limit="+limit+"&after="+encodeURIComponent(cursor));
    if(!page.ok)throw Error("Registry unavailable");
    const entries=await page.json(),devices=[],unavailable=[];
    // Bounded fan-out, no full-registry scan or fetch-per-device config/provider work.
    for(let offset=0;offset<entries.devices.length;offset+=5){
      const batch=await Promise.all(entries.devices.slice(offset,offset+5).map(async entry=>{
        try{return await read(entry);}catch{unavailable.push(entry.deviceId);return null;}
      }));
      devices.push(...batch.filter(Boolean));
    }
    return json({devices,unavailable,nextCursor:entries.nextCursor,generatedAt:new Date(now).toISOString()});
  }catch{return json({error:"fleet_storage_or_policy_unavailable"},503);}
}
