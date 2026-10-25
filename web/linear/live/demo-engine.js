// DEMO ONLY: deterministic movement along the saved route geometry.
// Never query GPS, never derive positions from ETA, never use or persist vehicle IDs.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitDemoEngine=api;
})(globalThis,function(){
 'use strict';
 const SPEED_MPS=25/3.6; // visual demonstration, not a bus timetable or speed report
 function distance(a,b){
  const rad=Math.PI/180,lat1=a[0]*rad,lat2=b[0]*rad;
  const dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;
  const q=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(q)));
 }
 function track(points){
  if(!Array.isArray(points)||points.length<2||points.length>10000||
   !points.every(p=>Array.isArray(p)&&p.length===2&&
    Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=63&&p[0]<=63.75&&
    p[1]>=9.9&&p[1]<=11.3))throw Error('Ugyldig DEMO-trasé');
  const cum=[0];
  for(let i=1;i<points.length;i++)cum.push(cum[i-1]+distance(points[i-1],points[i]));
  const length=cum.at(-1);
  if(length<20||!Number.isFinite(length))throw Error('DEMO-ruten er for kort');
  return {points,cum,length};
 }
 function positionAt(t,metres){
  const clamped=Math.max(0,Math.min(t.length,metres));
  let low=1,high=t.cum.length-1;
  while(low<high){
   const middle=(low+high)>>1;
   if(t.cum[middle]<clamped)low=middle+1;else high=middle;
  }
  const i=low,span=t.cum[i]-t.cum[i-1],fraction=span>0?
   (clamped-t.cum[i-1])/span:0;
  const a=t.points[i-1],b=t.points[i];
  return [a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];
 }
 function pingpong(value,length){
  const n=((value%(2*length))+(2*length))%(2*length);
  return n<=length?n:2*length-n;
 }
 function positionsOnTrack(code,t,elapsedSeconds,speedFactor=1){
  if(typeof code!=='string'||!t?.length||!Number.isFinite(elapsedSeconds)||elapsedSeconds<0||
     ![0.5,1,2,4].includes(speedFactor))throw Error('Ugyldig simulasjonstid eller hastighet');
  const metres=SPEED_MPS*speedFactor*elapsedSeconds;
  return [0,1].map(index=>{
   const phase=(index===0?0.12:1.17)*t.length+metres;
   const pos=positionAt(t,pingpong(phase,t.length));
   return {id:'demo:'+code+':'+index,line:code,latitude:pos[0],
    longitude:pos[1],source:'DEMO',label:'DEMO – SIMULERT',
    direction:index===0?'A':'B'};
  });
 }
 function positions(route,elapsedSeconds,speedFactor=1){
  if(!route||typeof route.line!=='string'||!Array.isArray(route.route))throw Error('Mangler DEMO-rute');
  return positionsOnTrack(route.line,track(route.route),elapsedSeconds,speedFactor);
 }
 return {track,positionAt,pingpong,positions,positionsOnTrack,SPEED_MPS};
});
