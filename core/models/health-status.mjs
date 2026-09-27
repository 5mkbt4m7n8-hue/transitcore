import {isObject,isId} from "./common.mjs";
import {validDeviceId} from "./device-config.mjs";
const aliases={firmwareVersion:"firmware",lastFrameAgeSeconds:"frameAgeSeconds",
  successfulPolls:"feedSuccesses",failedPolls:"feedFailures"};
const codes={WIFI_DISCONNECTED:"WIFI_DOWN",FEED_RECEIVE:"FRAME_FETCH_FAILED",
  FRAME_EXPIRED:"FRAME_STALE",FRAME_INVALID:"INVALID_FRAME",OTA_MANIFEST:"OTA_FAILED",
  OTA_UPDATE:"OTA_FAILED"};
export const errorCode=code=>codes[code]||code;
export const errorMessage=code=>({
  WIFI_DOWN:"Wi-Fi disconnected",FRAME_FETCH_FAILED:"Frame fetch failed",FRAME_STALE:"Frame is stale",
  INVALID_FRAME:"Frame validation failed",CONFIG_FAILED:"Configuration failed",OTA_FAILED:"OTA failed",
  LOW_HEAP:"Low free heap",REBOOT_LOOP:"Repeated restarts",PROFILE_MISMATCH:"Profile mismatch"
}[errorCode(code)]||"Device reported an event");

export function normalizeHealthStatus(value, registration, now=Date.now()) {
  if(!isObject(value)||value.schemaVersion!==1||!validDeviceId(registration.deviceId)||
    !isId(registration.boardProfile)||value.boardProfile!==registration.boardProfile||
    (value.deviceId!=null&&value.deviceId!==registration.deviceId))throw Error("invalid health identity");
  const fields=[];
  const read=key=>{
    if(aliases[key]&&value[key]!=null&&value[aliases[key]]!=null&&value[key]!==value[aliases[key]])throw Error("conflicting "+key);
    const supplied=value[key]??(aliases[key]?value[aliases[key]]:null);
    if(supplied!=null)fields.push(key);
    return supplied??null;
  };
  const num=(key,min=0,max=0xffffffff)=>{
    const v=read(key);
    if(v!=null&&(!Number.isInteger(v)||v<min||v>max))throw Error("invalid "+key);
    return v;
  };
  const text=(key,pattern,max=120)=>{
    const v=read(key);
    if(v!=null&&(typeof v!=="string"||v.length>max||!pattern.test(v)))throw Error("invalid "+key);
    return v;
  };
  const timestamp=text("timestamp",/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/);
  if(timestamp&&!Number.isFinite(Date.parse(timestamp)))throw Error("invalid timestamp");
  const hardwareProfile=text("hardwareProfile",/^[a-z0-9-]{3,120}$/);
  if(hardwareProfile&&registration.hardwareProfile&&hardwareProfile!==registration.hardwareProfile)throw Error("hardware profile mismatch");
  const firmwareVersion=text("firmwareVersion",/^\d+\.\d+\.\d+$/,32);
  const frameValid=read("frameValid");
  if(frameValid!=null&&typeof frameValid!=="boolean")throw Error("invalid frameValid");
  const resetReason=read("resetReason");
  if(resetReason!=null&&!(Number.isInteger(resetReason)&&resetReason>=0&&resetReason<=255)&&
    !(typeof resetReason==="string"&&/^[a-zA-Z0-9 _-]{1,64}$/.test(resetReason)))throw Error("invalid resetReason");
  const errors=[];
  const canonical=value.errors;
  if(canonical!=null)fields.push("errors");
  if(canonical!=null&&(!Array.isArray(canonical)||canonical.length>10))throw Error("invalid errors");
  const legacy=value.errorQueue?.length?value.errorQueue:value.lastError?[value.lastError]:[];
  if(!Array.isArray(legacy)||legacy.length>10)throw Error("invalid error queue");
  for(const [rows,isLegacy] of [[canonical||[],false],[legacy,true]])for(const e of rows){
    if(!isObject(e)||!/^[_A-Z][A-Z0-9_]{2,39}$/.test(e.code||""))throw Error("invalid error code");
    const count=e.count??e.occurrences??1, severity=e.severity??"warning";
    if(!Number.isInteger(count)||count<1||count>0xffffffff||!["info","warning","error"].includes(severity))throw Error("invalid error");
    if(e.active!=null&&typeof e.active!=="boolean")throw Error("invalid error active");
    if(e.id!=null&&(!Number.isInteger(e.id)||e.id<1||e.id>0xffffffff))throw Error("invalid error id");
    if(e.occurredAtUptimeSeconds!=null&&(!Number.isInteger(e.occurredAtUptimeSeconds)||e.occurredAtUptimeSeconds<0||e.occurredAtUptimeSeconds>0xffffffff))throw Error("invalid error uptime");
    errors.push({code:e.code,normalizedCode:errorCode(e.code),severity,count,
      active:isLegacy?false:e.active!==false,source:isLegacy?"legacy":"health",
      id:e.id??null,occurredAtUptimeSeconds:e.occurredAtUptimeSeconds??null,
      message:errorMessage(e.code)});
  }
  const health={schemaVersion:1,deviceId:registration.deviceId,boardProfile:registration.boardProfile,
    hardwareProfile,firmwareVersion,timestamp,receivedAt:new Date(now).toISOString(),
    uptimeSeconds:num("uptimeSeconds"),wifiRssi:num("wifiRssi",-127,0),freeHeap:num("freeHeap",0,16000000),
    bootCount:num("bootCount"),bootId:text("bootId",/^[a-zA-Z0-9_-]{1,64}$/,64),resetReason,
    lastFrameAgeSeconds:num("lastFrameAgeSeconds"),lastFrameSequence:num("lastFrameSequence"),
    successfulPolls:num("successfulPolls"),failedPolls:num("failedPolls"),wifiOutages:num("wifiOutages"),
    wifiRecoveries:num("wifiRecoveries"),minimumFreeHeap:num("minimumFreeHeap",0,16000000),frameValid,
    lastOtaResult:text("lastOtaResult",/^(none|pending|success|failed)$/),errors};
  health.capabilities={reportedFields:fields.sort(),legacy:typeof value.firmware==="string",errorSnapshot:Array.isArray(value.errors)};
  return health;
}
