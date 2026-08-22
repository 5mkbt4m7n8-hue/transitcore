import assert from "node:assert/strict";
import { decodeMtaLine7, MTA_LINE7_STATIONS } from "./mta-line7.mjs";

const varint = value => { const out=[]; do { let byte=value&127; value=Math.floor(value/128); if(value)byte|=128; out.push(byte); } while(value); return out; };
const field = (number,value) => [...varint(number*8+2),...varint(value.length),...value];
const string = (number,value) => field(number,[...new TextEncoder().encode(value)]);
const scalar = (number,value) => [...varint(number*8),...varint(value)];
const now = 1_700_000_000_000;
const event = scalar(2,Math.floor(now/1000)+120);
const stop = [...string(4,"701N"),...field(2,event)];
const trip = [...string(1,"test-trip"),...string(5,"7")];
const update = [...field(1,trip),...field(2,stop)];
const entity = field(3,update);
const feed = new Uint8Array(field(2,entity));

assert.equal(MTA_LINE7_STATIONS.length,22);
assert.deepEqual(decodeMtaLine7(feed,now),[{tripId:"test-trip",routeId:"7",stopId:"701N",stationId:"701",direction:"N",etaSeconds:120,arrivalTime:"2023-11-14T22:15:20.000Z"}]);
console.log("MTA line 7 decoder tests passed");
