// Shared contract for web simulator and future ESP32 firmware.
// Only actual departure observations, no vehicle GPS/ETA-position fabrication.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitMiniModel=api;
})(globalThis,function(){
 'use strict';
 const PRESETS=Object.freeze([
  {id:'NSR:StopPlace:41613',name:'Prinsens gate (Trondheim)'},
  {id:'NSR:StopPlace:41742',name:'Trondheim S'}
 ]);
 const PROFILES=Object.freeze([
  {id:'led-32x16',name:'LED 32 × 16',kind:'led',width:32,height:16},
  {id:'led-64x32',name:'LED 64 × 32',kind:'led',width:64,height:32},
  {id:'led-64x64',name:'LED 64 × 64',kind:'led',width:64,height:64},
  {id:'led-128x64',name:'LED 128 × 64',kind:'led',width:128,height:64},
  {id:'led-128x128',name:'LED 128 × 128',kind:'led',width:128,height:128},
  {id:'lcd-128x64',name:'OLED 128 × 64',kind:'mono',width:128,height:64},
  {id:'lcd-240x135',name:'TFT 240 × 135',kind:'lcd',width:240,height:135},
  {id:'lcd-320x240',name:'TFT 320 × 240',kind:'lcd',width:320,height:240}
 ]);
 const palettes=Object.freeze({
  rgb:{bg:'#071018',fg:'#e9f4ee',accent:'#f3a33c',ok:'#64f2ac',dim:'#7a8b92',alert:'#ff7272'},
  amber:{bg:'#0b0906',fg:'#ffd68a',accent:'#ffab35',ok:'#ffbf67',dim:'#846241',alert:'#ff9272'},
  mono:{bg:'#030b08',fg:'#e6ffe9',accent:'#a4efc2',ok:'#d2ffed',dim:'#6c9983',alert:'#f3ffef'}
 });
 const validStopId=id=>typeof id==='string'&&/^NSR:StopPlace:[1-9]\d{0,8}$/.test(id);
 function profile(id,width,height){
  if(id!=='custom'){
   const p=PROFILES.find(x=>x.id===id);
   if(!p)throw Error('Ukjent skjermprofil');
   return {...p};
  }
  const w=Number(width),h=Number(height);
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<16||h<16||w>512||h>320||w*h>131072)
   throw Error('Egendefinert oppløsning må være 16–512 × 16–320, maks 131 072 piksler');
  return {id:'custom',name:'Tilpasset '+w+' × '+h,kind:'led',width:w,height:h};
 }
 function validDeparture(v){
  return v&&typeof v.line==='string'&&v.line.length>0&&v.line.length<=10&&
   typeof v.destination==='string'&&v.destination.length>0&&v.destination.length<=120&&
   typeof v.at==='string'&&Number.isFinite(Date.parse(v.at))&&
   typeof v.realtime==='boolean'&&typeof v.cancelled==='boolean';
 }
 function normalize(raw,now=Date.now()){
  if(raw?.schemaVersion!==1||typeof raw.stopId!=='string'||!validStopId(raw.stopId)||
    typeof raw.stopName!=='string'||raw.stopName.length<1||raw.stopName.length>150||
    !Array.isArray(raw.departures)||raw.departures.length>80)
   throw Error('Ugyldig avgangssvar');
  const departures=raw.departures.filter(validDeparture).map(v=>({
   line:v.line,destination:v.destination,at:new Date(v.at).toISOString(),
   realtime:v.realtime,cancelled:v.cancelled
  })).filter(v=>Date.parse(v.at)>=now-120000&&Date.parse(v.at)<now+86400000)
   .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(0,32);
  return {schemaVersion:1,stopId:raw.stopId,stopName:raw.stopName,
   source:raw.source||'unknown',checkedAt:raw.checkedAt||null,departures};
 }
 function demo(now=Date.now(),stop=PRESETS[0]){
  const template=[
   ['1','Ranheim',2,true],['2','Strindheim',5,true],['3','Hallset',7,true],
   ['1','Kattem',12,false],['10','Sæterbakken',16,true],['20','Romolslia',21,false],
   ['12','Dragvoll',27,true],['75','Spongdal',33,false],['2','Lund',39,true],
   ['22','Vestlia',45,false]
  ];
  return {schemaVersion:1,stopId:stop.id,stopName:stop.name,
   source:'DEMO',checkedAt:new Date(now).toISOString(),
   departures:template.map(([line,destination,minutes,realtime])=>({
    line,destination,at:new Date(now+minutes*60000).toISOString(),
    realtime,cancelled:false
   }))};
 }
 // Available selectors are derived only from the currently loaded departure board.
 function filterChoices(board){
  const entries=Array.isArray(board?.departures)?board.departures:[];
  const lines=[...new Set(entries.filter(v=>!v.cancelled).map(v=>v.line))]
   .sort((a,b)=>a.localeCompare(b,'nb',{numeric:true}));
  return {lines, destinations:[...new Set(entries.filter(v=>!v.cancelled).map(v=>v.destination))]
    .sort((a,b)=>a.localeCompare(b,'nb'))};
 }
 function filterBoard(board,{lines=null,destination=''}={}){
  if(!board||!Array.isArray(board.departures))throw Error('Mangler avganger');
  if(lines!==null&&!(lines instanceof Set)&&!Array.isArray(lines))
    throw Error('Ugyldig linjefilter');
  const selected=lines===null?null:new Set(lines);
  return {...board,departures:board.departures.filter(v=>
   (selected===null||selected.has(v.line))&&(!destination||v.destination===destination))};
 }
 function mins(at,now=Date.now()){
  const delta=Date.parse(at)-now;
  return Number.isFinite(delta)?Math.max(0,Math.ceil(delta/60000)):null;
 }
 function formatClock(at){
  const date=new Date(at);
  return Number.isFinite(date.getTime())?
   new Intl.DateTimeFormat('nb-NO',{hour:'2-digit',minute:'2-digit',
    timeZone:'Europe/Oslo',hourCycle:'h23'}).format(date):'--:--';
 }
 function labelTime(v,now){
  if(v.cancelled)return 'INNST.';
  const m=mins(v.at,now);
  return m===null?'--':m===0?'NÅ':m<=99?String(m)+'m':formatClock(v.at);
 }
 function geometry(p){
  const small=p.width<48||p.height<24;
  const isTall=p.height>=p.width*.8;
  const header=p.height>=32?Math.max(8,Math.floor(p.height*.17)):0;
  const footer=p.height>=56?Math.max(8,Math.floor(p.height*.13)):0;
  const rowHeight=p.kind==='lcd'?Math.max(14,Math.floor(p.height*.145)):
   p.width<=64?9:p.height<=32?10:Math.max(10,Math.floor(p.height*.15));
  const rows=Math.max(1,Math.min(10,Math.floor((p.height-header-footer)/rowHeight)));
  const fontSize=p.kind==='lcd'?Math.max(11,Math.min(28,Math.floor(rowHeight*.7))):
    small?6:Math.min(18,Math.max(7,Math.floor(rowHeight*.72)));
  return {header,footer,rowHeight,rows,fontSize,compact:small,isTall};
 }
 return {PROFILES,PRESETS,palettes,validStopId,profile,validDeparture,normalize,demo,
  mins,formatClock,labelTime,geometry,filterChoices,filterBoard};
});
