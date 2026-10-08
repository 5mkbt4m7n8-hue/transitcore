// Derived exclusively from accepted server telemetry, in the same DO transaction.
const iso = n => new Date(n).toISOString();
const counters = ["wifiOutages", "wifiRecoveries", "successfulPolls", "failedPolls"];
const max = (a,b) => a == null ? b ?? null : b == null ? a : Math.max(a,b);
const min = (a,b) => a == null ? b ?? null : b == null ? a : Math.min(a,b);
export const soakGapSeconds = p => p.heartbeatSeconds + p.graceSeconds;
const usable = h => Boolean(h?.bootId && Number.isInteger(h.uptimeSeconds));
const feedGood = (h,p) => h?.frameValid === true && h.lastFrameAgeSeconds != null &&
  h.lastFrameAgeSeconds <= p.staleFrameSeconds && h.successfulPolls > 0 &&
  h.lastFrameSequence != null && !(h.errors || []).some(e => e.active &&
    ["FRAME_STALE","INVALID_FRAME","FRAME_FETCH_FAILED"].includes(e.normalizedCode || e.code));

export function updateSoak(saved, h, now, policy, reboot = false) {
  const state = structuredClone(saved || {current:null,history:[],restartCount:0});
  let run = state.current;
  const changedBoot = Boolean(run && h.bootId && run.bootId !== h.bootId);
  const gap = run && now - Date.parse(run.latestSeenAt) > soakGapSeconds(policy)*1000;
  const reason = changedBoot || reboot ? "REBOOT" : gap ? "REPORT_GAP" : !usable(h) ? "MISSING_BOOT_EVIDENCE" : null;
  if(run && reason) {
    state.history.push({...run, endedAt:iso(now), outcome:run.milestones[72]?"COMPLETED":"ABORTED", endReason:reason});
    state.history = state.history.slice(-20);
    state.current = run = null;
  }
  if(changedBoot || reboot) {
    state.restartCount++;
    state.lastRestartAt = iso(now);
  }
  state.bootChangedSincePrevious = changedBoot || reboot;
  if(!usable(h)) return state;
  if(!run) run = state.current = {
    firstSeenAt:iso(now),latestSeenAt:iso(now),bootId:h.bootId,bootCount:h.bootCount,
    resetReason:h.resetReason,startUptime:h.uptimeSeconds,maxObservedUptime:h.uptimeSeconds,
    observedSeconds:0,minObservedHeap:null,heapDropCount:0,milestones:{},
    lastFrameSequence:h.lastFrameSequence,lastProgressAt:null
  };
  const oldMinimum = run.minObservedHeap;
  run.minObservedHeap = min(oldMinimum,h.minimumFreeHeap ?? h.freeHeap);
  if(oldMinimum != null && run.minObservedHeap < oldMinimum) {
    run.heapDropCount++; run.lastHeapDropAt=iso(now);
  }
  if(h.successfulPolls > (run.successfulPolls ?? h.successfulPolls) &&
     h.lastFrameSequence != null && h.lastFrameSequence !== run.lastFrameSequence) run.lastProgressAt=iso(now);
  run.latestSeenAt=iso(now);
  run.lastFrameSequence=h.lastFrameSequence;
  run.maxObservedUptime=max(run.maxObservedUptime,h.uptimeSeconds);
  // Never infer pre-monitoring coverage or advance a milestone merely by waiting in a browser.
  run.observedSeconds=Math.max(0,Math.min((now-Date.parse(run.firstSeenAt))/1000,h.uptimeSeconds-run.startUptime));
  for(const key of counters) run[key]=max(run[key],h[key]);
  const progressRecent = run.lastProgressAt && now-Date.parse(run.lastProgressAt)<=soakGapSeconds(policy)*1000;
  if(feedGood(h,policy) && progressRecent) for(const hours of [24,48,72])
    if(run.observedSeconds>=hours*3600 && !run.milestones[hours]) run.milestones[hours]=iso(now);
  return state;
}

export function soakView(saved, health, now, policy, enabled=true, detail=false) {
  const run=saved?.current;
  const gap=Boolean(run && now-Date.parse(run.latestSeenAt)>soakGapSeconds(policy)*1000);
  const ready=enabled && usable(health) && run && !gap;
  const progressRecent=run?.lastProgressAt && now-Date.parse(run.lastProgressAt)<=soakGapSeconds(policy)*1000;
  const passing=ready && feedGood(health,policy) && progressRecent;
  const milestone=passing ? [72,48,24].find(n=>run.milestones[n]) : null;
  return {status:!ready?"NOT STARTED":milestone?`PASS ${milestone}H`:"RUNNING",
    reason:!enabled?"DISABLED":!usable(health)?"MISSING_BOOT_EVIDENCE":gap?"REPORT_GAP":!feedGood(health,policy)?"WAITING_FOR_FEED":!progressRecent?"WAITING_FOR_PROGRESS":null,
    gapToleranceSeconds:soakGapSeconds(policy),current:run??null,
    restartCount:saved?.restartCount??0,lastRestartAt:saved?.lastRestartAt??null,
    bootChangedSincePrevious:saved?.bootChangedSincePrevious??false,
    ...(detail?{history:saved?.history||[]}:{})};
}
