// Conservative SIRI-VM XML extractor for explicit at-stop evidence only.
// Not a general XML parser: unexpected/malformed shapes return no reports.
// Never trust an OnwardCall, estimated call, or MonitoredCall lacking true.
const activityRE=/<(?:[A-Za-z_][\w.-]*:)?VehicleActivity(?:\s[^<>]*?)?>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?VehicleActivity\s*>/g;
const matchedTags=(xml,name)=>[...xml.matchAll(new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+name+'(?:\\s[^<>]*?)?>([^<>]*)<\\/(?:[A-Za-z_][\\w.-]*:)?'+name+'\\s*>','g'))].map(m=>m[1].trim());
function section(xml,name){
 const items=[...xml.matchAll(new RegExp('<(?:[A-Za-z_][\\w.-]*:)?'+name+'(?:\\s[^<>]*?)?>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?'+name+'\\s*>','g'))];
 return items.length===1?items[0][1]:null;
}
const single=(xml,name)=>{
 const list=matchedTags(xml,name);
 return list.length===1?list[0]:null;
};
const supported=id=>typeof id==='string'&&!/[<>&]/.test(id)&&id.length<140;
export function parseAtbReportedStops(xml,{maxActivities=4000}={}) {
 if(typeof xml!=='string'||xml.length>8_000_000||!xml.includes('VehicleMonitoringDelivery'))
  throw Error('SIRI-VM invalid or too large');
 const reports=[];let seen=0;
 for(const activity of xml.matchAll(activityRE)){
  if(++seen>maxActivities)throw Error('SIRI-VM too many activities');
  const journey=section(activity[0],'MonitoredVehicleJourney');
  const call=journey&&section(journey,'MonitoredCall');
  if(!journey||!call||single(call,'VehicleAtStop')!=='true')continue;
  const vehicleRef=single(journey,'VehicleRef'),lineRef=single(journey,'LineRef');
  const quayId=single(call,'StopPointRef'),recordedAt=single(activity[0],'RecordedAtTime');
  if(!supported(vehicleRef)||!/^ATB:Line:[\w.:-]+$/.test(lineRef||'')||
    !/^NSR:Quay:[0-9]+$/.test(quayId||'')||!recordedAt||
    !/(Z|[+-]\d\d:\d\d)$/.test(recordedAt)||!Number.isFinite(Date.parse(recordedAt)))continue;
  reports.push({source:'entur-siri-vm',vehicleRef,lineRef,quayId,
    recordedAt,vehicleAtStop:true});
 }
 return reports;
}
