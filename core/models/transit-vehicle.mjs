import {isObject, issue, result} from './common.mjs';

/** Internal observation, not a provider adapter. Identity is (provider, id).
 * @typedef {Object} TransitVehicle
 * @property {string} id Provider-local vehicle OR journey identity; never guessed.
 * @property {string} provider Provider namespace.
 * @property {?string} [mode]
 * @property {?string} [lineId]
 * @property {?string} [publicCode]
 * @property {?string} [destination]
 * @property {?number} [latitude] Degrees, paired with longitude.
 * @property {?number} [longitude] Degrees, paired with latitude.
 * @property {?number} [heading] Degrees clockwise from north [0,360).
 * @property {?number} [speed] Metres/second, nonnegative.
 * @property {?string} [timestamp] ISO timestamp with timezone; null means unknown.
 * @property {?string} [state] Source state, not a PixelFrame state decision.
 * @property {*} [raw] Internal only; never implicitly serialized into frames/logs.
 */
export function validateTransitVehicle(value) {
  const errors=[];
  if (!isObject(value)) return result([{path:'vehicle',message:'Expected object'}]);
  for (const key of ['id','provider']) if(typeof value[key]!=='string'||!value[key].trim()) issue(errors,key,'Required nonempty string');
  for (const key of ['mode','lineId','publicCode','destination','state']) if(value[key]!=null&&typeof value[key]!=='string') issue(errors,key,'Expected string or null');
  for (const [key,min,max] of [['latitude',-90,90],['longitude',-180,180],['heading',0,360],['speed',0,Infinity]]) {
    const n=value[key];
    if(n!=null && (typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(key==='heading'&&n===360))) issue(errors,key,'Invalid numeric range');
  }
  if((value.latitude!=null)!==(value.longitude!=null)) issue(errors,'latitude/longitude','Both coordinates must be present or unknown');
  if(value.timestamp!=null&&(typeof value.timestamp!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value.timestamp)||!Number.isFinite(Date.parse(value.timestamp)))) issue(errors,'timestamp','Expected ISO timestamp with timezone or null');
  return result(errors);
}
