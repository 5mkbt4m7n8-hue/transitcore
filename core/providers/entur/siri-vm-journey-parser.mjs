// Exact pilot line 1/11 SIRI VehicleMonitoring journey references. This is
// deliberately conservative, not a full XML implementation; unsupported SIRI
// shapes fail closed. Onward/next calls never confirm a current stop or trip.
const activity=/<(?:[A-Za-z_][\w.-]*:)?VehicleActivity(?:\s[^<>]*?)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?VehicleActivity\s*>/g;
const tag=(source,name)=>{
 const matches=[...source.matchAll(new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+name+'(?:\\s[^<>]*?)?>([^<>]+)<\\/(?:[A-Za-z_][\\w.-]*:)?'+name+'\\s*>','g'))];
 return matches.length===1?matches[0][1].trim():null;
};
const validTime=s=>typeof s==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
export function parsePilotSiriJourneyRefs(xml,{maxActivities=4000}={}){
 if(typeof xml!=='string'||xml.length>8_000_000||!xml.includes('VehicleMonitoringDelivery'))
   throw Error('Invalid SIRI-VM XML');
 const result=[],dedupe=new Set();let count=0;
 for(const match of xml.matchAll(activity)){
  if(++count>maxActivities)throw Error('Too many SIRI activities');
  const body=match[0];
  const lineRef=tag(body,'LineRef'),vehicleRef=tag(body,'VehicleRef');
  const datedVehicleJourneyRef=tag(body,'DatedVehicleJourneyRef');
  const recordedAt=tag(body,'RecordedAtTime');
  if(!['ATB:Line:2_1','ATB:Line:2_11'].includes(lineRef)||
    typeof vehicleRef!=='string'||vehicleRef.length>150||
    !/^[A-Z0-9_]+:[A-Za-z]+:[A-Za-z0-9_:.+-]{1,160}$/.test(datedVehicleJourneyRef||'')||
    !validTime(recordedAt))continue;
  const key=lineRef+'|'+vehicleRef+'|'+datedVehicleJourneyRef+'|'+recordedAt;
  if(dedupe.has(key))continue;
  dedupe.add(key);
  result.push({source:'entur-siri-vm',lineRef,vehicleRef,datedVehicleJourneyRef,recordedAt});
 }
 return result;
}
