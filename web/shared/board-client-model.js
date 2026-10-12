(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;root.TransitCoreBoardClient=api;})(globalThis,function(){
  'use strict';
  const ranks={OFF:0,PASSED:1,APPROACHING:2,AT_STOP:3,PARKED:4};
  const defaults={pulsePeriodMs:1800,pulseMinBrightness:0,pulseMaxBrightness:255,backgroundBrightness:9};
  const byte=x=>Number.isInteger(x)&&x>=0&&x<=255;
  const rgb=x=>Array.isArray(x)&&x.length===3&&x.every(byte);
  const state=x=>x.lifecycle==='PASSED'||x.lifecycle==='PARKED'?x.lifecycle:x.state;
  function visualPulse(millis,settings={}){
    const v={...defaults,...settings};v.pulsePeriodMs=Math.max(1000,Math.min(5000,v.pulsePeriodMs));
    v.pulseMinBrightness=Math.min(v.pulseMinBrightness,v.pulseMaxBrightness);
    const half=Math.floor(v.pulsePeriodMs/2),phase=(millis>>>0)%v.pulsePeriodMs;
    return v.pulseMinBrightness+Math.floor((phase<half?phase:v.pulsePeriodMs-phase)*(v.pulseMaxBrightness-v.pulseMinBrightness)/half);
  }
  function create({boardProfile,ledCount,visual={}}){
    let frame=null,acceptedAt=0,ttlMs=0,lastError=null;
    const changes=new Map();
    return {
      failed(message){lastError=String(message);},
      accept(input,now,millis){
        const reject=message=>(lastError=message,false);
        if(input?.schemaVersion!==1||input.boardProfile!==boardProfile||input.ledCount!==ledCount)return reject('profile/schema/count mismatch');
        const revision=input.profileRevision||0,fingerprint=input.profileFingerprint||'';
        if(Boolean(revision>0)!==Boolean(fingerprint.length)||fingerprint.length&&fingerprint.length!==16)return reject('profile identity');
        if(input.signalPolicy && (input.signalPolicy.version!==1||input.signalPolicy.approachPulseMs!==1800))return reject('signal policy');
        if(now<1577836800000)return reject('UTC clock not synchronized');
        const generated=Date.parse(input.generatedAt),age=Math.floor(now/1000)-Math.floor(generated/1000);
        if(!Number.isFinite(generated)||!Number.isInteger(input.sequence)||input.sequence<=0||!Number.isInteger(input.ttlSeconds)||input.ttlSeconds<10||input.ttlSeconds>300||age>input.ttlSeconds||age < -15)return reject('invalid time/sequence/TTL');
        if(frame&&input.sequence<frame.sequence)return reject('older sequence');
        if(!Array.isArray(input.leds)||input.leds.length>ledCount)return reject('LED array');
        const seen=new Set();
        for(const led of input.leds){if(!Number.isInteger(led.id)||led.id<0||led.id>=ledCount||seen.has(led.id)||!rgb(led.rgb)||!byte(led.brightness)||!Number.isInteger(ranks[state(led)])||ranks[state(led)]<=0)return reject('invalid LED');seen.add(led.id);}
        const before=this.sample(now,millis);
        frame=JSON.parse(JSON.stringify(input));acceptedAt=millis>>>0;ttlMs=(input.ttlSeconds-Math.max(0,age))*1000;lastError=null;
        const after=this.sample(now,millis);
        for(let i=0;i<ledCount;i++)if(before.leds[i].state!==after.leds[i].state||JSON.stringify(before.leds[i].vehicleIds)!==JSON.stringify(after.leds[i].vehicleIds))changes.set(i,new Date(now).toISOString());
        return true;
      },
      sample(now,millis,{ambient=false,masterPercent=100}={}){
        const expired=frame && ((millis-acceptedAt)>>>0)>ttlMs;
        const pulse=visualPulse(millis,visual),byId=new Map((frame&&!expired?frame.leds:[]).map(l=>[l.id,l]));
        const leds=Array.from({length:ledCount},(_,id)=>{
          const led=byId.get(id),s=led?state(led):'OFF';
          // ESP filters occupants to the frame LED's state, maximum four colours.
          const occupants=(led?.occupants||[]).filter(o=>rgb(o.rgb)&&ranks[o.state]===ranks[s]).slice(0,4);
          const vehicleIds=[...new Set([led?.vehicle?.id,...occupants.map(o=>o.id)].filter(Boolean))];
          const selected=occupants.length?occupants[Math.floor((millis>>>0)/1200)%occupants.length].id:led?.vehicle?.id;
          const level=s==='APPROACHING'?pulse:255;
          const brightness=led?led.brightness:ambient?Math.min(32,visual.backgroundBrightness??9):0;
          const logicalLevel=Math.floor(brightness*level*masterPercent/(255*100));
          if(expired&&changes.get(id)&&led===undefined && frame.leds.some(l=>l.id===id)) {
            const at=new Date(now-(((millis-acceptedAt)>>>0)-ttlMs)).toISOString();
            if(changes.get(id)<at)changes.set(id,at);
          }
          return {id,state:s,vehicleIds,selectedVehicle:selected||null,logicalLevel,changedAt:changes.get(id)||null};
        });
        return {sequence:frame?.sequence??null,generatedAt:frame?.generatedAt??null,ageSeconds:frame?Math.max(0,(now-Date.parse(frame.generatedAt))/1000):null,
          status:!frame?'NO_FRAME':expired?'EXPIRED':lastError?'LAST_VALID':'VALID',error:lastError,leds};
      }
    };
  }
  return {create,visualPulse};
});
