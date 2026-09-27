import {buildDeviceConfig, validateDeviceConfig, validDeviceId} from "../../core/models/device-config.mjs";
const json=(body,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store","access-control-allow-origin":"*"}});
const error=(code,status)=>json({error:code},status);
const idPattern="[a-z0-9_-]{3,120}";

/** Only new routes; legacy handlers remain authoritative for frame/status/OTA. */
export async function apiV1(request, env, services) {
  const url=new URL(request.url), path=url.pathname;
  if(!path.startsWith("/api/v1/"))return null;
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{
    "access-control-allow-origin":"*","access-control-allow-methods":"GET, POST, OPTIONS",
    "access-control-allow-headers":"Authorization, Content-Type, X-TransitCore-Device, X-TransitCore-Board, X-TransitCore-Chip, X-TransitCore-Gpio, X-TransitCore-Leds, X-TransitCore-Physical-Leds, X-TransitCore-Firmware",
    "cache-control":"no-store"}});
  const delegate=(pathname,headers=request.headers,body)=> {
    const target=new URL(request.url);target.pathname=pathname;
    return services.legacy(new Request(target,{method:request.method,headers,
      ...(body===undefined?{}:{body})}));
  };
  const frame=path.match(/^\/api\/v1\/frame\/([a-z0-9-]{3,120})$/);
  if(frame) {
    if(request.method!=="GET")return error("method_not_allowed",405);
    return delegate("/v1/boards/"+frame[1]+"/frame");
  }
  if(path==="/api/v1/device/status") {
    if(request.method!=="POST")return error("method_not_allowed",405);
    const body=await request.text();
    if(body.length>32768)return error("body_too_large",413);
    let payload;try{payload=JSON.parse(body);}catch{return error("invalid_status",400);}
    if(!validDeviceId(payload?.deviceId))return error("invalid_device_id",400);
    const headerId=request.headers.get("x-transitcore-device");
    if(headerId&&headerId!==payload.deviceId)return error("device_id_mismatch",400);
    return delegate("/v1/devices/"+payload.deviceId+"/status",request.headers,body);
  }
  if(path==="/api/v1/platform/health") {
    if(request.method!=="GET")return error("method_not_allowed",405);
    return json({
      api:{status:"ok",version:1},
      config:{status:"not_probed",cachedProfiles:services.cachedProfiles()},
      providers:{status:"not_probed"},
      framePipeline:{status:"available",schemaVersion:1},
      deviceStorage:{status:env.DEVICE_STATUS?"bound_not_probed":"unavailable"},
      timestamp:new Date().toISOString()
    });
  }
  const config=path.match(new RegExp("^/api/v1/device/config/("+idPattern+")$"));
  const ota=path.match(new RegExp("^/api/v1/ota/("+idPattern+")$"));
  if(!config&&!ota)return error("not_found",404);
  if(request.method!=="GET")return error("method_not_allowed",405);
  const deviceId=(config||ota)[1];
  const authorization=request.headers.get("authorization")||"";
  if(!authorization.startsWith("Bearer ")||!authorization.slice(7))return error("unauthorized",401);
  const headerId=request.headers.get("x-transitcore-device");
  if(headerId&&headerId!==deviceId)return error("device_id_mismatch",400);
  if(!env.DEVICE_STATUS)return error("device_storage_unavailable",503);
  let entry;
  try {entry=await services.registration(deviceId);}catch{return error("device_storage_unavailable",503);}
  if(!entry)return error("not_found",404);
  if(entry.deviceId!==deviceId||!/^[0-9a-f]{64}$/.test(entry.tokenHash||""))
    return error("invalid_registry",503);
  if(!await services.authenticate(authorization.slice(7),entry))return error("unauthorized",401);
  if(entry.enabled===false)return error("device_disabled",403);
  if(entry.enabled!==true)return error("invalid_registry",503);
  const value=buildDeviceConfig(entry,url.origin);
  if(!validateDeviceConfig(value).valid)return error("device_config_not_provisioned",409);
  let configuration;
  try {configuration=await services.configuration(entry.boardProfile);}
  catch {return error("board_configuration_unavailable",503);}
  if(configuration.board.id!==entry.boardProfile||configuration.hardware.id!==entry.hardwareProfile)
    return error("profile_mismatch",409);
  const boardLimit=configuration.hardware.leds?.brightnessLimit??32;
  if(value.brightnessLimit>boardLimit)return error("brightness_exceeds_hardware_limit",409);
  if(config)return json(value);
  if(!value.otaEnabled)return new Response(null,{status:204,headers:{"cache-control":"no-store"}});
  const headers=new Headers(request.headers);
  const suppliedBoard=headers.get("x-transitcore-board");
  if(suppliedBoard&&suppliedBoard!==entry.boardProfile)return error("profile_mismatch",409);
  headers.set("x-transitcore-device",deviceId);
  headers.set("x-transitcore-board",entry.boardProfile);
  return delegate("/v1/firmware/manifest",headers);
}
