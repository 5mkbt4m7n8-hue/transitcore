import {fetchMiniDepartures} from '../worker/mini-departures.mjs';
const id='NSR:StopPlace:41613';
try{
 const board=await fetchMiniDepartures(id);
 console.log(JSON.stringify({status:'ok',stopId:board.stopId,stopName:board.stopName,
  departureCount:board.departures.length,realtimeCount:board.departures.filter(x=>x.realtime).length,
  cancelledCount:board.departures.filter(x=>x.cancelled).length}));
}catch(error){
 console.error('Entur live schema/network probe:',error?.message||String(error));
 process.exitCode=1;
}
