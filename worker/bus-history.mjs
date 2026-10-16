// New rollout storage only; existing Bus1 motion-v1 storage is untouched.
const PREFIX='unifiedBusV1:',CHARS=12000,MAX_CHUNKS=128;
export async function readBusHistory(storage){
 const meta=await storage.get(PREFIX+'meta');if(!meta)return null;
 if(!Number.isInteger(meta.chunks)||meta.chunks<1||meta.chunks>MAX_CHUNKS)throw Error('Invalid history manifest');
 const chunks=[];for(let i=0;i<meta.chunks;i++){
  const value=await storage.get(PREFIX+i);if(typeof value!=='string')throw Error('Incomplete bus history');chunks.push(value);
 }
 return JSON.parse(chunks.join(''));
}
export async function writeBusHistory(storage,value){
 const text=JSON.stringify(value),count=Math.ceil(text.length/CHARS);
 if(count>MAX_CHUNKS)throw Error('Bus history capacity exceeded');
 if(typeof storage.transaction!=='function')throw Error('Transactional bus storage required');
 await storage.transaction(async tx=>{
  const old=await tx.get(PREFIX+'meta'),updates={[PREFIX+'meta']:{chunks:count}};
  for(let i=0;i<count;i++)updates[PREFIX+i]=text.slice(i*CHARS,(i+1)*CHARS);
  await tx.put(updates);
  for(let i=count;i<(old?.chunks||0);i++)await tx.delete(PREFIX+i);
 });
}
