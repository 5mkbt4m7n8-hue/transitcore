import {ProviderError} from '../provider-contract.mjs';
import {normalizeEnturVehicle} from './entur-normalizer.mjs';

// One instance per Worker isolate. Preserve endpoint|codespace cache sharing.
export function createEnturProvider({fetchJson,clientName,clock=Date.now,ttlMs=8000}) {
  const cache=new Map();
  return {
    async loadVehicles({endpoint,codespaceId}) {
      const key=`${endpoint}|${codespaceId}`,now=clock(),cached=cache.get(key);
      if(cached?.value && now-cached.loadedAt<ttlMs)return cached.value;
      if(cached?.pending)return cached.pending;
      const query=`{vehicles(codespaceId:"${codespaceId}"){vehicleId lastUpdated destinationName line{publicCode} location{latitude longitude}}}`;
      const pending=fetchJson(endpoint,{method:'POST',headers:{'Content-Type':'application/json','ET-Client-Name':clientName},body:JSON.stringify({query})})
        .then(data=>{
          if(data.errors?.length)throw Error(data.errors[0].message);
          if(!Array.isArray(data.data?.vehicles))throw Error('Invalid vehicle response: missing vehicles array');
          const value=data.data.vehicles.map(normalizeEnturVehicle);
          cache.set(key,{loadedAt:clock(),value});return value;
        }).catch(error=>{
          if(cache.get(key)?.pending===pending)cache.delete(key);
          throw new ProviderError(error.message,{provider:'entur',code:error.code||'PROVIDER_ERROR',cause:error});
        });
      cache.set(key,{loadedAt:0,pending});return pending;
    }
  };
}
