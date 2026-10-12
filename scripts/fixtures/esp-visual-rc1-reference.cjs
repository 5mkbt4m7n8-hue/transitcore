// Test-only reference to the existing ESP parser/render semantics. Not firmware.
// Source: 1.3.1-visual-rc1 parseAndValidateFrame/renderFrame/Visual_rc1.h.
// Logical white-channel brightness; hardware cap intentionally excluded.
exports.decode=function(frame,nowMs,expired=false){
  const ranks={OFF:0,PASSED:1,APPROACHING:2,AT_STOP:3,PARKED:4};
  return Array.from({length:frame.ledCount},(_,id)=>{
    const p=expired?null:frame.leds.find(p=>p.id===id);
    if(!p)return {id,state:'OFF',vehicleIds:[],selectedVehicle:null,logicalLevel:0};
    const state=p.lifecycle==='PASSED'?'PASSED':p.lifecycle==='PARKED'?'PARKED':p.state;
    const occupants=(p.occupants||[]).filter(o=>Array.isArray(o.rgb)&&o.rgb.length===3&&o.rgb.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&ranks[o.state]===ranks[state]).slice(0,4);
    const millis=nowMs>>>0,phase=millis%1800,triangle=phase<900?phase:1800-phase;
    const animation=state==='APPROACHING'?Math.trunc(triangle*255/900):255;
    return {id,state,vehicleIds:[...new Set([p.vehicle?.id,...occupants.map(o=>o.id)].filter(Boolean))],
      selectedVehicle:(occupants.length?occupants[Math.trunc(millis/1200)%occupants.length].id:p.vehicle?.id)||null,
      logicalLevel:Math.trunc(255*p.brightness*animation/(255*255))};
  });
};
