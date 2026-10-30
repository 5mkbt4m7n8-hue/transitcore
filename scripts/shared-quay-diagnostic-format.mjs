// Strict allowlist for public, per-event live diagnostics. Never serialize the
// source vehicle object, raw SIRI XML, trip identifiers or GPS coordinates.
const quays=new Map([
 ['NSR:Quay:102733','Tonstadkrysset'],
 ['NSR:Quay:102721','Østre Lund']
]);
const direction=new Set(['inbound','outbound','unknown']);
const role=new Set(['origin','intermediate','terminus','unknown']);
const reference=new Set(['unique','missing','conflicting','unsupported']);
const lookup=new Set(['verified','not-found','not-queried','budget-exhausted','unverified']);
const gps=new Set(['found','missing','not-checked']);
const match=new Set(['matched','unresolved','not-checked']);
const gate=new Set(['accepted','rejected','not-checked']);
const headsign=new Set(['Ranheim','Østre Lund','Tillerterminalen','Strindheim','Kattem','other','unknown']);
const publicReason=/^[a-z][a-z0-9-]{0,72}$/;
const select=(value,allowed,unknown)=>allowed.has(value)?value:unknown;
const integer=value=>Number.isSafeInteger(value)&&value>=0&&value<=10000?value:null;
const time=value=>{
 if(typeof value!=='string'||!/(?:Z|[+-]\d\d:\d\d)$/.test(value))return null;
 const epoch=Date.parse(value);
 return Number.isFinite(epoch)?new Date(epoch).toISOString():null;
};
export function publicSharedQuayEvent(fields={}){
 if(!quays.has(fields.quayId))throw Error('Unapproved diagnostic Quay');
 return Object.freeze({
  eventNumber:integer(fields.eventNumber),
  poll:integer(fields.poll),
  quayId:fields.quayId,
  quayName:quays.get(fields.quayId),
  siriRecordedAtUtc:time(fields.siriRecordedAtUtc),
  siriTripReference:select(fields.siriTripReference,reference,'missing'),
  gpsVehicleIdMatch:select(fields.gpsVehicleIdMatch,gps,'not-checked'),
  serviceJourneyLookup:select(fields.serviceJourneyLookup,lookup,'not-queried'),
  sourceDirection:select(fields.sourceDirection,direction,'unknown'),
  sourceQuayRole:select(fields.sourceQuayRole,role,'unknown'),
  sourceQuayOnTrip:fields.sourceQuayOnTrip===true,
  siriGpsTimeAndIdentity:select(fields.siriGpsTimeAndIdentity,match,'not-checked'),
  destination:select(fields.destination,headsign,'unknown'),
  currentStopGate:select(fields.currentStopGate,gate,'not-checked'),
  reason:typeof fields.reason==='string'&&publicReason.test(fields.reason)?
   fields.reason:'unavailable'
 });
}
export function publicNearbyGpsCounts({quayId,nearby,ranheimBound}={}){
 if(!quays.has(quayId))throw Error('Unapproved diagnostic Quay');
 return Object.freeze({quayId,nearby:integer(nearby),ranheimBound:integer(ranheimBound),
  warning:'GPS proximity alone does not confirm physical stop occupancy'});
}
