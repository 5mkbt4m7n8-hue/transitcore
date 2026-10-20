// Separate, read-only sidecar. PixelFrame v1 and firmware remain unchanged.
export function frameDiagnostics(saved, boardId, now=Date.now()) {
  if(!saved?.frame || saved.frame.boardProfile!==boardId)return {
    boardId,status:'NOT_OBSERVED',algorithm:'unified-bus-v1',sequence:null,
    uncertain:true,reason:'No persisted frame observations; OFF is not proof of an empty road.',observations:[]
  };
  const frame=saved.frame,age=Math.max(0,(now-Date.parse(frame.generatedAt))/1000);
  const observations=(saved.diagnostics||[]).map(d=>({
    vehicleId:d.vehicleId??null,lineId:d.lineId??null,logicalLed:d.logicalLed??null,
    source:d.source||'UNKNOWN',observationTime:d.observationTime??null,
    state:d.state||'OFF',confidence:d.confidence||'unknown',reason:d.reason||'not reported',
    uncertain:d.state==='OFF' && !/cancelled/.test(d.reason||''),
    ...(saved.mode==='gps-proximity-v1'?{
      distanceMeters:Number.isFinite(d.distanceMeters)?d.distanceMeters:null,
      observationAgeMs:Number.isFinite(d.observationTime)?Math.max(0,now-d.observationTime):null,
      stateChangedAt:Number.isFinite(d.stateChangedAt)?d.stateChangedAt:null,
      physicalLed:Number.isInteger(d.physicalLed)?d.physicalLed:null
    }:{})
  }));
  return {boardId,algorithm:'unified-bus-v1',sequence:frame.sequence,generatedAt:frame.generatedAt,
    ...(saved.mode==='gps-proximity-v1'?{mode:saved.mode}:{}),
    ageSeconds:age,status:age>frame.ttlSeconds?'STALE':'CURRENT',
    uncertain:!observations.length||observations.some(d=>d.uncertain),
    reason:observations.length?'Observation evidence, not measured hardware state.':'No usable observations; no physical arrival/departure confirmed.',
    observations,truncated:Math.max(0,(saved.diagnosticCount||0)-observations.length)};
}
