import {normalizeHealthStatus} from "../../core/models/health-status.mjs";
import {healthPolicy,evaluateHealth} from "../../core/models/device-record.mjs";
export const publicSample = sample => {
  if(!sample)return null;
  const {health,_telemetry,_healthPolicy,...legacy}=sample;
  return legacy;
};
export const safeEvent = event => ({
  code:event.normalizedCode||event.code,severity:event.severity||"warning",
  firstSeen:event.firstSeen||event.receivedAt,lastSeen:event.lastSeen||event.receivedAt,
  count:event.count||event.occurrences||1,message:event.message||"Legacy device event",
  active:event.active===true,resolvedAt:event.resolvedAt||null
});
export const publicEvent = event => ({
  receivedAt:event.receivedAt,code:event.code,detail:event.message||event.detail||"",
  occurredAtUptimeSeconds:event.occurredAtUptimeSeconds??0,
  occurrences:event.count||event.occurrences||1,...(event.id!=null?{id:event.id}:{})
});
const signature=async health=>{
  const data=JSON.stringify({...health,receivedAt:undefined});
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(data)))]
    .map(b=>b.toString(16).padStart(2,"0")).join("");
};
export async function storeTelemetry(storage,sample) {
  const p=healthPolicy(sample._healthPolicy);
  const now=Date.parse(sample.receivedAt);
  const inputHealth=sample.health||normalizeHealthStatus(sample,{deviceId:sample.deviceId,boardProfile:sample.boardProfile},now);
  const hash=await signature(inputHealth);
  const update=async store=>{
    const h=structuredClone(inputHealth); // Transactions may retry; do not carry mutations across attempts.
    const previous=await store.get("latest");
    const before=previous?.health;
    const meta=previous?._telemetry||{};
    const seen=meta.seen||[];
    const lease=Number(await store.get("logUntil")||0);
    const reply={ok:true,logSeconds:Math.max(0,Math.min(900,Math.ceil((lease-now)/1000)))};
    if(seen.includes(hash))return {status:200,body:reply};
    const sameBoot=before&&(before.bootId&&h.bootId?before.bootId===h.bootId:
      before.bootCount!=null&&h.bootCount!=null&&before.bootCount===h.bootCount);
    if(sameBoot&&
      (h.uptimeSeconds!=null&&before.uptimeSeconds!=null?h.uptimeSeconds<before.uptimeSeconds:
       h.timestamp&&before.timestamp&&Date.parse(h.timestamp)<Date.parse(before.timestamp)))
      return {status:200,body:reply}; // Delayed report: do not revive lastSeen.
    if(previous&&now-Date.parse(previous.receivedAt)<p.minPostSeconds*1000)
      return {status:429,body:{error:"status_rate_limited"},retryAfter:p.minPostSeconds};
    const reboot=Boolean(before&&(
      before.bootId&&h.bootId&&before.bootId!==h.bootId||
      before.bootCount!=null&&h.bootCount!=null&&h.bootCount>before.bootCount||
      before.uptimeSeconds!=null&&h.uptimeSeconds!=null&&h.uptimeSeconds<before.uptimeSeconds));
    const epoch=(meta.bootEpoch||0)+(reboot?1:0);
    const reboots=(meta.reboots||[]).filter(t=>now-t<=p.rebootWindowSeconds*1000);
    if(reboot){reboots.push(now);if(reboots.length>100)reboots.shift();}
    const deltas={};
    for(const key of ["successfulPolls","failedPolls","wifiOutages"])
      deltas[key]=!reboot&&before?.[key]!=null&&h[key]!=null&&h[key]>=before[key]?h[key]-before[key]:0;
    if(!reboot&&!h.capabilities.errorSnapshot) {
      const active=(before?.errors||[]).filter(e=>e.active&&!h.errors.some(n=>n.source==="health"&&n.code===e.code));
      h.errors.push(...active);
    }
    const storedErrors=await store.get("errors");
    const errorsBefore=JSON.stringify(storedErrors||[]);
    let errors=(storedErrors||[]).filter(e=>now-Date.parse(e.lastSeen||e.receivedAt)<=p.errorDays*86400000);
    const watermarks=reboot?{}:{...(meta.eventWatermarks||{})};
    // Persist event identities across repeated errorQueue snapshots, scoped to boot.
    for(const e of h.errors){
      const key=epoch+":"+e.source+":"+(e.id??e.code+":"+(e.occurredAtUptimeSeconds??"active"));
      const previousEvent=errors.find(item=>item.eventKey===key);
      const acknowledged=watermarks[key]||0;
      watermarks[key]=Math.max(acknowledged,e.count);
      if(!previousEvent&&!e.active&&acknowledged>=e.count)continue;
      if(previousEvent){
        const recurrence=!previousEvent.active&&e.active;
        const increment=recurrence?e.count:Math.max(0,e.count-(previousEvent.reportedCount??previousEvent.count));
        const changed=increment>0||e.active!==previousEvent.active;
        if(changed||e.active)previousEvent.lastSeen=h.receivedAt;
        previousEvent.count=Math.min(Number.MAX_SAFE_INTEGER,previousEvent.count+increment);
        previousEvent.reportedCount=e.count;
        previousEvent.active=e.active;
        previousEvent.severity=e.severity;
        previousEvent.resolvedAt=e.active?null:previousEvent.resolvedAt||h.receivedAt;
      }else errors.push({...e,count:e.active?e.count:e.count-acknowledged,reportedCount:e.count,eventKey:key,bootEpoch:epoch,firstSeen:h.receivedAt,lastSeen:h.receivedAt,
        receivedAt:h.receivedAt,occurrences:e.count,resolvedAt:e.active?null:h.receivedAt});
    }
    if(reboot||h.capabilities.errorSnapshot)for(const e of errors) {
      if(e.active&&(e.bootEpoch!==epoch||!h.errors.some(n=>n.active&&n.code===e.code))){
        e.active=false;e.resolvedAt=h.receivedAt;e.lastSeen=h.receivedAt;
      }
    }
    errors=errors.sort((a,b)=>Date.parse(a.lastSeen||a.receivedAt)-Date.parse(b.lastSeen||b.receivedAt)).slice(-p.errorLimit);
    const latest={...sample,health:h,_healthPolicy:p,_telemetry:{bootEpoch:epoch,reboots,deltas,
      eventWatermarks:Object.fromEntries(Object.entries(watermarks).slice(-p.errorLimit)),seen:[...seen,hash].slice(-8)}};
    const registration={enabled:true,deviceConfig:{statusIntervalSeconds:p.heartbeatSeconds}};
    const state=evaluateHealth(registration,latest,now,p);
    const oldState=previous?evaluateHealth(registration,previous,now,p):null;
    const storedHistory=await store.get("history")||[];
    let history=storedHistory.filter(s=>now-Date.parse(s.receivedAt)<=p.historyHours*3600000);
    let historyChanged=history.length!==storedHistory.length;
    const tail=history.at(-1);
    if(!tail||now-Date.parse(tail.receivedAt)>=p.historySampleSeconds*1000||
      oldState?.status!==state.status||JSON.stringify(oldState?.reasons)!==JSON.stringify(state.reasons)||reboot)
      {history.push({...publicSample(sample),health:h,...state});historyChanged=true;}
    if(history.length>p.historyLimit)historyChanged=true;
    history=history.slice(-p.historyLimit);
    const changes={latest};
    if(historyChanged)changes.history=history;
    if(!storedErrors||JSON.stringify(errors)!==errorsBefore)changes.errors=errors;
    await store.put(changes);
    return {status:200,body:reply};
  };
  // Actual Durable Object storage is transactional; simple fixture stores may not be.
  return storage.transaction?storage.transaction(update):update(storage);
}
