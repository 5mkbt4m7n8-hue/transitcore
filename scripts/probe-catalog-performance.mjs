// Read-only public production probe. Never emits frames or vehicle/GPS data.
const origin='https://transitcore-led-feed.lgb84.workers.dev';
const samples=[];
for(let i=0;i<5;i++) {
  const at=Date.now();
  try {
    const response=await fetch(origin+'/api/v1/frame/trondheim-city-lines-catalog',{
      headers:{origin:'https://5mkbt4m7n8-hue.github.io'},signal:AbortSignal.timeout(15000)});
    const body=await response.text();let frame;try{frame=JSON.parse(body)}catch{}
    const ageSeconds=frame?.generatedAt?(Date.now()-Date.parse(frame.generatedAt))/1000:null;
    samples.push({at:new Date(at).toISOString(),status:response.status,
      cors:response.headers.get('access-control-allow-origin'),wallMs:Date.now()-at,
      ledCount:frame?.ledCount,ageSeconds,ttlSeconds:frame?.ttlSeconds,
      fresh:ageSeconds!==null&&ageSeconds>=-5&&ageSeconds<=frame.ttlSeconds,
      resourceLimit1102:/\b1102\b|exceeded resource limits/i.test(body)});
  }catch(error){samples.push({at:new Date(at).toISOString(),error:error.name,wallMs:Date.now()-at});}
  if(i<4)await new Promise(resolve=>setTimeout(resolve,2000));
}
const history=await fetch(origin+'/v1/trondheim/history',{signal:AbortSignal.timeout(15000)});
let historyBody;try{historyBody=await history.json()}catch{}
let historyPageStatus=null,historyRecordCount=null;
const day=historyBody?.days?.[0]?.day;
if(day){const page=await fetch(origin+'/v1/trondheim/history?day='+encodeURIComponent(day)+'&limit=2',{
  signal:AbortSignal.timeout(15000)});historyPageStatus=page.status;
  const body=await page.json();historyRecordCount=body.records?.length??null;}
console.log(JSON.stringify({samples,historyStatus:history.status,historyPageStatus,historyRecordCount,
  note:'Unchanged production observation; no deployment or Cloudflare CPU/memory telemetry.'},null,2));
