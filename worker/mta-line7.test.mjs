import assert from "node:assert/strict";
import { decodeMtaLine7, MTA_LINE7_STATIONS } from "./mta-line7.mjs";

const varint = value => { const out=[]; do { let byte=value&127; value=Math.floor(value/128); if(value)byte|=128; out.push(byte); } while(value); return out; };
const field = (number,value) => [...varint(number*8+2),...varint(value.length),...value];
const string = (number,value) => field(number,[...new TextEncoder().encode(value)]);
const scalar = (number,value) => [...varint(number*8),...varint(value)];
const now = 1_700_000_000_000;
const stop = (id,seconds) => [...string(4,id),...field(2,scalar(2,Math.floor(now/1000)+seconds))];
const entity = (tripId,direction,stops) => field(3,[
  ...field(1,[...string(1,tripId),...string(5,"7")]),
  ...stops.flatMap(([id,seconds])=>field(2,stop(id+direction,seconds)))
]);
const feed = new Uint8Array([
  ...field(2,entity("north-trip","N",[["716",-10],["715",50],["714",110]])),
  ...field(2,entity("south-trip","S",[["705",5],["706",65],["707",125]]))
]);

assert.equal(MTA_LINE7_STATIONS.length,22);
assert.deepEqual(decodeMtaLine7(feed,now),[
  {tripId:"north-trip",routeId:"7",stopId:"716N",stationId:"716",direction:"N",etaSeconds:-10,arrivalTime:"2023-11-14T22:13:10.000Z"},
  {tripId:"south-trip",routeId:"7",stopId:"705S",stationId:"705",direction:"S",etaSeconds:5,arrivalTime:"2023-11-14T22:13:25.000Z"}
]);
console.log("MTA line 7 decoder tests passed");
