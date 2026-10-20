// LOCAL QA ONLY. Synthetic PixelFrames, no provider or production API requests.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {buildSignalTestSequence} from '../worker/led-feed-worker.mjs';
import {stagingConfiguration,BUS1_GPS_BOARD} from '../deploy/staging/entry.mjs';
const root=resolve(import.meta.dirname,'..'),port=Number(process.env.TRANSITCORE_QA_PORT||8098);
let scenario='mixed',requests=0;
const origin=`http://127.0.0.1:${port}`;
const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-transitcore-stop-algorithm':'unified-bus-v1'});res.end(JSON.stringify(value));};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 // Synthetic draft responses only. Never forwards admin requests or uses credentials.
 if(req.method==='POST'&&['/v1/admin/preview','/v1/admin/signal-test'].includes(url.pathname)){
  let body='';for await(const part of req){body+=part;if(body.length>2000000){res.writeHead(413);res.end();return;}}
  const {board,hardware,physicalLed=0}=JSON.parse(body);
  const frames=buildSignalTestSequence({boardProfile:board.id,profileFingerprint:'0123456789abcdef',ledCount:hardware.leds.count,ledId:physicalLed,firstLine:{code:'1',rgb:[0,80,255]},secondLine:{code:'2',rgb:[255,160,0]}});
  if(url.pathname.endsWith('signal-test'))json(res,{frames,stepMilliseconds:[0,1000,2000,3000,4000,5000,6000,16001],testNode:{name:'LOCAL SYNTHETIC QA'}});
  else json(res,frames[0]);
  return;
 }
 if(url.pathname==='/qa'){
  const s=url.searchParams.get('scenario');if(['mixed','off','uncertain','invalid','expired','failure'].includes(s))scenario=s;
  res.setHeader('content-type','text/html; charset=utf-8');res.end(`<h1>LOCAL SYNTHETIC QA</h1><p>Scenario: ${scenario}; frame requests: ${requests}</p>`+['mixed','off','uncertain','invalid','expired','failure'].map(s=>`<p><a href="/qa?scenario=${s}">${s}</a></p>`).join(''));return;
 }
 const match=url.pathname.match(/^\/api\/v1\/frame\/([a-z0-9-]+)(\/diagnostics)?$/);
 if(match){
  const board=match[1]===BUS1_GPS_BOARD?(await stagingConfiguration(BUS1_GPS_BOARD)).board:JSON.parse(await readFile(resolve(root,'config/boards',match[1]+'.json'),'utf8'));
  const sequence=Math.floor(Date.now()/10000),generatedAt=new Date(sequence*10000-(scenario==='expired'?120000:0)).toISOString();
  if(match[2]){json(res,{boardId:board.id,sequence,generatedAt,status:'CURRENT',uncertain:scenario==='uncertain',observations:scenario==='uncertain'?[{logicalLed:0,vehicleId:'QA-ETA',source:'estimated-call',state:'OFF',confidence:'unknown',reason:'forecast-expired-no-physical-confirmation'}]:[]});return;}
  requests++;if(scenario==='failure'){json(res,{error:'synthetic-unavailable'},503);return;}
  if(scenario==='invalid'){json(res,{schemaVersion:999});return;}
  const count=board.leds.count;
  const leds=['off','uncertain'].includes(scenario)?[]:['APPROACHING','AT_STOP','PASSED','PARKED'].map((state,id)=>({id,rgb:[0,80,255],brightness:state==='PASSED'?8:32,state:['PASSED','PARKED'].includes(state)?'AT_STOP':state,...(['PASSED','PARKED'].includes(state)?{lifecycle:state}:{}),vehicle:{id:'QA-'+id,lineId:'ATB:Line:1',publicCode:'1',line:'1',routeId:board.routes[0]},occupants:[{id:'QA-'+id,line:'1',routeId:board.routes[0],state,rgb:[0,80,255]}]}));
  // Two simultaneous colors, plus a lower-priority departure which must not take over.
  for(const led of leds.slice(0,2))led.occupants.push({id:'QA-other-'+led.id,line:'2',routeId:'atb-bus-2-live',state:led.state,rgb:[255,160,0]},{id:'QA-passed-'+led.id,line:'3',state:'PASSED',rgb:[255,0,0]});
  json(res,{schemaVersion:1,boardProfile:board.id,generatedAt,sequence,ttlSeconds:30,ledCount:count,leds});return;
 }
 let path=decodeURIComponent(url.pathname);if(path.endsWith('/'))path+='index.html';
 if(!/^\/(web|config)\//.test(path)){res.writeHead(404);res.end();return;}
 const file=resolve(root,'.'+path);if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 const ext=extname(file);let body=await readFile(file);
 if(['.html','.js','.json'].includes(ext))body=body.toString().replaceAll('https://transitcore-led-feed.lgb84.workers.dev',origin).replaceAll('https://transitcore-linear-staging.lgb84.workers.dev',origin);
 res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'})[ext]||'application/octet-stream');res.end(body);
 }catch{res.writeHead(404);res.end('Local QA resource unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`Synthetic QA only: ${origin}/qa`));
