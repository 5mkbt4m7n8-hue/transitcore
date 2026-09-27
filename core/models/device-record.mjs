export const HEALTH_POLICY=Object.freeze({
  heartbeatSeconds:300,graceSeconds:120,offlineMultiplier:3,
  staleFrameSeconds:300,weakRssi:-85,lowHeapBytes:40000,
  pollFailures:3,pollFailureRatio:0.25,reconnects:3,
  minPostSeconds:10,historySampleSeconds:300,historyHours:24,historyLimit:288,
  errorDays:7,errorLimit:100,rebootWindowSeconds:900,rebootLimit:3
});
export function healthPolicy(overrides={}) {
  if(!overrides||typeof overrides!=="object"||Array.isArray(overrides))throw Error("invalid health policy");
  const p={...HEALTH_POLICY};
  for(const [key,value] of Object.entries(overrides)){
    if(!(key in HEALTH_POLICY)||typeof value!=="number"||!Number.isFinite(value))throw Error("invalid health policy");
    if(key==="weakRssi" ? value< -127||value>0 :
       key==="pollFailureRatio" ? value<0||value>1 : value<=0||!Number.isInteger(value))throw Error("invalid health policy");
    p[key]=value;
  }
  if(p.historyLimit>288||p.errorLimit>100||p.historyHours>168||p.errorDays>30||
    p.heartbeatSeconds>3600||p.minPostSeconds>60||p.historySampleSeconds>3600||
    p.rebootLimit>100||p.rebootWindowSeconds>86400)throw Error("invalid health policy limits");
  return p;
}
export function evaluateHealth(registration, latest, now=Date.now(), policy=HEALTH_POLICY) {
  if(registration.enabled===false)return {status:"DISABLED",reasons:["DISABLED"]};
  const h=latest?.health;
  const lastSeen=Date.parse(h?.receivedAt||latest?.receivedAt||"");
  const interval=registration.deviceConfig?.statusIntervalSeconds||policy.heartbeatSeconds;
  const age=(now-lastSeen)/1000;
  if(!Number.isFinite(lastSeen)||age>interval*policy.offlineMultiplier+policy.graceSeconds)
    return {status:"OFFLINE",reasons:[Number.isFinite(lastSeen)?"HEARTBEAT_TIMEOUT":"NEVER_SEEN"]};
  const reasons=[];
  if(age>interval+policy.graceSeconds)reasons.push("HEARTBEAT_LATE");
  if(!h)return {status:"DEGRADED",reasons:["LEGACY_UNNORMALIZED"]};
  if(h.errors.some(e=>e.active&&e.severity==="error"))return {status:"ERROR",
    reasons:[...new Set(h.errors.filter(e=>e.active&&e.severity==="error").map(e=>e.normalizedCode))]};
  if(h.frameValid===false||h.lastFrameAgeSeconds!=null&&h.lastFrameAgeSeconds>policy.staleFrameSeconds)reasons.push("FRAME_STALE");
  if(h.wifiRssi!=null&&h.wifiRssi<policy.weakRssi)reasons.push("WEAK_WIFI");
  if(h.freeHeap!=null&&h.freeHeap<policy.lowHeapBytes)reasons.push("LOW_HEAP");
  if(h.lastOtaResult==="failed")reasons.push("OTA_FAILED");
  const d=latest._telemetry?.deltas;
  if(d&&d.failedPolls>=policy.pollFailures&&d.failedPolls/Math.max(1,d.failedPolls+d.successfulPolls)>=policy.pollFailureRatio)reasons.push("FRAME_FETCH_FAILED");
  if(d&&d.wifiOutages>=policy.reconnects)reasons.push("WIFI_RECONNECTS");
  if((latest._telemetry?.reboots||[]).filter(t=>now-t<=policy.rebootWindowSeconds*1000).length>=policy.rebootLimit)reasons.push("REBOOT_LOOP");
  for(const e of h.errors)if(e.active&&e.severity==="warning")reasons.push(e.normalizedCode);
  return {status:reasons.length?"DEGRADED":"ONLINE",reasons:[...new Set(reasons)]};
}
export function deviceRecord(registration,latest,now,policy) {
  const h=latest?.health;
  return {schemaVersion:1,deviceId:registration.deviceId,label:registration.label||"",
    boardProfile:registration.boardProfile,hardwareProfile:registration.hardwareProfile??null,
    enabled:registration.enabled===true,createdAt:registration.createdAt??null,
    lastSeen:h?.receivedAt||latest?.receivedAt||null,
    firmwareVersion:h?.firmwareVersion??latest?.firmware??null,
    desiredFirmwareVersion:/^\d+\.\d+\.\d+$/.test(registration.desiredFirmwareVersion||"")?registration.desiredFirmwareVersion:null,
    ...evaluateHealth(registration,latest,now,policy),
    featureFlags:Object.fromEntries(Object.entries(registration.deviceConfig?.featureFlags||{}).filter(([key,v])=>/^[a-z][a-zA-Z0-9]{0,39}$/.test(key)&&typeof v==="boolean").slice(0,32)),
    health:h??null};
}
