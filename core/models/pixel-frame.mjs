import {isObject,isId,positiveInteger,byte,STATES,issue,result} from './common.mjs';
/** @typedef {Object} PixelFrame
 * @property {1} schemaVersion Wire format remains v1.
 * @property {string} boardProfile
 * @property {string} generatedAt ISO timestamp with timezone.
 * @property {number} sequence Unsigned 32-bit sequence.
 * @property {number} ttlSeconds 10..300 for Universal BoardClient 1.2.13.
 * @property {number} ledCount Frame count, not physical strip allocation.
 * @property {Array<{id:number,rgb:number[],brightness:number,state:string,vehicle?:Object,occupants?:Array,metadata?:Object}>} leds
 */
export function validatePixelFrame(frame,{expectedBoardProfile,expectedLedCount,now}={}) {
  const errors=[];
  const check=(ok,path,msg)=>{if(!ok)issue(errors,path,msg);};
  if(!isObject(frame))return result([{path:'frame',message:'Expected object'}]);
  check(frame.schemaVersion===1,'schemaVersion','Expected PixelFrame v1');
  check(isId(frame.boardProfile)&&(expectedBoardProfile===undefined||frame.boardProfile===expectedBoardProfile),'boardProfile','Invalid or unexpected board identity');
  check(positiveInteger(frame.ledCount)&&(expectedLedCount===undefined||frame.ledCount===expectedLedCount),'ledCount','Invalid or unexpected LED count');
  check(Number.isInteger(frame.sequence)&&frame.sequence>=0&&frame.sequence<=0xffffffff,'sequence','Expected uint32');
  check(Number.isInteger(frame.ttlSeconds)&&frame.ttlSeconds>=10&&frame.ttlSeconds<=300,'ttlSeconds','Client 1.2.13 requires 10..300 seconds');
  const time=typeof frame.generatedAt==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(frame.generatedAt)?Date.parse(frame.generatedAt):NaN;
  check(Number.isFinite(time),'generatedAt','Expected timestamp with timezone');
  if(now!==undefined){check(Number.isFinite(now),'now','Expected epoch milliseconds');check(!(now-time>frame.ttlSeconds*1000),'generatedAt','Frame is stale');}
  check(Array.isArray(frame.leds),'leds','Expected array');
  const seen=new Set();
  for(const [i,led] of (Array.isArray(frame.leds)?frame.leds:[]).entries()){
    const path=`leds[${i}]`;
    if(!isObject(led)){issue(errors,path,'Expected object');continue;}
    check(Number.isInteger(led.id)&&led.id>=0&&led.id<frame.ledCount&&!seen.has(led.id),path+'.id','Duplicate or out-of-range LED');seen.add(led.id);
    check(Array.isArray(led.rgb)&&led.rgb.length===3&&led.rgb.every(byte),path+'.rgb','Expected three integer channels 0..255');
    check(byte(led.brightness),path+'.brightness','Expected integer 0..255');
    check(STATES.includes(led.state),path+'.state','Unsupported LED state');
    if(led.lifecycle!=null)check(['PASSED','PARKED'].includes(led.lifecycle),path+'.lifecycle','Unsupported lifecycle');
    for(const field of ['vehicle','metadata'])if(led[field]!=null)check(isObject(led[field]),path+'.'+field,'Expected object');
    if(led.occupants!=null){
      check(Array.isArray(led.occupants),path+'.occupants','Expected array');
      if(Array.isArray(led.occupants))led.occupants.forEach((o,j)=>check(isObject(o)&&STATES.includes(o.state)&&Array.isArray(o.rgb)&&o.rgb.length===3&&o.rgb.every(byte),`${path}.occupants[${j}]`,'Invalid occupant state/RGB'));
    }
  }
  return result(errors);
}
